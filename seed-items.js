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
    console.log('Seeding 50 dummy items...');
    for (let i = 1; i <= 50; i++) {
      const type = i % 2 === 0 ? 'SEAT' : 'SEAT_COVER';
      const typeCode = type === 'SEAT' ? 'ST' : 'SC';
      const bikeModel = `MODEL-${i % 5}`;
      const sku = `${bikeModel}-${typeCode}-00${i}`;
      
      const insert = db.prepare(`
        INSERT INTO items (
          sku, name, bike_model, type, description, stock_count, is_active, 
          unit_cost, unit_price
        ) VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?)
      `);
      
      insert.run(sku, `Dummy Item ${i}`, bikeModel, type, `Description for dummy item ${i}`, 10.50, 25.00);
    }
    db.exec('COMMIT');
    console.log('Successfully seeded 50 items!');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Failed to seed items:', err);
  }

  app.quit();
});
