const { ConflictError } = require('../errors');

// Decrement an item's stock and FIFO-deduct from its batches (oldest production_date first).
// Shared by internal returns, damaged-item exchanges, and stock adjustments — anything that
// pulls a unit out of current stock without a specific batch already chosen. Returns the
// resulting stock count.
function deductStockFifo(db, item, quantity) {
  const newStock = item.stock_count - quantity;
  if (newStock < 0) {
    throw new ConflictError(`Insufficient stock for "${item.name}" to process this.`);
  }
  db.prepare("UPDATE items SET stock_count = ?, updated_at = datetime('now') WHERE item_id = ?")
    .run(newStock, item.item_id);

  let remaining = quantity;
  const batches = db.prepare(
    `SELECT batch_id, quantity_left FROM batches
     WHERE item_id = ? AND quantity_left > 0
     ORDER BY production_date ASC, batch_id ASC`
  ).all(item.item_id);

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity_left, remaining);
    db.prepare('UPDATE batches SET quantity_left = quantity_left - ? WHERE batch_id = ?')
      .run(take, batch.batch_id);
    remaining -= take;
  }

  if (remaining > 0) {
    throw new ConflictError(
      `Cannot process this for "${item.name}": batch records only account for ${quantity - remaining} of the ${quantity} requested. Stock and batch quantities are out of sync — investigate before proceeding.`
    );
  }

  return newStock;
}

module.exports = { deductStockFifo };
