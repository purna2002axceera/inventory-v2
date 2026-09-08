// Seed 100 items and 60 customers for testing infinite scroll dropdowns
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'inventory-app', 'inventory.db');
const db = new DatabaseSync(dbPath);

const bikeModels = ['Honda CB Shine', 'Bajaj Pulsar 150', 'TVS Apache', 'Hero Splendor', 'Yamaha FZ', 'Royal Enfield Classic', 'Suzuki Gixxer', 'KTM Duke 200', 'Honda Activa', 'TVS Jupiter'];
const materials = ['Rexine', 'Leather', 'PVC', 'Premium Rexine', 'Velvet', 'Carbon', 'Mesh', 'Neoprene'];
const variants = ['Standard', 'Deluxe', 'Sport', 'Classic', 'Premium', 'Comfort', 'Racing', 'Touring', 'Custom', 'Pro'];

// Seed items — type must be SEAT_COVER or SEAT
const insertItem = db.prepare(`
  INSERT INTO items (sku, name, bike_model, type, description, unit_cost, unit_price, stock_count)
  VALUES (?, ?, ?, ?, ?, ?, ?, 0)
`);

let itemCount = db.prepare('SELECT COUNT(*) as c FROM items').get().c;
const targetItems = 100;
const itemsToAdd = targetItems - itemCount;

console.log(`Currently ${itemCount} items. Adding ${itemsToAdd} more...`);

let added = 0;
for (let i = 0; i < itemsToAdd; i++) {
  const model = bikeModels[i % bikeModels.length];
  const material = materials[i % materials.length];
  const variant = variants[i % variants.length];
  const type = i % 3 === 0 ? 'SEAT' : 'SEAT_COVER';
  const modelShort = model.split(' ').pop();
  const seq = String(itemCount + i + 1).padStart(4, '0');
  const sku = `TST-${seq}`;
  const name = `${material} ${variant} ${type === 'SEAT' ? 'Seat' : 'Seat Cover'} - ${modelShort}`;
  const cost = 50 + Math.floor(Math.random() * 450);
  const price = cost + 50 + Math.floor(Math.random() * 200);
  
  try {
    insertItem.run(sku, name, model, type, `${material} ${variant.toLowerCase()} for ${model}`, cost, price);
    added++;
  } catch (e) {
    console.log(`  Skipped: ${sku} — ${e.message}`);
  }
}
console.log(`  Added ${added} items`);

// Seed customers
const insertCustomer = db.prepare(`
  INSERT INTO customers (name, address, phone) VALUES (?, ?, ?)
`);

let custCount = db.prepare('SELECT COUNT(*) as c FROM customers').get().c;
const targetCustomers = 60;
const custsToAdd = Math.max(0, targetCustomers - custCount);

console.log(`Currently ${custCount} customers. Adding ${custsToAdd} more...`);

const firstNames = ['Ashan', 'Kamal', 'Nimal', 'Sunil', 'Priya', 'Dilshan', 'Chaminda', 'Ruwan', 'Lakmal', 'Saman', 'Chathura', 'Mahesh', 'Dinesh', 'Ranjith', 'Tharaka', 'Buddhika', 'Sandun', 'Hasitha', 'Nuwan', 'Janaka'];
const lastNames = ['Perera', 'Fernando', 'Silva', 'Bandara', 'Jayawardena', 'Dissanayake', 'Kumara', 'Rathnayake', 'Wickramasinghe', 'Gunasekara'];
const cities = ['Colombo', 'Kandy', 'Galle', 'Matara', 'Kurunegala', 'Negombo', 'Anuradhapura', 'Jaffna', 'Batticaloa', 'Badulla'];

let custAdded = 0;
for (let i = 0; i < custsToAdd; i++) {
  const first = firstNames[i % firstNames.length];
  const last = lastNames[Math.floor(i / firstNames.length) % lastNames.length];
  const suffix = i >= firstNames.length ? ` ${Math.floor(i / firstNames.length) + 1}` : '';
  const city = cities[i % cities.length];
  const phone = `07${String(10000000 + Math.floor(Math.random() * 89999999))}`;
  
  try {
    insertCustomer.run(`${first} ${last}${suffix}`, `${Math.floor(Math.random() * 200) + 1}, Main Street, ${city}`, phone);
    custAdded++;
  } catch (e) {
    // skip
  }
}
console.log(`  Added ${custAdded} customers`);

const finalItems = db.prepare('SELECT COUNT(*) as c FROM items').get().c;
const finalCusts = db.prepare('SELECT COUNT(*) as c FROM customers').get().c;
console.log(`\nDone! Total items: ${finalItems}, Total customers: ${finalCusts}`);
