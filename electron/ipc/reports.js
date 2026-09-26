const { runTransaction } = require('../db/connection');
const { wrapHandler } = require('./wrap');

function registerReportsHandlers(ipcMain, getDb) {
  ipcMain.handle('reports:getStocks', wrapHandler(({ startDate, endDate, page = 1, pageSize = 200 }) => {
    const db = getDb();
    const safePageSize = Math.min(pageSize || 200, 500);
    const safePage = Math.max(page || 1, 1);
    const offset = (safePage - 1) * safePageSize;

    // Build the JOIN condition — date filters go on the JOIN, not WHERE,
    // so items with no ledger activity in the range still appear (LEFT JOIN).
    let joinCondition = 'i.item_id = sl.item_id';
    const params = [];
    if (startDate && endDate) {
      joinCondition += ' AND sl.created_at >= ? AND sl.created_at <= ?';
      params.push(startDate, endDate + ' 23:59:59');
    }

    const totalRow = db.prepare(`SELECT COUNT(*) as count FROM items i`).get();

    const items = db.prepare(`
      SELECT
        i.item_id, i.sku, i.name, i.bike_model, i.type, i.stock_count,
        COALESCE(SUM(CASE WHEN sl.quantity_change > 0 THEN sl.quantity_change ELSE 0 END), 0) as stock_in,
        COALESCE(SUM(CASE WHEN sl.quantity_change < 0 THEN ABS(sl.quantity_change) ELSE 0 END), 0) as stock_out
      FROM items i
      LEFT JOIN stock_ledger sl ON ${joinCondition}
      GROUP BY i.item_id
      ORDER BY i.name ASC
      LIMIT ? OFFSET ?
    `).all(...params, safePageSize, offset);

    return { items, total: totalRow.count, page: safePage, pageSize: safePageSize };
  }));

  ipcMain.handle('reports:getGRNs', wrapHandler(({ startDate, endDate, page = 1, pageSize = 200 }) => {
    const db = getDb();
    const safePageSize = Math.min(pageSize || 200, 500);
    const safePage = Math.max(page || 1, 1);
    const offset = (safePage - 1) * safePageSize;

    const conditions = [];
    const params = [];
    if (startDate && endDate) {
      conditions.push('pr.received_date >= ? AND pr.received_date <= ?');
      params.push(startDate, endDate);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalRow = db.prepare(`
      SELECT COUNT(*) as count 
      FROM production_receipts pr
      JOIN items i ON pr.item_id = i.item_id
      JOIN batches b ON pr.batch_id = b.batch_id
      ${whereClause}
    `).get(...params);

    const receipts = db.prepare(`
      SELECT 
        pr.grn_id, pr.grn_number, pr.quantity, pr.received_date, pr.notes, pr.created_at,
        i.sku, i.name as item_name, i.bike_model,
        b.batch_ref, b.production_date
      FROM production_receipts pr
      JOIN items i ON pr.item_id = i.item_id
      JOIN batches b ON pr.batch_id = b.batch_id
      ${whereClause}
      ORDER BY pr.received_date DESC, pr.grn_id DESC
      LIMIT ? OFFSET ?
    `).all(...params, safePageSize, offset);

    return { receipts, total: totalRow.count, page: safePage, pageSize: safePageSize };
  }));

  ipcMain.handle('reports:getReturns', wrapHandler(({ startDate, endDate, page = 1, pageSize = 200 }) => {
     const db = getDb();
     const safePageSize = Math.min(pageSize || 200, 500);
     const safePage = Math.max(page || 1, 1);
     const offset = (safePage - 1) * safePageSize;

     const conditions = [];
     const params = [];
     if (startDate && endDate) {
       conditions.push('rn.return_date >= ? AND rn.return_date <= ?');
       params.push(startDate, endDate);
     }
     const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

     const totalRow = db.prepare(`
       SELECT COUNT(*) as count 
       FROM return_notes rn
       LEFT JOIN sales_orders so ON rn.so_id = so.so_id
       ${whereClause}
     `).get(...params);

     const returns = db.prepare(`
       SELECT 
         rn.return_id, rn.return_number, rn.type, rn.return_date, rn.reason, rn.status, rn.created_at,
         so.so_number
       FROM return_notes rn
       LEFT JOIN sales_orders so ON rn.so_id = so.so_id
       ${whereClause}
       ORDER BY rn.return_date DESC, rn.return_id DESC
       LIMIT ? OFFSET ?
     `).all(...params, safePageSize, offset);
     
     // Batch-fetch every line item for the whole page in one query instead of
     // one query per return note, so this stays fast as return history grows.
     const returnIds = returns.map((r) => r.return_id);
     const itemsByReturn = new Map();
     if (returnIds.length > 0) {
       const placeholders = returnIds.map(() => '?').join(',');
       const allItems = db.prepare(`
         SELECT rni.*, i.name, i.sku, i.bike_model
         FROM return_note_items rni
         JOIN items i ON rni.item_id = i.item_id
         WHERE rni.return_id IN (${placeholders})
       `).all(...returnIds);

       for (const item of allItems) {
         if (!itemsByReturn.has(item.return_id)) itemsByReturn.set(item.return_id, []);
         itemsByReturn.get(item.return_id).push(item);
       }
     }

     returns.forEach((r) => {
       r.items = itemsByReturn.get(r.return_id) || [];
     });

     return { returns, total: totalRow.count, page: safePage, pageSize: safePageSize };
  }));
}

module.exports = { registerReportsHandlers };
