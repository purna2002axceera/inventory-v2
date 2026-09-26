const { ValidationError, NotFoundError } = require('../errors');
const { wrapHandler } = require('./wrap');
const { runTransaction } = require('../db/connection');
const { deductStockFifo } = require('../db/stockHelpers');

function generateAdjustmentRef(db) {
  const row = db
    .prepare("SELECT MAX(CAST(SUBSTR(batch_ref, 5) AS INTEGER)) AS max_seq FROM batches WHERE batch_ref LIKE 'ADJ-%'")
    .get();

  const nextSeq = (row?.max_seq || 0) + 1;
  return `ADJ-${String(nextSeq).padStart(6, '0')}`;
}

function registerStockAdjustmentsHandlers(ipcMain, getDb) {
  // Reconcile system stock to a physical count. Applies immediately (no approval step) —
  // this is meant to be used at the moment of counting, by whoever is doing the count.
  ipcMain.handle(
    'stockAdjustments:create',
    wrapHandler(({ itemId, actualCount, reason }) => {
      if (!itemId) throw new ValidationError('Item is required.');
      if (!Number.isInteger(actualCount) || actualCount < 0) {
        throw new ValidationError('Counted stock must be a non-negative whole number.');
      }
      if (!reason || !reason.trim()) {
        throw new ValidationError('A reason is required for a stock adjustment.');
      }

      const db = getDb();
      const item = db.prepare('SELECT * FROM items WHERE item_id = ?').get(itemId);
      if (!item) throw new NotFoundError('Item not found.');

      const delta = actualCount - item.stock_count;
      if (delta === 0) {
        throw new ValidationError('Counted stock matches the system stock — nothing to adjust.');
      }

      return runTransaction(db, () => {
        let newStock;

        if (delta < 0) {
          // Shrinkage: pull the missing units out via FIFO, same as any other stock deduction.
          newStock = deductStockFifo(db, item, -delta);
        } else {
          // Found extra: record it as its own batch (dated today) so it's still FIFO-consumable
          // by future sales, same shape as a GRN — just sourced from a recount, not production.
          newStock = item.stock_count + delta;
          db.prepare("UPDATE items SET stock_count = ?, updated_at = datetime('now') WHERE item_id = ?")
            .run(newStock, item.item_id);

          const batchRef = generateAdjustmentRef(db);
          db.prepare(
            `INSERT INTO batches (item_id, batch_ref, quantity_made, quantity_left, production_date, notes)
             VALUES (?, ?, ?, ?, date('now'), ?)`
          ).run(item.item_id, batchRef, delta, delta, reason.trim());
        }

        db.prepare(
          `INSERT INTO stock_ledger (item_id, change_type, quantity_change, resulting_stock, reference_type, note)
           VALUES (?, 'ADJUSTMENT', ?, ?, 'ADJUSTMENT', ?)`
        ).run(item.item_id, delta, newStock, reason.trim());

        return { itemId: item.item_id, previousStock: item.stock_count, newStock, delta };
      });
    })
  );

  // Recent adjustment history for one item — shown alongside the adjustment form so whoever's
  // counting can see what's already been logged before adding another entry.
  ipcMain.handle(
    'stockAdjustments:listForItem',
    wrapHandler(({ itemId, limit = 10 }) => {
      if (!itemId) throw new ValidationError('Item is required.');
      const db = getDb();
      const safeLimit = Math.min(limit || 10, 50);

      const adjustments = db.prepare(
        `SELECT ledger_id, quantity_change, resulting_stock, note, created_at
         FROM stock_ledger
         WHERE item_id = ? AND change_type = 'ADJUSTMENT'
         ORDER BY created_at DESC, ledger_id DESC
         LIMIT ?`
      ).all(itemId, safeLimit);

      return { adjustments };
    })
  );
}

module.exports = { registerStockAdjustmentsHandlers };
