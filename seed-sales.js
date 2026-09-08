const { app } = require('electron');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

app.name = 'inventory-app';

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('userData'), 'inventory.db');
  console.log(`Connecting to DB at: ${dbPath}`);
  const db = new DatabaseSync(dbPath);

  db.exec('BEGIN');
  try {
    const customers = db.prepare('SELECT customer_id FROM customers').all();
    const items = db.prepare('SELECT item_id, unit_cost, unit_price FROM items').all();

    if (customers.length === 0 || items.length === 0) {
      console.log('Need at least one customer and one item in the DB.');
      db.exec('ROLLBACK');
      app.quit();
      return;
    }

    const row = db.prepare("SELECT so_number FROM sales_orders WHERE so_number LIKE 'SO-%' ORDER BY so_number DESC LIMIT 1").get();
    let nextSeq = 1;
    if (row && row.so_number) {
      const parts = row.so_number.split('-');
      nextSeq = parseInt(parts[1], 10) + 1;
    }

    console.log('Seeding 50 dummy sales orders...');
    
    for (let i = 1; i <= 50; i++) {
      const soNumber = `SO-${String(nextSeq++).padStart(6, '0')}`;
      const customer = customers[Math.floor(Math.random() * customers.length)];
      
      const orderDate = new Date();
      orderDate.setDate(orderDate.getDate() - Math.floor(Math.random() * 30));
      const orderDateStr = orderDate.toISOString().slice(0, 10);
      
      const soResult = db.prepare(
        "INSERT INTO sales_orders (so_number, customer_id, order_date, status) VALUES (?, ?, ?, 'COMPLETED')"
      ).run(soNumber, customer.customer_id, orderDateStr);

      const soId = soResult.lastInsertRowid;

      // Add 1-3 random items to this order
      const numLines = Math.floor(Math.random() * 3) + 1;
      
      for(let j = 0; j < numLines; j++) {
         const item = items[Math.floor(Math.random() * items.length)];
         // Get any active batch for this item to satisfy FK
         const batch = db.prepare('SELECT batch_id FROM batches WHERE item_id = ? LIMIT 1').get(item.item_id);
         
         const qty = Math.floor(Math.random() * 3) + 1;
         
         if (batch) {
             db.prepare(
               "INSERT INTO sales_order_items (so_id, item_id, batch_id, quantity, unit_cost, unit_price) VALUES (?, ?, ?, ?, ?, ?)"
             ).run(soId, item.item_id, batch.batch_id, qty, item.unit_cost, item.unit_price);
         }
      }
    }
    
    db.exec('COMMIT');
    console.log('Successfully seeded 50 sales orders!');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Failed to seed sales orders:', err);
  }

  app.quit();
});
