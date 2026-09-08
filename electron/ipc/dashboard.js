const { wrapHandler } = require('./wrap');

function registerDashboardHandlers(ipcMain, getDb) {
  ipcMain.handle(
    'dashboard:getMetrics',
    wrapHandler(({ timeRange = 'all' } = {}, event) => {
      const db = getDb();
      
      let soDateFilter = '';
      let rnDateFilter = '';
      
      if (timeRange === 'today') {
        soDateFilter = " AND so.order_date >= date('now', 'localtime', 'start of day') ";
        rnDateFilter = " AND rn.return_date >= date('now', 'localtime', 'start of day') ";
      } else if (timeRange === '7d') {
        soDateFilter = " AND so.order_date >= date('now', '-7 days') ";
        rnDateFilter = " AND rn.return_date >= date('now', '-7 days') ";
      } else if (timeRange === '30d') {
        soDateFilter = " AND so.order_date >= date('now', '-30 days') ";
        rnDateFilter = " AND rn.return_date >= date('now', '-30 days') ";
      }

      // 1. Summary Cards
      const revenueRow = db.prepare(`
        SELECT SUM(soi.quantity * soi.unit_price) as totalRevenue 
        FROM sales_order_items soi 
        JOIN sales_orders so ON so.so_id = soi.so_id 
        WHERE so.status = 'COMPLETED' ${soDateFilter}
      `).get();
      
      const ordersRow = db.prepare(`
        SELECT COUNT(*) as totalOrders 
        FROM sales_orders so
        WHERE so.status = 'COMPLETED' ${soDateFilter}
      `).get();
      
      const returnsRow = db.prepare(`
        SELECT SUM(quantity) as totalReturns 
        FROM return_note_items rni
        JOIN return_notes rn ON rn.return_id = rni.return_id
        WHERE rn.status != 'REJECTED' ${rnDateFilter}
      `).get();

      const lowStockRow = db.prepare(`
        SELECT COUNT(*) as lowStockCount 
        FROM items 
        WHERE stock_count <= 10 AND is_active = 1
      `).get();

      // 2. Sales By Month (or Day if filtering)
      // If timeRange is 7d or 30d, group by day. Otherwise group by month.
      const isDaily = timeRange === '7d' || timeRange === '30d' || timeRange === 'today';
      const dateFormat = isDaily ? '%Y-%m-%d' : '%Y-%m';
      const limit = timeRange === 'all' ? 12 : 30;

      const salesByMonth = db.prepare(`
        SELECT 
          strftime('${dateFormat}', so.order_date) as month,
          SUM(soi.quantity * soi.unit_price) as revenue,
          SUM(soi.quantity) as quantity
        FROM sales_order_items soi
        JOIN sales_orders so ON so.so_id = soi.so_id
        WHERE so.status = 'COMPLETED' ${soDateFilter}
        GROUP BY strftime('${dateFormat}', so.order_date)
        ORDER BY month ASC
        LIMIT ${limit}
      `).all();

      // 3. Top Selling Items (By Quantity)
      const topSellingItems = db.prepare(`
        SELECT 
          i.name,
          i.sku,
          SUM(soi.quantity) as quantity,
          SUM(soi.quantity * soi.unit_price) as revenue
        FROM sales_order_items soi
        JOIN sales_orders so ON so.so_id = soi.so_id
        JOIN items i ON i.item_id = soi.item_id
        WHERE so.status = 'COMPLETED' ${soDateFilter}
        GROUP BY i.item_id
        ORDER BY quantity DESC
        LIMIT 5
      `).all();

      // 4. Most Returned Items
      const mostReturnedItems = db.prepare(`
        SELECT 
          i.name,
          i.sku,
          SUM(rni.quantity) as quantity
        FROM return_note_items rni
        JOIN return_notes rn ON rn.return_id = rni.return_id
        JOIN items i ON i.item_id = rni.item_id
        WHERE rn.status != 'REJECTED' ${rnDateFilter}
        GROUP BY i.item_id
        ORDER BY quantity DESC
        LIMIT 5
      `).all();

      return {
        summary: {
          totalRevenue: revenueRow.totalRevenue || 0,
          totalOrders: ordersRow.totalOrders || 0,
          totalReturns: returnsRow.totalReturns || 0,
          lowStockCount: lowStockRow.lowStockCount || 0,
        },
        salesByMonth,
        topSellingItems,
        mostReturnedItems,
      };
    })
  );
}

module.exports = { registerDashboardHandlers };
