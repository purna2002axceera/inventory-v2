const { ValidationError, NotFoundError, InsufficientStockError, ConflictError } = require('../errors');
const { wrapHandler } = require('./wrap');
const { runTransaction } = require('../db/connection');

function generateSoNumber(db) {
  const row = db
    .prepare("SELECT MAX(CAST(SUBSTR(so_number, 4) AS INTEGER)) AS max_seq FROM sales_orders WHERE so_number LIKE 'SO-%'")
    .get();

  const nextSeq = (row?.max_seq || 0) + 1;
  return `SO-${String(nextSeq).padStart(6, '0')}`;
}

// FIFO auto-resolution — used when a line doesn't specify a batchId.
function resolveFifo(db, itemId, quantityNeeded) {
  const batches = db
    .prepare(
      `SELECT batch_id, quantity_left
       FROM batches
       WHERE item_id = ? AND quantity_left > 0
       ORDER BY production_date ASC, batch_id ASC`
    )
    .all(itemId);

  const draws = [];
  let remaining = quantityNeeded;

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity_left, remaining);
    draws.push({ batchId: batch.batch_id, quantity: take });
    remaining -= take;
  }

  if (remaining > 0) {
    const available = quantityNeeded - remaining;
    throw new InsufficientStockError(
      `Insufficient stock for item ${itemId}: requested ${quantityNeeded}, only ${available} available.`
    );
  }

  return draws;
}

// Manual batch selection — exactly one batch, no splitting.
function resolveManualBatch(db, itemId, batchId, quantityNeeded) {
  const batch = db.prepare('SELECT * FROM batches WHERE batch_id = ?').get(batchId);
  if (!batch) throw new NotFoundError(`Selected batch ${batchId} not found.`);
  if (batch.item_id !== itemId) {
    throw new ValidationError(`Selected batch does not belong to item ${itemId}.`);
  }
  if (batch.quantity_left < quantityNeeded) {
    throw new InsufficientStockError(
      `Insufficient stock in selected batch (${batch.batch_ref}): requested ${quantityNeeded}, only ${batch.quantity_left} available in this batch.`
    );
  }

  return [{ batchId: batch.batch_id, quantity: quantityNeeded }];
}

