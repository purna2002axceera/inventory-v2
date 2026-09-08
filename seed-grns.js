const { app } = require('electron');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

app.name = 'inventory-app';

function generateGrnNumber(db) {
  const row = db
    .prepare("SELECT grn_number FROM production_receipts WHERE grn_number LIKE 'GRN-%' ORDER BY grn_number DESC LIMIT 1")
    .get();

  let nextSeq = 1;
  if (row && row.grn_number) {
    const parts = row.grn_number.split('-');
    const lastSeq = parseInt(parts[1], 10);
    if (!Number.isNaN(lastSeq)) nextSeq = lastSeq + 1;
  }
  return `GRN-${String(nextSeq).padStart(6, '0')}`;
}

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('userData'), 'inventory.db');
  console.log(`Connecting to DB at: ${dbPath}`);
  const db = new DatabaseSync(dbPath);

  const items = db.prepare('SELECT * FROM items WHERE is_active = 1 LIMIT 10').all();
  if (!items || items.length === 0) {
    console.error('No items found. Run seed-items.js first.');
    app.quit();
    return;
  }

  db.exec('BEGIN');
  try {
    console.log('Seeding 50 dummy GRNs...');
    const statuses = ['PENDING', 'APPROVED', 'REJECTED', 'REVERSED'];

    for (let i = 1; i <= 50; i++) {
      const item = items[Math.floor(Math.random() * items.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const quantity = Math.floor(Math.random() * 50) + 10;
      
      const date = new Date(Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000));
      const receivedDate = date.toISOString().split('T')[0];

      const grnNumber = generateGrnNumber(db);

      // Create a new batch
      let qtyMade = 0;
      let qtyLeft = 0;
      if (status === 'APPROVED' || status === 'REVERSED') {
         qtyMade = quantity;
         qtyLeft = status === 'REVERSED' ? 0 : quantity;
      }

      const batchResult = db
        .prepare(
          `INSERT INTO batches (item_id, batch_ref, quantity_made, quantity_left, production_date, notes)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(item.item_id, grnNumber, qtyMade, qtyLeft, receivedDate, `Seed batch ${i}`);
        
      const batchId = batchResult.lastInsertRowid;

      // Create GRN
      const grnResult = db
        .prepare(
          `INSERT INTO production_receipts
             (grn_number, item_id, batch_id, quantity, received_date, notes, status, contributed_quantity)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(grnNumber, item.item_id, batchId, quantity, receivedDate, `Dummy GRN ${i}`, status, quantity);

      // If approved, update stock ledger and item stock
      if (status === 'APPROVED') {
        const newStock = item.stock_count + quantity;
        db.prepare("UPDATE items SET stock_count = ?, updated_at = datetime('now') WHERE item_id = ?").run(
          newStock,
          item.item_id
        );
        item.stock_count = newStock; // update locally for next iteration

        db.prepare(
          `INSERT INTO stock_ledger (item_id, change_type, quantity_change, resulting_stock, reference_type, reference_id, note)
           VALUES (?, 'PRODUCTION', ?, ?, 'GRN', ?, ?)`
        ).run(item.item_id, quantity, newStock, grnResult.lastInsertRowid, `Dummy GRN ${i}`);
      }
    }
    db.exec('COMMIT');
    console.log('Successfully seeded 50 GRNs!');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Failed to seed GRNs:', err);
  }

  app.quit();
});
