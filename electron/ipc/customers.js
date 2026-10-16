const { ValidationError, NotFoundError } = require('../errors');
const { wrapHandler } = require('./wrap');
const { runTransaction } = require('../db/connection');
const { getCustomerCreditUsed, getCustomerWrittenOffTotal, getSoOutstanding, getSoRefundDue } = require('../db/creditHelpers');

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
        conditions.push('(name LIKE ? OR phone LIKE ? OR address LIKE ? OR district LIKE ?)');
        const term = `%${search}%`;
        params.push(term, term, term, term);
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

      // credit_used / total_written_off are always computed live, never stored, so they can't
      // drift from the sales_orders/credit_payments/returns data they're derived from.
      const enriched = customers.map((c) => ({
        ...c,
        credit_used: c.credit_enabled ? getCustomerCreditUsed(db, c.customer_id) : 0,
        total_written_off: getCustomerWrittenOffTotal(db, c.customer_id),
      }));

      return { customers: enriched, total: totalRow.count, page: safePage, pageSize: safePageSize };
    })
  );

  ipcMain.handle(
    'customers:create',
    wrapHandler(({ name, address, phone, district, creditEnabled, creditLimit }) => {
      if (!name || !name.trim()) throw new ValidationError('Customer name is required.');
      if (creditLimit != null && Number(creditLimit) < 0) {
        throw new ValidationError('Credit limit cannot be negative.');
      }

      const db = getDb();
      const result = db
        .prepare('INSERT INTO customers (name, address, phone, district, credit_enabled, credit_limit) VALUES (?, ?, ?, ?, ?, ?)')
        .run(name.trim(), address || null, phone || null, district || null, creditEnabled ? 1 : 0, Number(creditLimit) || 0);

      return db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(result.lastInsertRowid);
    })
  );

  ipcMain.handle(
    'customers:update',
    wrapHandler(({ customerId, name, address, phone, district, creditEnabled, creditLimit }) => {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(customerId);
      if (!existing) throw new NotFoundError('Customer not found.');

      const finalCreditEnabled = creditEnabled !== undefined ? (creditEnabled ? 1 : 0) : existing.credit_enabled;
      const finalCreditLimit = creditLimit !== undefined ? Number(creditLimit) || 0 : existing.credit_limit;

      if (finalCreditLimit < 0) throw new ValidationError('Credit limit cannot be negative.');

      // Only worth checking when the limit is actually being lowered — never blocks raising it
      // or leaving it unchanged, even if usage already happens to exceed the current limit.
      if (finalCreditLimit < existing.credit_limit) {
        const currentlyUsed = getCustomerCreditUsed(db, customerId);
        if (currentlyUsed > finalCreditLimit) {
          throw new ValidationError(
            `Cannot set the credit limit below Rs. ${currentlyUsed.toFixed(2)} — that's what "${existing.name}" currently owes on unpaid credit sales.`
          );
        }
      }

      db.prepare(
        'UPDATE customers SET name = ?, address = ?, phone = ?, district = ?, credit_enabled = ?, credit_limit = ? WHERE customer_id = ?'
      ).run(
        name?.trim() || existing.name,
        address !== undefined ? address : existing.address,
        phone !== undefined ? phone : existing.phone,
        district !== undefined ? (district || null) : existing.district,
        finalCreditEnabled,
        finalCreditLimit,
        customerId
      );

      return db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(customerId);
    })
  );

  ipcMain.handle(
    'customers:getCreditHistory',
    wrapHandler(({ customerId }) => {
      const db = getDb();
      const customer = db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(customerId);
      if (!customer) throw new NotFoundError('Customer not found.');

      const orders = db
        .prepare(
          `SELECT so.so_id, so.so_number, so.order_date, so.credit_status, so.credit_due_date,
                  so.written_off_amount, so.written_off_at, so.written_off_note,
                  (SELECT COALESCE(SUM(soi.quantity * soi.unit_price), 0) FROM sales_order_items soi WHERE soi.so_id = so.so_id) AS total_amount,
                  (SELECT COALESCE(SUM(cp.amount), 0) FROM credit_payments cp WHERE cp.so_id = so.so_id) AS paid_amount
           FROM sales_orders so
           WHERE so.customer_id = ? AND so.payment_type = 'CREDIT'
           ORDER BY so.order_date DESC, so.so_id DESC`
        )
        .all(customerId)
        .map((o) => ({
          ...o,
          outstanding: o.credit_status === 'WRITTEN_OFF' ? 0 : getSoOutstanding(db, o.so_id),
          refundDue: o.credit_status === 'WRITTEN_OFF' ? 0 : getSoRefundDue(db, o.so_id),
        }));

      return {
        customerName: customer.name,
        totalWrittenOff: getCustomerWrittenOffTotal(db, customerId),
        orders,
      };
    })
  );

  // List every active item alongside this customer's price overrides, if any — the basis for
  // the "Manage Pricing" screen (default price shown until the customer has a custom one).
  ipcMain.handle(
    'customers:getItemPrices',
    wrapHandler(({ customerId }) => {
      const db = getDb();
      const customer = db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(customerId);
      if (!customer) throw new NotFoundError('Customer not found.');

      const items = db
        .prepare(
          `SELECT i.item_id, i.sku, i.name, i.bike_model, i.stock_count, i.unit_price AS default_price,
                  cip.unit_price AS custom_price
           FROM items i
           LEFT JOIN customer_item_prices cip ON cip.item_id = i.item_id AND cip.customer_id = ?
           WHERE i.is_active = 1
           ORDER BY i.name ASC`
        )
        .all(customerId);

      return { customerName: customer.name, items };
    })
  );

  // Set (or, with unitPrice null, clear) this customer's override price for one item.
  ipcMain.handle(
    'customers:setItemPrice',
    wrapHandler(({ customerId, itemId, unitPrice }) => {
      const db = getDb();
      const customer = db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(customerId);
      if (!customer) throw new NotFoundError('Customer not found.');
      const item = db.prepare('SELECT * FROM items WHERE item_id = ? AND is_active = 1').get(itemId);
      if (!item) throw new NotFoundError('Item not found or is archived.');

      if (unitPrice != null && Number(unitPrice) < 0) {
        throw new ValidationError('Custom price cannot be negative.');
      }

      runTransaction(db, () => {
        db.prepare('DELETE FROM customer_item_prices WHERE customer_id = ? AND item_id = ?').run(customerId, itemId);
        if (unitPrice != null) {
          db.prepare(
            'INSERT INTO customer_item_prices (customer_id, item_id, unit_price) VALUES (?, ?, ?)'
          ).run(customerId, itemId, Number(unitPrice));
        }
      });

      return { customerId, itemId, unitPrice: unitPrice != null ? Number(unitPrice) : null };
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
