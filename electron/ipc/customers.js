const { ValidationError, NotFoundError } = require('../errors');
const { wrapHandler } = require('./wrap');

function registerCustomersHandlers(ipcMain, getDb) {
  ipcMain.handle(
    'customers:list',
    wrapHandler(({ page = 1, pageSize = 50, search, district } = {}) => {
      const db = getDb();
      const safePageSize = Math.min(pageSize || 50, 200);
      const safePage = Math.max(page || 1, 1);
      const offset = (safePage - 1) * safePageSize;

      console.log(`BACKEND -> Received customers:list request for page ${safePage}, search: ${search || 'none'}, district: ${district || 'none'}`);

      const conditions = ['1=1'];
      const params = [];

      if (search) {
        conditions.push('(name LIKE ? OR phone LIKE ? OR address LIKE ?)');
        const term = `%${search}%`;
        params.push(term, term, term);
      }

      if (district && district !== 'ALL') {
        conditions.push('district = ?');
        params.push(district);
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      const totalRow = db.prepare(`SELECT COUNT(*) as count FROM customers ${whereClause}`).get(...params);

      const customers = db
        .prepare(`SELECT * FROM customers ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .all(...params, safePageSize, offset);

      return { customers, total: totalRow.count, page: safePage, pageSize: safePageSize };
    })
  );

  ipcMain.handle(
    'customers:create',
    wrapHandler(({ name, address, phone, district }) => {
      if (!name || !name.trim()) throw new ValidationError('Customer name is required.');

      const db = getDb();
      const result = db
        .prepare('INSERT INTO customers (name, address, phone, district) VALUES (?, ?, ?, ?)')
        .run(name.trim(), address || null, phone || null, district || null);

      return db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(result.lastInsertRowid);
    })
  );

  ipcMain.handle(
    'customers:update',
    wrapHandler(({ customerId, name, address, phone, district }) => {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(customerId);
      if (!existing) throw new NotFoundError('Customer not found.');

      db.prepare('UPDATE customers SET name = ?, address = ?, phone = ?, district = ? WHERE customer_id = ?').run(
        name?.trim() || existing.name,
        address !== undefined ? address : existing.address,
        phone !== undefined ? phone : existing.phone,
        district !== undefined ? (district || null) : existing.district,
        customerId
      );

      return db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(customerId);
    })
  );

  ipcMain.handle(
    'customers:delete',
    wrapHandler(({ customerId }) => {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(customerId);
      if (!existing) throw new NotFoundError('Customer not found.');

      if (existing.sales_order_count > 0 || existing.return_note_count > 0) {
        throw new ValidationError('Cannot delete customer with existing sales orders or return notes.');
      }

      db.prepare('DELETE FROM customers WHERE customer_id = ?').run(customerId);
      return { success: true };
    })
  );
}

module.exports = { registerCustomersHandlers };
