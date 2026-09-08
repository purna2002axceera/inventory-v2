const { ValidationError, NotFoundError, ConflictError } = require('../errors');
const { wrapHandler } = require('./wrap');
const { runTransaction } = require('../db/connection');

function generateReturnNumber(db) {
  const row = db
    .prepare("SELECT MAX(CAST(SUBSTR(return_number, 4) AS INTEGER)) AS max_seq FROM return_notes WHERE return_number LIKE 'RN-%'")
    .get();

  const nextSeq = (row?.max_seq || 0) + 1;
  return `RN-${String(nextSeq).padStart(6, '0')}`;
}

function registerReturnsHandlers(ipcMain, getDb) {

  // Get returnable items for a given sales order.
  // Returns items with the max quantity still returnable (original qty minus already-returned qty).
  ipcMain.handle(
    'returns:getReturnableItems',
    wrapHandler(({ soNumber }) => {
      if (!soNumber) throw new ValidationError('Sales order number is required.');
      const db = getDb();

      const order = db.prepare("SELECT * FROM sales_orders WHERE so_number = ?").get(soNumber);
      if (!order) throw new NotFoundError('Sales order not found.');
      if (order.status === 'CANCELLED') throw new ConflictError('This sales order has been cancelled.');

      const soId = order.so_id;

      // Get aggregated sold quantities per item from the SO
      const soldItems = db.prepare(
        `SELECT soi.item_id, i.name AS item_name, i.sku AS item_sku,
                SUM(soi.quantity) AS sold_qty, soi.unit_price
         FROM sales_order_items soi
         JOIN items i ON i.item_id = soi.item_id
         WHERE soi.so_id = ?
         GROUP BY soi.item_id`
      ).all(soId);

      // Get already-returned quantities per item from approved returns against this SO
      const returnedItems = db.prepare(
        `SELECT rni.item_id, SUM(rni.quantity) AS returned_qty
         FROM return_note_items rni
         JOIN return_notes rn ON rn.return_id = rni.return_id
         WHERE rn.so_id = ? AND rn.status = 'APPROVED'
         GROUP BY rni.item_id`
      ).all(soId);

      const returnedMap = new Map();
      for (const r of returnedItems) {
        returnedMap.set(r.item_id, r.returned_qty);
      }

      // Also account for pending returns (to avoid over-returning while one is pending)
      const pendingItems = db.prepare(
        `SELECT rni.item_id, SUM(rni.quantity) AS pending_qty
         FROM return_note_items rni
         JOIN return_notes rn ON rn.return_id = rni.return_id
         WHERE rn.so_id = ? AND rn.status = 'PENDING'
         GROUP BY rni.item_id`
      ).all(soId);

      const pendingMap = new Map();
      for (const p of pendingItems) {
        pendingMap.set(p.item_id, p.pending_qty);
      }

      const returnableItems = soldItems
        .map((item) => {
          const alreadyReturned = returnedMap.get(item.item_id) || 0;
          const pendingReturn = pendingMap.get(item.item_id) || 0;
          const maxReturnable = item.sold_qty - alreadyReturned - pendingReturn;
          return {
            itemId: item.item_id,
            itemName: item.item_name,
            itemSku: item.item_sku,
            soldQty: item.sold_qty,
            alreadyReturned,
            pendingReturn,
            maxReturnable,
            unitPrice: item.unit_price,
          };
        })
        .filter((item) => item.maxReturnable > 0);

      return {
        soId,
        soNumber: order.so_number,
        orderDate: order.order_date,
        customerName: db.prepare('SELECT name FROM customers WHERE customer_id = ?').get(order.customer_id)?.name,
        items: returnableItems,
      };
    })
  );

  // Create a return note in PENDING status
  ipcMain.handle(
    'returns:create',
    wrapHandler(({ type, soId, returnDate, reason, items }) => {
      if (!type || !['INTERNAL', 'CUSTOMER'].includes(type)) {
        throw new ValidationError('Return type must be INTERNAL or CUSTOMER.');
      }
      if (!returnDate) throw new ValidationError('Return date is required.');
      if (!Array.isArray(items) || items.length === 0) {
        throw new ValidationError('At least one item is required.');
      }

      const db = getDb();

      // Validate items
      for (let i = 0; i < items.length; i++) {
        const line = items[i];
        const label = `Item ${i + 1}`;
        if (!line.itemId) throw new ValidationError(`${label}: Item is required.`);
        if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
          throw new ValidationError(`${label}: Quantity must be a positive whole number.`);
        }
        if (!line.condition || !['RESALABLE', 'DAMAGED'].includes(line.condition)) {
          throw new ValidationError(`${label}: Condition must be RESALABLE or DAMAGED.`);
        }
      }

      // Check for duplicate items
      const itemIds = new Set();
      for (const line of items) {
        if (itemIds.has(line.itemId)) {
          throw new ValidationError('Duplicate item in return note. Each item should appear only once.');
        }
        itemIds.add(line.itemId);
      }

      if (type === 'CUSTOMER') {
        if (!soId) throw new ValidationError('Sales order is required for customer returns.');

        const order = db.prepare("SELECT * FROM sales_orders WHERE so_id = ?").get(soId);
        if (!order) throw new NotFoundError('Sales order not found.');
        if (order.status === 'CANCELLED') throw new ConflictError('This sales order has been cancelled.');

        // Validate return quantities against the SO
        for (const line of items) {
          const soldRow = db.prepare(
            'SELECT SUM(quantity) AS sold_qty FROM sales_order_items WHERE so_id = ? AND item_id = ?'
          ).get(soId, line.itemId);
          const soldQty = soldRow?.sold_qty || 0;

          const returnedRow = db.prepare(
            `SELECT SUM(rni.quantity) AS returned_qty
             FROM return_note_items rni
             JOIN return_notes rn ON rn.return_id = rni.return_id
             WHERE rn.so_id = ? AND rni.item_id = ? AND rn.status IN ('APPROVED', 'PENDING')`
          ).get(soId, line.itemId);
          const alreadyReturned = returnedRow?.returned_qty || 0;

          const maxReturnable = soldQty - alreadyReturned;
          if (line.quantity > maxReturnable) {
            const item = db.prepare('SELECT name FROM items WHERE item_id = ?').get(line.itemId);
            throw new ValidationError(
              `Cannot return ${line.quantity} of "${item?.name}": only ${maxReturnable} returnable (${soldQty} sold, ${alreadyReturned} already returned/pending).`
            );
          }
        }
      }

      if (type === 'INTERNAL') {
        // For internal returns, all items must be DAMAGED (stock deduction)
        for (const line of items) {
          if (line.condition !== 'DAMAGED') {
            throw new ValidationError('Internal returns must have all items marked as DAMAGED.');
          }

          // Verify item has enough stock
          const item = db.prepare('SELECT * FROM items WHERE item_id = ?').get(line.itemId);
          if (!item) throw new NotFoundError(`Item not found.`);
          if (item.stock_count < line.quantity) {
            throw new ValidationError(
              `Insufficient stock for "${item.name}": only ${item.stock_count} available, trying to return ${line.quantity}.`
            );
          }
        }
      }

      const returnNumber = generateReturnNumber(db);

      return runTransaction(db, () => {
        const result = db.prepare(
          `INSERT INTO return_notes (return_number, type, so_id, return_date, reason, status)
           VALUES (?, ?, ?, ?, ?, 'PENDING')`
        ).run(returnNumber, type, soId || null, returnDate, reason ? reason.trim() : null);

        const returnId = result.lastInsertRowid;

        for (const line of items) {
          db.prepare(
            `INSERT INTO return_note_items (return_id, item_id, quantity, condition)
             VALUES (?, ?, ?, ?)`
          ).run(returnId, line.itemId, line.quantity, line.condition);
        }

        return { returnId, returnNumber, status: 'PENDING' };
      });
    })
  );

  // List return notes
  ipcMain.handle(
    'returns:list',
    wrapHandler(({ page = 1, pageSize = 50, type, status, dateFrom, dateTo, search } = {}) => {
      const db = getDb();
      const safePageSize = Math.min(pageSize || 50, 200);
      const safePage = Math.max(page || 1, 1);
      const offset = (safePage - 1) * safePageSize;

      const conditions = ['1=1'];
      const params = [];

      if (type) {
        conditions.push('rn.type = ?');
        params.push(type);
      }
      if (status) {
        conditions.push('rn.status = ?');
        params.push(status);
      }
      if (dateFrom) {
        conditions.push('rn.return_date >= ?');
        params.push(dateFrom);
      }
      if (dateTo) {
        conditions.push('rn.return_date <= ?');
        params.push(dateTo);
      }
      if (search) {
        conditions.push('(rn.return_number LIKE ? OR so.so_number LIKE ?)');
        const likeQuery = `%${search}%`;
        params.push(likeQuery, likeQuery);
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      const totalRow = db
        .prepare(`SELECT COUNT(*) as count FROM return_notes rn ${whereClause}`)
        .get(...params);

      const returns = db
        .prepare(
          `SELECT rn.*, so.so_number,
                  (SELECT SUM(rni.quantity) FROM return_note_items rni WHERE rni.return_id = rn.return_id) AS total_items
           FROM return_notes rn
           LEFT JOIN sales_orders so ON so.so_id = rn.so_id
           ${whereClause}
           ORDER BY rn.created_at DESC, rn.return_id DESC
           LIMIT ? OFFSET ?`
        )
        .all(...params, safePageSize, offset);

      return { returns, total: totalRow.count, page: safePage, pageSize: safePageSize };
    })
  );

  // Get a single return note with line items
  ipcMain.handle(
    'returns:get',
    wrapHandler(({ returnId }) => {
      const db = getDb();

      const returnNote = db.prepare(
        `SELECT rn.*, so.so_number, c.name AS customer_name
         FROM return_notes rn
         LEFT JOIN sales_orders so ON so.so_id = rn.so_id
         LEFT JOIN customers c ON c.customer_id = so.customer_id
         WHERE rn.return_id = ?`
      ).get(returnId);
      if (!returnNote) throw new NotFoundError('Return note not found.');

      const items = db.prepare(
        `SELECT rni.*, i.name AS item_name, i.sku AS item_sku
         FROM return_note_items rni
         JOIN items i ON i.item_id = rni.item_id
         WHERE rni.return_id = ?
         ORDER BY rni.rni_id ASC`
      ).all(returnId);

      return { ...returnNote, items };
    })
  );

  // Approve a pending return note
  ipcMain.handle(
    'returns:approve',
    wrapHandler(({ returnId, userId, note }) => {
      const db = getDb();

      const returnNote = db.prepare('SELECT * FROM return_notes WHERE return_id = ?').get(returnId);
      if (!returnNote) throw new NotFoundError('Return note not found.');
      if (returnNote.status !== 'PENDING') {
        throw new ConflictError(`Return note is already ${returnNote.status.toLowerCase()}; only pending returns can be approved.`);
      }

      const items = db.prepare('SELECT * FROM return_note_items WHERE return_id = ?').all(returnId);

      return runTransaction(db, () => {
        for (const line of items) {
          const item = db.prepare('SELECT * FROM items WHERE item_id = ?').get(line.item_id);

          if (returnNote.type === 'CUSTOMER' && line.condition === 'RESALABLE') {
            // Restock: increase item stock and batch quantity_left
            const newStock = item.stock_count + line.quantity;
            db.prepare("UPDATE items SET stock_count = ?, updated_at = datetime('now') WHERE item_id = ?")
              .run(newStock, line.item_id);

            // Restore to original batches using FIFO (oldest batch first)
            let remaining = line.quantity;
            const soBatches = db.prepare(
              `SELECT soi.batch_id, SUM(soi.quantity) AS qty
               FROM sales_order_items soi
               WHERE soi.so_id = ? AND soi.item_id = ?
               GROUP BY soi.batch_id
               ORDER BY soi.batch_id ASC`
            ).all(returnNote.so_id, line.item_id);

            for (const sb of soBatches) {
              if (remaining <= 0) break;
              const restore = Math.min(remaining, sb.qty);
              db.prepare('UPDATE batches SET quantity_left = quantity_left + ? WHERE batch_id = ?')
                .run(restore, sb.batch_id);
              remaining -= restore;
            }

            db.prepare(
              `INSERT INTO stock_ledger (item_id, change_type, quantity_change, resulting_stock, reference_type, reference_id, note)
               VALUES (?, 'RETURN_RESTOCK', ?, ?, 'RETURN', ?, ?)`
            ).run(line.item_id, line.quantity, newStock, returnId, `Restocked from ${returnNote.return_number}`);

          } else if (returnNote.type === 'CUSTOMER' && line.condition === 'DAMAGED') {
            // Customer return damaged: no stock change, just record in ledger
            db.prepare(
              `INSERT INTO stock_ledger (item_id, change_type, quantity_change, resulting_stock, reference_type, reference_id, note)
               VALUES (?, 'RETURN_DISCARD', 0, ?, 'RETURN', ?, ?)`
            ).run(line.item_id, item.stock_count, returnId, `Damaged return discarded from ${returnNote.return_number}`);

          } else if (returnNote.type === 'INTERNAL') {
            // Internal return: deduct stock
            const newStock = item.stock_count - line.quantity;
            if (newStock < 0) {
              throw new ConflictError(`Insufficient stock for "${item.name}" to process this internal return.`);
            }
            db.prepare("UPDATE items SET stock_count = ?, updated_at = datetime('now') WHERE item_id = ?")
              .run(newStock, line.item_id);

            // Deduct from batches using FIFO (oldest first with available stock)
            let remaining = line.quantity;
            const batches = db.prepare(
              `SELECT batch_id, quantity_left FROM batches
               WHERE item_id = ? AND quantity_left > 0
               ORDER BY production_date ASC, batch_id ASC`
            ).all(line.item_id);

            for (const batch of batches) {
              if (remaining <= 0) break;
              const take = Math.min(batch.quantity_left, remaining);
              db.prepare('UPDATE batches SET quantity_left = quantity_left - ? WHERE batch_id = ?')
                .run(take, batch.batch_id);
              remaining -= take;
            }

            db.prepare(
              `INSERT INTO stock_ledger (item_id, change_type, quantity_change, resulting_stock, reference_type, reference_id, note)
               VALUES (?, 'INTERNAL_RETURN', ?, ?, 'RETURN', ?, ?)`
            ).run(line.item_id, -line.quantity, newStock, returnId, `Internal return: ${returnNote.reason || returnNote.return_number}`);
          }
        }

        // For customer returns: check if SO should be cancelled (all items returned)
        if (returnNote.type === 'CUSTOMER') {
          const soItems = db.prepare(
            'SELECT SUM(quantity) as total_sold FROM sales_order_items WHERE so_id = ?'
          ).get(returnNote.so_id);
          
          const returnedItems = db.prepare(
            `SELECT SUM(rni.quantity) as total_returned
             FROM return_note_items rni
             JOIN return_notes rn ON rn.return_id = rni.return_id
             WHERE rn.so_id = ? AND rn.status IN ('APPROVED', 'PENDING')`
          ).get(returnNote.so_id);

          if (soItems.total_sold <= (returnedItems.total_returned || 0)) {
            db.prepare("UPDATE sales_orders SET status = 'CANCELLED' WHERE so_id = ?").run(returnNote.so_id);
          }
        }

        // Mark the return note as approved
        db.prepare(
          `UPDATE return_notes SET status = 'APPROVED', decided_by = ?, decided_at = datetime('now'), decision_note = ?
           WHERE return_id = ?`
        ).run(userId ?? null, note ?? null, returnId);

        return { returnId, status: 'APPROVED' };
      });
    })
  );

  // Reject a pending return note
  ipcMain.handle(
    'returns:reject',
    wrapHandler(({ returnId, userId, note }) => {
      const db = getDb();

      const returnNote = db.prepare('SELECT * FROM return_notes WHERE return_id = ?').get(returnId);
      if (!returnNote) throw new NotFoundError('Return note not found.');
      if (returnNote.status !== 'PENDING') {
        throw new ConflictError(`Return note is already ${returnNote.status.toLowerCase()}; only pending returns can be rejected.`);
      }

      db.prepare(
        `UPDATE return_notes SET status = 'REJECTED', decided_by = ?, decided_at = datetime('now'), decision_note = ?
         WHERE return_id = ?`
      ).run(userId ?? null, note ?? null, returnId);

      return { returnId, status: 'REJECTED' };
    })
  );
}

module.exports = { registerReturnsHandlers };
