const db = require('better-sqlite3')('electron/db/inventory.db');
const items = db.prepare("SELECT item_id FROM items WHERE name LIKE '%Pulsar%'").all();
console.log('items:', items);
const so_items = db.prepare(`SELECT item_id, so_id, quantity, unit_price FROM sales_order_items WHERE item_id IN (${items.map(i => i.item_id).join(',')})`).all();
console.log('sales_order_items:', so_items);
const return_items = db.prepare("SELECT * FROM return_note_items").all();
console.log('return_note_items:', return_items);
