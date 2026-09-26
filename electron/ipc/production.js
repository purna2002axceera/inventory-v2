const { ValidationError, NotFoundError, ConflictError } = require('../errors');
const { wrapHandler } = require('./wrap');
const { runTransaction } = require('../db/connection');

function generateGrnNumber(db) {
  const row = db
    .prepare("SELECT MAX(CAST(SUBSTR(grn_number, 5) AS INTEGER)) AS max_seq FROM production_receipts WHERE grn_number LIKE 'GRN-%'")
    .get();

  const nextSeq = (row?.max_seq || 0) + 1;
  return `GRN-${String(nextSeq).padStart(6, '0')}`;
}

function registerProductionHandlers(ipcMain, getDb) {
  // List batches for an item — used by the GRN form's "select existing batch" dropdown,
  // and by the standalone Batches page.
  ipcMain.handle(
    'production:listBatches',
    wrapHandler(({ page = 1, pageSize = 50, itemId } = {}) => {
      const db = getDb();
      const safePageSize = Math.min(pageSize || 50, 200);
      const safePage = Math.max(page || 1, 1);
      const offset = (safePage - 1) * safePageSize;

      const conditions = [];
      const params = [];

      if (itemId) {
        conditions.push('b.item_id = ?');
        params.push(itemId);
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const totalRow = db
        .prepare(`SELECT COUNT(*) as count FROM batches b ${whereClause}`)
        .get(...params);

      const batches = db
        .prepare(
          `SELECT b.*, i.name AS item_name, i.sku AS item_sku,
             (SELECT COUNT(*) FROM production_receipts pr WHERE pr.batch_id = b.batch_id AND pr.status = 'APPROVED') AS approved_count,
             (SELECT COUNT(*) FROM production_receipts pr WHERE pr.batch_id = b.batch_id AND pr.status = 'PENDING') AS pending_count,
             (SELECT COUNT(*) FROM production_receipts pr WHERE pr.batch_id = b.batch_id) AS total_grn_count,
             (SELECT COUNT(*) FROM production_receipts pr WHERE pr.batch_id = b.batch_id AND pr.status IN ('REVERSED','REJECTED')) AS reversed_rejected_count
           FROM batches b
           JOIN items i ON i.item_id = b.item_id
           ${whereClause}
           ORDER BY i.name ASC, b.production_date ASC, b.batch_id ASC
           LIMIT ? OFFSET ?`
        )
        .all(...params, safePageSize, offset);

      // Compute batch status from the inline aggregates — no extra queries needed.
      const batchesWithStatus = batches.map((batch) => {
        let batchStatus;
        if (batch.quantity_left > 0) {
          batchStatus = 'ACTIVE';
        } else if (batch.total_grn_count > 0 && batch.reversed_rejected_count === batch.total_grn_count) {
          batchStatus = 'REVERSED';
        } else if (batch.approved_count > 0) {
          batchStatus = 'SOLD_OUT';
        } else if (batch.pending_count > 0) {
          batchStatus = 'PENDING_APPROVAL';
        } else {
          batchStatus = 'SOLD_OUT';
        }

        // Remove the helper columns from the response
        const { approved_count, pending_count, total_grn_count, reversed_rejected_count, ...rest } = batch;
        return { ...rest, batchStatus };
      });

      return { batches: batchesWithStatus, total: totalRow.count, page: safePage, pageSize: safePageSize };
    })
  );

  // Create a GRN in PENDING status — no stock impact until approved.
  // Two modes: batchId provided (top up existing batch, price is locked to that batch's price),
  // or batchId omitted (create a brand new batch at the given unitPrice).
  ipcMain.handle(
    'production:create',
    wrapHandler(({ itemId, batchId, quantity, receivedDate, notes }) => {
      if (!itemId) throw new ValidationError('Item is required.');
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new ValidationError('Quantity must be a positive whole number.');
      }
      if (!receivedDate) throw new ValidationError('Received date is required.');

      const db = getDb();

      const item = db.prepare('SELECT * FROM items WHERE item_id = ? AND is_active = 1').get(itemId);
      if (!item) throw new NotFoundError('Item not found or is archived.');

      let targetBatchId = batchId || null;
      let isNewBatch = false;

      if (targetBatchId) {
        const batch = db.prepare('SELECT * FROM batches WHERE batch_id = ?').get(targetBatchId);
        if (!batch) throw new NotFoundError('Selected batch not found.');
        if (batch.item_id !== itemId) {
          throw new ValidationError('Selected batch does not belong to this item.');
        }
      } else {
        isNewBatch = true;
      }

      return runTransaction(db, () => {
        const grnNumber = generateGrnNumber(db);

        if (isNewBatch) {
          const batchResult = db
            .prepare(
              `INSERT INTO batches (item_id, batch_ref, quantity_made, quantity_left, production_date, notes)
               VALUES (?, ?, ?, 0, ?, ?)`
            )
            .run(itemId, grnNumber, quantity, receivedDate, notes || null);
          targetBatchId = batchResult.lastInsertRowid;
        }
        // If topping up an existing batch, we do NOT touch batches.quantity_made/quantity_left yet —
        // that only happens on approval, same as before. quantity_made is bumped only in that new-batch
        // insert above (starts equal to the first GRN's quantity); top-ups add to it on approval instead.

        const grnResult = db
          .prepare(
            `INSERT INTO production_receipts
               (grn_number, item_id, batch_id, quantity, received_date, notes, status, contributed_quantity)
             VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)`
          )
          .run(grnNumber, itemId, targetBatchId, quantity, receivedDate, notes || null, quantity);

        return {
          grnId: grnResult.lastInsertRowid,
          grnNumber,
          batchId: targetBatchId,
          itemId,
          quantity,
          status: 'PENDING',
          isNewBatch,
        };
      });
    })
  );

  // Bulk create: process multiple GRN entries in one call.
  // Each entry gets its own GRN number; shared receivedDate and notes apply to all.
  ipcMain.handle(
    'production:createBulk',
    wrapHandler(({ entries, receivedDate, notes }) => {
      if (!Array.isArray(entries) || entries.length === 0) {
        throw new ValidationError('At least one entry is required.');
      }
      if (!receivedDate) throw new ValidationError('Received date is required.');

      // Validate every entry up-front before writing anything.
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const label = `Entry ${i + 1}`;
        if (!e.itemId) throw new ValidationError(`${label}: Item is required.`);
        if (!Number.isInteger(e.quantity) || e.quantity <= 0) {
          throw new ValidationError(`${label}: Quantity must be a positive whole number.`);
        }
      }

      const db = getDb();

      return runTransaction(db, () => {
        const results = [];

        for (let i = 0; i < entries.length; i++) {
          const e = entries[i];
          const label = `Entry ${i + 1}`;

          const item = db.prepare('SELECT * FROM items WHERE item_id = ? AND is_active = 1').get(e.itemId);
          if (!item) throw new NotFoundError(`${label}: Item not found or is archived.`);

          let targetBatchId = e.batchId || null;
          let isNewBatch = false;

          if (targetBatchId) {
            const batch = db.prepare('SELECT * FROM batches WHERE batch_id = ?').get(targetBatchId);
            if (!batch) throw new NotFoundError(`${label}: Selected batch not found.`);
            if (batch.item_id !== e.itemId) {
              throw new ValidationError(`${label}: Selected batch does not belong to this item.`);
            }
          } else {
            isNewBatch = true;
          }

          const grnNumber = generateGrnNumber(db);

          if (isNewBatch) {
            const batchResult = db
              .prepare(
                `INSERT INTO batches (item_id, batch_ref, quantity_made, quantity_left, production_date, notes)
                 VALUES (?, ?, ?, 0, ?, ?)`
              )
              .run(e.itemId, grnNumber, e.quantity, receivedDate, notes || null);
            targetBatchId = batchResult.lastInsertRowid;
          }

          const grnResult = db
            .prepare(
              `INSERT INTO production_receipts
                 (grn_number, item_id, batch_id, quantity, received_date, notes, status, contributed_quantity)
               VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)`
            )
            .run(grnNumber, e.itemId, targetBatchId, e.quantity, receivedDate, notes || null, e.quantity);

          results.push({
            grnId: grnResult.lastInsertRowid,
            grnNumber,
            batchId: targetBatchId,
            itemId: e.itemId,
            quantity: e.quantity,
            status: 'PENDING',
            isNewBatch,
          });
        }

        return { created: results.length, results };
      });
    })
  );

  // Approve: bump the batch (quantity_made grows if this GRN is a top-up on an existing batch,
  // quantity_left grows either way), bump stock, write ledger.
  ipcMain.handle(
    'production:approve',
    wrapHandler(({ grnId, userId, note }) => {
      const db = getDb();
      const grn = db.prepare('SELECT * FROM production_receipts WHERE grn_id = ?').get(grnId);
      if (!grn) throw new NotFoundError('GRN not found.');
      if (grn.status !== 'PENDING') {
        throw new ConflictError(`GRN is already ${grn.status.toLowerCase()}; only pending GRNs can be approved.`);
      }

      return runTransaction(db, () => {
        // A batch's very first GRN (by grn_id) is always the one that created it —
        // that's a fixed historical fact, unlike inferring "new batch" from the batch's
        // current quantity_made/quantity_left, which breaks if GRNs are approved out of order.
        const isBatchCreatingGrn =
          db.prepare('SELECT MIN(grn_id) AS min_id FROM production_receipts WHERE batch_id = ?').get(grn.batch_id)
            .min_id === grn.grn_id;

        if (!isBatchCreatingGrn) {
          db.prepare('UPDATE batches SET quantity_made = quantity_made + ?, quantity_left = quantity_left + ? WHERE batch_id = ?').run(
            grn.quantity,
            grn.quantity,
            grn.batch_id
          );
        } else {
          db.prepare('UPDATE batches SET quantity_left = quantity_left + ? WHERE batch_id = ?').run(
            grn.quantity,
            grn.batch_id
          );
        }

        const item = db.prepare('SELECT * FROM items WHERE item_id = ?').get(grn.item_id);
        const newStock = item.stock_count + grn.quantity;
        db.prepare("UPDATE items SET stock_count = ?, updated_at = datetime('now') WHERE item_id = ?").run(
          newStock,
          grn.item_id
        );

        db.prepare(
          `INSERT INTO stock_ledger (item_id, change_type, quantity_change, resulting_stock, reference_type, reference_id, note)
           VALUES (?, 'PRODUCTION', ?, ?, 'GRN', ?, ?)`
        ).run(grn.item_id, grn.quantity, newStock, grn.grn_id, grn.notes || null);

        db.prepare(
          `UPDATE production_receipts SET status = 'APPROVED', decided_by = ?, decided_at = datetime('now'), decision_note = ?
           WHERE grn_id = ?`
        ).run(userId ?? null, note ?? null, grnId);

        return { grnId, status: 'APPROVED', newStock };
      });
    })
  );

  ipcMain.handle(
    'production:reject',
    wrapHandler(({ grnId, userId, note }) => {
      const db = getDb();
      const grn = db.prepare('SELECT * FROM production_receipts WHERE grn_id = ?').get(grnId);
      if (!grn) throw new NotFoundError('GRN not found.');
      if (grn.status !== 'PENDING') {
        throw new ConflictError(`GRN is already ${grn.status.toLowerCase()}; only pending GRNs can be rejected.`);
      }

      db.prepare(
        `UPDATE production_receipts SET status = 'REJECTED', decided_by = ?, decided_at = datetime('now'), decision_note = ?
         WHERE grn_id = ?`
      ).run(userId ?? null, note ?? null, grnId);

      return { grnId, status: 'REJECTED' };
    })
  );

  // Reverse: only removes THIS GRN's own contributed quantity from the batch, not the whole batch.
  // Only allowed if the batch still has at least that much quantity_left un-sold.
  ipcMain.handle(
    'production:reverse',
    wrapHandler(({ grnId, userId, note }) => {
      const db = getDb();
      const grn = db.prepare('SELECT * FROM production_receipts WHERE grn_id = ?').get(grnId);
      if (!grn) throw new NotFoundError('GRN not found.');
      if (grn.status !== 'APPROVED') {
        throw new ConflictError('Only approved GRNs can be reversed.');
      }

      const batch = db.prepare('SELECT * FROM batches WHERE batch_id = ?').get(grn.batch_id);
      const contributedQty = grn.contributed_quantity ?? grn.quantity;

      if (batch.quantity_left < contributedQty) {
        throw new ConflictError(
          'Cannot reverse: some of this GRN\'s stock has already been sold. Reversal requires the full contributed quantity to still be unsold.'
        );
      }

      return runTransaction(db, () => {
        db.prepare('UPDATE batches SET quantity_made = quantity_made - ?, quantity_left = quantity_left - ? WHERE batch_id = ?').run(
          contributedQty,
          contributedQty,
          grn.batch_id
        );

        const item = db.prepare('SELECT * FROM items WHERE item_id = ?').get(grn.item_id);
        const newStock = item.stock_count - contributedQty;
        db.prepare("UPDATE items SET stock_count = ?, updated_at = datetime('now') WHERE item_id = ?").run(
          newStock,
          grn.item_id
        );

        db.prepare(
          `INSERT INTO stock_ledger (item_id, change_type, quantity_change, resulting_stock, reference_type, reference_id, note)
           VALUES (?, 'PRODUCTION_REVERSED', ?, ?, 'GRN', ?, ?)`
        ).run(grn.item_id, -contributedQty, newStock, grn.grn_id, note || 'GRN reversed');

        db.prepare(
          `UPDATE production_receipts SET status = 'REVERSED', decided_by = ?, decided_at = datetime('now'), decision_note = ?
           WHERE grn_id = ?`
        ).run(userId ?? null, note ?? null, grnId);

        return { grnId, status: 'REVERSED', newStock };
      });
    })
  );

  ipcMain.handle(
    'production:list',
    wrapHandler(({ page = 1, pageSize = 50, search, itemId, status, dateFrom, dateTo } = {}) => {
      const db = getDb();
      const safePageSize = Math.min(pageSize || 50, 200);
      const safePage = Math.max(page || 1, 1);
      const offset = (safePage - 1) * safePageSize;

      console.log(`BACKEND -> Received production:list request for page ${safePage}, search: ${search || 'none'}`);

      const conditions = ['1=1'];
      const params = [];

      if (search) {
        conditions.push('(pr.grn_number LIKE ? OR i.name LIKE ? OR i.sku LIKE ?)');
        const term = `%${search}%`;
        params.push(term, term, term);
      }
      if (itemId) {
        conditions.push('pr.item_id = ?');
        params.push(itemId);
      }
      if (status) {
        if (status !== 'ALL') {
          conditions.push('pr.status = ?');
          params.push(status);
        }
      }
      if (dateFrom) {
        conditions.push('pr.received_date >= ?');
        params.push(dateFrom);
      }
      if (dateTo) {
        conditions.push('pr.received_date <= ?');
        params.push(dateTo);
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      const totalRow = db
        .prepare(`SELECT COUNT(*) as count FROM production_receipts pr JOIN items i ON i.item_id = pr.item_id ${whereClause}`)
        .get(...params);

      const receipts = db
        .prepare(
          `SELECT pr.*, i.name AS item_name, i.sku AS item_sku
           FROM production_receipts pr
           JOIN items i ON i.item_id = pr.item_id
           ${whereClause}
           ORDER BY pr.received_date DESC, pr.grn_id DESC
           LIMIT ? OFFSET ?`
        )
        .all(...params, safePageSize, offset);

      return { receipts, total: totalRow.count, page: safePage, pageSize: safePageSize };
    })
  );
}

module.exports = { registerProductionHandlers };