function registerSalesOrdersHandlers(ipcMain, getDb) {
  ipcMain.handle(
    'salesOrders:create',
    wrapHandler(({ customerId, orderDate, lines }) => {
      if (!customerId) throw new ValidationError('Customer is required.');
      if (!orderDate) throw new ValidationError('Order date is required.');
      if (!Array.isArray(lines) || lines.length === 0) {
        throw new ValidationError('At least one order line is required.');
      }

      for (const line of lines) {
        if (!line.itemId) throw new ValidationError('Each line must have an item.');
        if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
          throw new ValidationError('Each line quantity must be a positive whole number.');
        }
      }

      // Merge lines that share the same item + batch selection.
      // Two AUTO lines for the same item become one FIFO draw with combined qty,
      // preventing the bug where both independently resolve against stale DB state.
      // Two manual lines for the same item + same batch are combined too.
      const mergedMap = new Map();
      for (const line of lines) {
        const key = `${line.itemId}:${line.batchId || 'AUTO'}`;
        if (mergedMap.has(key)) {
          mergedMap.get(key).quantity += line.quantity;
        } else {
          mergedMap.set(key, { itemId: line.itemId, batchId: line.batchId, quantity: line.quantity });
        }
      }
      const mergedLines = Array.from(mergedMap.values());

      const db = getDb();

      const customer = db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(customerId);
      if (!customer) throw new NotFoundError('Customer not found.');

      // Resolve every merged line FIRST (read-only) so any failure throws before writing anything.
      const resolvedLines = mergedLines.map((line) => {
        const item = db.prepare('SELECT * FROM items WHERE item_id = ? AND is_active = 1').get(line.itemId);
        if (!item) throw new NotFoundError(`Item ${line.itemId} not found or is archived.`);

        const draws = line.batchId
          ? resolveManualBatch(db, line.itemId, line.batchId, line.quantity)
          : resolveFifo(db, line.itemId, line.quantity);

        return { 
          itemId: line.itemId, 
          quantity: line.quantity, 
          unitCost: item.unit_cost,
          unitPrice: item.unit_price,
          draws 
        };
      });

      return runTransaction(db, () => {
        const soNumber = generateSoNumber(db);

        const soResult = db
          .prepare(`INSERT INTO sales_orders (so_number, customer_id, order_date, status) VALUES (?, ?, ?, 'COMPLETED')`)
          .run(soNumber, customerId, orderDate);

        const soId = soResult.lastInsertRowid;

        // Insert all sales_order_items rows and decrement batch quantities.
        // Price and cost are snapshotted from the item at the time of sale.
        for (const resolved of resolvedLines) {
          for (const draw of resolved.draws) {
            db.prepare(
              `INSERT INTO sales_order_items (so_id, item_id, batch_id, quantity, unit_cost, unit_price) VALUES (?, ?, ?, ?, ?, ?)`
            ).run(soId, resolved.itemId, draw.batchId, draw.quantity, resolved.unitCost, resolved.unitPrice);

            db.prepare('UPDATE batches SET quantity_left = quantity_left - ? WHERE batch_id = ?').run(
              draw.quantity,
              draw.batchId
            );
          }
        }

        // Aggregate total drawn per item, then update stock ONCE per item.
        // This fixes the bug where two lines for the same item would each
        // compute newStock from the original stock_count, overwriting each other.
        const perItemDrawn = new Map();
        for (const resolved of resolvedLines) {
          const totalDrawn = resolved.draws.reduce((sum, d) => sum + d.quantity, 0);
          perItemDrawn.set(resolved.itemId, (perItemDrawn.get(resolved.itemId) || 0) + totalDrawn);
        }

        const lineResults = [];
        for (const [itemId, totalDrawn] of perItemDrawn) {
          const item = db.prepare('SELECT * FROM items WHERE item_id = ?').get(itemId);
          const newStock = item.stock_count - totalDrawn;
          db.prepare("UPDATE items SET stock_count = ?, updated_at = datetime('now') WHERE item_id = ?").run(
            newStock,
            itemId
          );

          db.prepare(
            `INSERT INTO stock_ledger (item_id, change_type, quantity_change, resulting_stock, reference_type, reference_id, note)
             VALUES (?, 'SALE', ?, ?, 'SALES_ORDER', ?, ?)`
          ).run(itemId, -totalDrawn, newStock, soId, `Sold via ${soNumber}`);

          lineResults.push({ itemId, quantity: totalDrawn });
        }

        return { soId, soNumber, customerId, orderDate, lines: lineResults };
      });
    })
  );

  ipcMain.handle(
    'salesOrders:list',
    wrapHandler(({ page = 1, pageSize = 50, customerId, dateFrom, dateTo, search } = {}) => {
      const db = getDb();
      const safePageSize = Math.min(pageSize || 50, 200);
      const safePage = Math.max(page || 1, 1);
      const offset = (safePage - 1) * safePageSize;

      console.log(`BACKEND -> Received salesOrders:list request for page ${safePage}, search: ${search || 'none'}`);

      const conditions = ['1=1'];
      const params = [];

      if (customerId) {
        conditions.push('so.customer_id = ?');
        params.push(customerId);
      }
      if (dateFrom) {
        conditions.push('so.order_date >= ?');
        params.push(dateFrom);
      }
      if (dateTo) {
        conditions.push('so.order_date <= ?');
        params.push(dateTo);
      }

      if (search) {
        conditions.push('(so.so_number LIKE ? OR c.name LIKE ?)');
        const term = `%${search}%`;
        params.push(term, term);
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      const totalRow = db.prepare(`SELECT COUNT(*) as count FROM sales_orders so JOIN customers c ON c.customer_id = so.customer_id ${whereClause}`).get(...params);

      const orders = db
        .prepare(
          `SELECT so.*, c.name AS customer_name,
            (SELECT COALESCE(SUM(soi.quantity * soi.unit_price), 0) FROM sales_order_items soi WHERE soi.so_id = so.so_id) AS total_amount
           FROM sales_orders so
           JOIN customers c ON c.customer_id = so.customer_id
           ${whereClause}
           ORDER BY so.order_date DESC, so.so_id DESC
           LIMIT ? OFFSET ?`
        )
        .all(...params, safePageSize, offset);

      return { orders, total: totalRow.count, page: safePage, pageSize: safePageSize };
    })
  );

  ipcMain.handle(
    'salesOrders:get',
    wrapHandler(({ soId }) => {
      const db = getDb();
      const order = db
        .prepare(
          `SELECT so.*, c.name AS customer_name, c.phone AS customer_phone
           FROM sales_orders so JOIN customers c ON c.customer_id = so.customer_id
           WHERE so.so_id = ?`
        )
        .get(soId);
      if (!order) throw new NotFoundError('Sales order not found.');

      const items = db
        .prepare(
          `SELECT soi.*, i.name AS item_name, i.sku AS item_sku, b.batch_ref
           FROM sales_order_items soi
           JOIN items i ON i.item_id = soi.item_id
           JOIN batches b ON b.batch_id = soi.batch_id
           WHERE soi.so_id = ?
           ORDER BY soi.soi_id ASC`
        )
        .all(soId);

      return { ...order, items };
    })
  );
  ipcMain.handle(
    'salesOrders:report',
    wrapHandler(({ dateFrom, dateTo, reportType = 'summary' }) => {
      if (!dateFrom || !dateTo) throw new ValidationError('Date range is required.');
      const db = getDb();

      if (reportType === 'detailed') {
        const ordersRows = db.prepare(`
          SELECT so.*, c.name AS customer_name,
            (SELECT COALESCE(SUM(soi.quantity * soi.unit_price), 0) FROM sales_order_items soi WHERE soi.so_id = so.so_id) AS total_amount
          FROM sales_orders so
          JOIN customers c ON c.customer_id = so.customer_id
          WHERE so.order_date >= ? AND so.order_date <= ?
          ORDER BY so.order_date DESC, so.so_id DESC
        `).all(dateFrom, dateTo);

        let totalRevenue = 0;
        const orders = [];

        for (const o of ordersRows) {
           const lines = db.prepare(`
             SELECT soi.*, i.name AS item_name, i.sku AS item_sku
             FROM sales_order_items soi
             JOIN items i ON i.item_id = soi.item_id
             WHERE soi.so_id = ?
             ORDER BY soi.soi_id ASC
           `).all(o.so_id).map(l => ({
             itemName: l.item_name,
             itemSku: l.item_sku,
             quantity: l.quantity,
             unitPrice: l.unit_price,
             totalPrice: l.quantity * l.unit_price
           }));
           
           orders.push({
             soNumber: o.so_number,
             customerName: o.customer_name,
             orderDate: o.order_date,
             status: o.status,
             totalAmount: o.total_amount,
             lines
           });
           
           if (o.status === 'COMPLETED') {
             totalRevenue += o.total_amount;
           }
        }

        return {
          type: 'detailed',
          dateFrom,
          dateTo,
          orders,
          totalRevenue
        };
      }


      // Get the aggregated sales for the date range
      const sales = db
        .prepare(
          `SELECT 
             i.item_id,
             i.sku,
             i.name,
             SUM(soi.quantity) as total_quantity,
             SUM(soi.quantity * soi.unit_price) as total_revenue,
             SUM(soi.quantity * soi.unit_cost) as total_cost,
             MAX(soi.unit_cost) as latest_unit_cost
           FROM sales_order_items soi
           JOIN sales_orders so ON so.so_id = soi.so_id
           JOIN items i ON i.item_id = soi.item_id
           WHERE so.status = 'COMPLETED'
             AND so.order_date >= ? 
             AND so.order_date <= ?
           GROUP BY i.item_id, i.sku, i.name`
        )
        .all(dateFrom, dateTo);

      // Get the aggregated returns for the date range
      const returns = db
        .prepare(
          `SELECT 
             i.item_id,
             i.sku,
             i.name,
             SUM(rni.quantity) as returned_qty,
             SUM(rni.quantity * (SELECT MAX(unit_price) FROM sales_order_items WHERE so_id = rn.so_id AND item_id = rni.item_id)) as returned_revenue,
             SUM(CASE 
                 WHEN rni.condition = 'RESALABLE' THEN rni.quantity * (SELECT MAX(unit_cost) FROM sales_order_items WHERE so_id = rn.so_id AND item_id = rni.item_id)
                 ELSE 0 
                 END) as returned_cost,
             SUM(CASE 
                 WHEN rni.condition = 'DAMAGED' THEN rni.quantity * (SELECT MAX(unit_cost) FROM sales_order_items WHERE so_id = rn.so_id AND item_id = rni.item_id)
                 ELSE 0 
                 END) as damaged_cost
           FROM return_note_items rni
           JOIN return_notes rn ON rn.return_id = rni.return_id
           JOIN items i ON i.item_id = rni.item_id
           JOIN sales_orders so ON so.so_id = rn.so_id
           WHERE rn.type = 'CUSTOMER' 
             AND rn.status = 'APPROVED'
             AND so.status = 'COMPLETED'
             AND rn.return_date >= ? 
             AND rn.return_date <= ?
           GROUP BY i.item_id, i.sku, i.name`
        )
        .all(dateFrom, dateTo);

      const itemsMap = new Map();

      for (const s of sales) {
        itemsMap.set(s.item_id, {
          itemId: s.item_id,
          sku: s.sku,
          name: s.name,
          quantitySold: s.total_quantity,
          totalRevenue: s.total_revenue,
          totalCost: s.total_cost,
          latestUnitCost: s.latest_unit_cost || 0,
          damagedLoss: 0,
        });
      }

      for (const r of returns) {
        if (!itemsMap.has(r.item_id)) {
          itemsMap.set(r.item_id, {
            itemId: r.item_id,
            sku: r.sku,
            name: r.name,
            quantitySold: 0,
            totalRevenue: 0,
            totalCost: 0,
            latestUnitCost: 0, 
            damagedLoss: 0,
          });
        }
        const entry = itemsMap.get(r.item_id);
        entry.quantitySold -= r.returned_qty;
        entry.totalRevenue -= (r.returned_revenue || 0);
        entry.totalCost -= ((r.returned_cost || 0) + (r.damaged_cost || 0));
        entry.damagedLoss += (r.damaged_cost || 0);
      }

      let overallSales = 0;
      let overallProfit = 0;
      let overallDamagedLoss = 0;

      const reportItems = Array.from(itemsMap.values())
        .filter((entry) => entry.quantitySold !== 0 || entry.totalRevenue !== 0 || entry.damagedLoss !== 0) // omit items that net to zero and had no other activity
        .map((entry) => {
          const profit = entry.totalRevenue - entry.totalCost - entry.damagedLoss;
          overallSales += entry.totalRevenue;
          overallProfit += profit;
          overallDamagedLoss += entry.damagedLoss;
          return {
            ...entry,
            profit,
          };
        })
        .sort((a, b) => b.totalRevenue - a.totalRevenue);

      return {
        type: 'summary',
        dateFrom,
        dateTo,
        items: reportItems,
        totalSales: overallSales,
        totalProfit: overallProfit,
        totalDamagedLoss: overallDamagedLoss,
      };
    })
  );
}

module.exports = { registerSalesOrdersHandlers };
