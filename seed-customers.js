const { app } = require('electron');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

app.name = 'inventory-app';

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('userData'), 'inventory.db');
  console.log(`Connecting to DB at: ${dbPath}`);
  const db = new DatabaseSync(dbPath);

  const firstNames = ['James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];

  const generatePhone = () => `+1 (${Math.floor(Math.random() * 900) + 100}) ${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`;
  const generateAddress = () => `${Math.floor(Math.random() * 9000) + 100} ${['Main', 'Oak', 'Pine', 'Maple', 'Cedar', 'Elm', 'Washington', 'Lake', 'Hill', 'Park'][Math.floor(Math.random() * 10)]} ${['St', 'Ave', 'Blvd', 'Rd', 'Ln'][Math.floor(Math.random() * 5)]}, Cityville, State ${Math.floor(Math.random() * 90000) + 10000}`;

  db.exec('BEGIN');
  try {
    console.log('Seeding 50 dummy customers...');
    
    for (let i = 1; i <= 50; i++) {
      const name = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
      const address = generateAddress();
      const phone = generatePhone();
      
      db.prepare(
        'INSERT INTO customers (name, address, phone) VALUES (?, ?, ?)'
      ).run(name, address, phone);
    }
    
    db.exec('COMMIT');
    console.log('Successfully seeded 50 customers!');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Failed to seed customers:', err);
  }

  app.quit();
});
