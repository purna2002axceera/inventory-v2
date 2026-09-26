const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

async function generatePDF(htmlContent) {
  // Receipts can embed a base64 logo, which makes the HTML too large for a data: URL
  // (loadURL silently never fires did-finish-load past a couple MB once percent-encoded,
  // which left the caller hanging on "Generating..." forever). A temp file has no such limit.
  const tempFile = path.join(os.tmpdir(), `receipt-${crypto.randomUUID()}.html`);
  fs.writeFileSync(tempFile, htmlContent, 'utf-8');

  return new Promise((resolve, reject) => {
    let win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    const cleanup = () => {
      win.destroy();
      fs.unlink(tempFile, () => {});
    };

    win.webContents.on('did-finish-load', async () => {
      try {
        const pdfData = await win.webContents.printToPDF({
          printBackground: true,
          margin: {
            marginType: 'printableArea'
          }
        });
        resolve(pdfData);
      } catch (err) {
        reject(err);
      } finally {
        cleanup();
      }
    });

    win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      reject(new Error(`Failed to load PDF content: ${errorDescription} (${errorCode})`));
      cleanup();
    });

    win.loadFile(tempFile);
  });
}

// Reads a file from renderer/public (dev) or renderer/out (packaged) and returns it as a data: URI,
// since the hidden BrowserWindow used for printToPDF loads a standalone data: URL with no base to
// resolve relative asset paths against.
function resolvePublicAssetDataUri(publicPath) {
  if (!publicPath) return null;
  const relative = publicPath.replace(/^\/+/, '');
  const baseDir = app.isPackaged
    ? path.join(__dirname, '..', 'renderer', 'out')
    : path.join(__dirname, '..', 'renderer', 'public');
  const filePath = path.join(baseDir, relative);
  if (!fs.existsSync(filePath)) return null;

  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = ext === 'jpg' ? 'jpeg' : ext || 'png';
  const data = fs.readFileSync(filePath).toString('base64');
  return `data:image/${mime};base64,${data}`;
}

function renderReceiptHTML(receipt) {
  const { soNumber, customerName, customerPhone, orderDate, logoPath, businessDetails, items, total } = receipt;
  const logoDataUri = resolvePublicAssetDataUri(logoPath);

  const ITEMS_PER_PAGE = 16;
  const pages = [];
  for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
    pages.push(items.slice(i, i + ITEMS_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]);
  const totalPages = pages.length;

  const customerLine = [customerName, customerPhone, orderDate].filter(Boolean).join(' &bull; ');

  const pagesHTML = pages.map((pageItems, pageIndex) => `
    <div class="receipt-page"${pageIndex < totalPages - 1 ? ' style="page-break-after: always;"' : ''}>
      <div class="header">
        <div class="header-top">
          ${logoDataUri ? `<img src="${logoDataUri}" alt="Logo" />` : ''}
          ${businessDetails ? `
            <div class="biz-details">
              <div class="name">${businessDetails.name}</div>
              <div>${businessDetails.address}</div>
              ${businessDetails.phones && businessDetails.phones.length > 0 ? `<div>Tel: ${businessDetails.phones.join(' / ')}</div>` : ''}
              <div>${businessDetails.email}</div>
              ${businessDetails.regNo ? `<div>Reg No. ${businessDetails.regNo}</div>` : ''}
            </div>
          ` : ''}
        </div>
        <h2 class="title">Sales Order Receipt</h2>
      </div>

      <div class="customer-info">
        ${customerLine}
        ${totalPages > 1 ? `<span class="page-indicator">Page ${pageIndex + 1} of ${totalPages}</span>` : ''}
      </div>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th class="text-right">Qty</th>
            <th class="text-right">Unit Price</th>
            <th class="text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${pageItems.map(line => `
            <tr>
              <td>${line.name} <span class="sku">${line.sku}</span></td>
              <td class="text-right">${line.quantity}${line.returned > 0 ? `<span class="returned">(${line.returned} returned)</span>` : ''}</td>
              <td class="text-right">Rs. ${line.unitPrice.toFixed(2)}</td>
              <td class="text-right">Rs. ${(line.quantity * line.unitPrice).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${pageIndex === totalPages - 1 ? `
        <div class="total">Total: Rs. ${total.toFixed(2)}</div>
        <div class="footer">Developed by CA Software Solutions 0770301793</div>
      ` : ''}
    </div>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${soNumber}</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #171717; margin: 0; }
        .receipt-page { padding: 8mm 10mm; box-sizing: border-box; min-height: 100vh; display: flex; flex-direction: column; }
        .header { margin-bottom: 20px; border-bottom: 1px solid #e5e7eb; padding-bottom: 14px; }
        .header-top { display: flex; align-items: center; justify-content: center; gap: 28px; margin-bottom: 12px; }
        .header img { height: 170px; width: 170px; object-fit: contain; flex-shrink: 0; }
        .biz-details { font-size: 12px; color: #111; line-height: 1.5; text-align: left; }
        .biz-details .name { font-weight: 700; font-size: 24px; margin-bottom: 4px; }
        .title { font-size: 18px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin: 0; text-align: center; }
        .customer-info { font-size: 13px; font-weight: 500; color: #111; margin-bottom: 8px; overflow: hidden; }
        .page-indicator { float: right; font-size: 11px; color: #6b7280; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px 6px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 13px; }
        th { font-size: 11px; text-transform: uppercase; color: #4b5563; }
        .text-right { text-align: right; }
        .sku { font-size: 11px; font-family: monospace; color: #6b7280; margin-left: 4px; }
        .returned { font-size: 11px; color: #dc2626; margin-left: 4px; }
        .total { text-align: right; font-weight: 700; margin-top: 16px; font-size: 14px; }
        .footer { text-align: center; font-size: 11px; color: #555; padding: 10px 0; margin-top: auto; }
      </style>
    </head>
    <body>
      ${pagesHTML}
    </body>
    </html>
  `;
}

function renderReportHTML(reportData) {
  if (reportData.type === 'detailed') return renderDetailedReportHTML(reportData);
  if (reportData.type === 'summary') return renderSummaryReportHTML(reportData);
  if (reportData.type === 'stocks') return renderStocksReportHTML(reportData);
  if (reportData.type === 'grns') return renderGRNsReportHTML(reportData);
  if (reportData.type === 'returns') return renderReturnsReportHTML(reportData);
  return renderSummaryReportHTML(reportData); // fallback
}

function renderStocksReportHTML(reportData) {
  const { dateFrom, dateTo, data } = reportData;
  const rows = data.map(item => `
    <tr>
      <td>
        <div class="font-medium">${item.name}</div>
        <div class="text-muted">${item.sku}</div>
      </td>
      <td>${item.bike_model || '-'}</td>
      <td class="text-right text-green">+${item.stock_in}</td>
      <td class="text-right text-red">-${item.stock_out}</td>
      <td class="text-right font-bold">${item.stock_count}</td>
    </tr>
  `).join('');

  return generateBaseReportHTML('Item Stocks Ledger', dateFrom, dateTo, `
    <table>
      <thead>
        <tr>
          <th>Item / SKU</th>
          <th>Model</th>
          <th class="text-right">Stock In</th>
          <th class="text-right">Stock Out</th>
          <th class="text-right">Current Stock</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="5" class="text-center text-muted">No data found.</td></tr>'}
      </tbody>
    </table>
  `);
}

function renderGRNsReportHTML(reportData) {
  const { dateFrom, dateTo, data } = reportData;
  const rows = data.map(grn => `
    <tr>
      <td>${grn.received_date}</td>
      <td class="font-medium">${grn.grn_number}</td>
      <td>
        <div class="font-medium">${grn.item_name}</div>
        <div class="text-muted">${grn.sku}</div>
      </td>
      <td>${grn.batch_ref || '-'}</td>
      <td class="text-right font-bold text-green">+${grn.quantity}</td>
      <td>${grn.notes || '-'}</td>
    </tr>
  `).join('');

  return generateBaseReportHTML('Goods Receipts (GRN)', dateFrom, dateTo, `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>GRN No.</th>
          <th>Item</th>
          <th>Batch</th>
          <th class="text-right">Qty Received</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="6" class="text-center text-muted">No Goods Receipts found.</td></tr>'}
      </tbody>
    </table>
  `);
}

function renderReturnsReportHTML(reportData) {
  const { dateFrom, dateTo, data } = reportData;
  const rows = data.map(rn => `
    <tr>
      <td>${rn.return_date}</td>
      <td class="font-medium">${rn.return_number}</td>
      <td>${rn.type}</td>
      <td>${rn.so_number || 'N/A'}</td>
      <td>${rn.status}</td>
      <td>
        <ul style="margin: 0; padding-left: 20px;">
          ${(rn.items || []).map(i => `<li>${i.name} x${i.quantity} (${i.condition})</li>`).join('')}
        </ul>
      </td>
    </tr>
  `).join('');

  return generateBaseReportHTML('Return Notes', dateFrom, dateTo, `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Return No.</th>
          <th>Type</th>
          <th>Related Order</th>
          <th>Status</th>
          <th>Items Returned</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="6" class="text-center text-muted">No Return Notes found.</td></tr>'}
      </tbody>
    </table>
  `);
}

function generateBaseReportHTML(title, dateFrom, dateTo, content) {
  const periodText = dateFrom || dateTo 
    ? `For the period: ${dateFrom || 'Start'} to ${dateTo || 'End'}` 
    : 'All Time';
    
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 0; padding: 40px; font-size: 13px; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .font-bold { font-weight: bold; }
        .font-medium { font-weight: 500; }
        .text-muted { color: #6b7280; font-size: 0.85em; }
        .text-red { color: #dc2626; }
        .text-green { color: #16a34a; }
        .header { border-bottom: 2px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { margin: 0 0 10px 0; font-size: 28px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
        th, td { padding: 10px 6px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
        th { background-color: #f9fafb; font-size: 0.9em; text-transform: uppercase; color: #4b5563; }
        .footer { margin-top: 50px; text-align: center; font-size: 0.85em; color: #9ca3af; }
      </style>
    </head>
    <body>
      <div class="header text-center">
        <h1>${title}</h1>
        <div class="text-muted">${periodText}</div>
      </div>
      ${content}
      <div class="footer">
        Generated on ${new Date().toLocaleString()}
      </div>
    </body>
    </html>
  `;
}


function renderDetailedReportHTML(reportData) {
  const { dateFrom, dateTo, orders, totalRevenue } = reportData;

  const ordersHTML = orders.map(o => {
    const linesHTML = o.lines.map(l => `
      <tr>
        <td>
          <div class="font-medium">${l.itemName}</div>
          <div class="text-muted">${l.itemSku}</div>
        </td>
        <td class="text-right">${l.quantity}</td>
        <td class="text-right nowrap">Rs. ${l.unitPrice.toFixed(2)}</td>
        <td class="text-right nowrap">Rs. ${l.totalPrice.toFixed(2)}</td>
      </tr>
    `).join('');

    return `
      <div class="order-block">
        <div class="order-header">
          <div>
            <div class="font-bold" style="font-size: 1.1em">${o.soNumber}</div>
            <div class="text-muted">${new Date(o.orderDate).toLocaleDateString()}</div>
          </div>
          <div class="text-right">
            <div class="font-medium">${o.customerName}</div>
            <div class="font-bold ${o.status === 'CANCELLED' ? 'text-red' : 'text-green'}">${o.status}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Unit Price</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${linesHTML}
          </tbody>
        </table>
        <div class="order-footer">
          Order Total: Rs. ${o.totalAmount.toFixed(2)}
        </div>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Detailed Sales Orders Report</title>
      <style>
        body {
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          color: #333;
          margin: 0;
          padding: 40px;
          font-size: 13px;
        }
        .nowrap { white-space: nowrap; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .font-bold { font-weight: bold; }
        .font-medium { font-weight: 500; }
        .text-muted { color: #6b7280; font-size: 0.85em; }
        .text-red { color: #dc2626; }
        .text-green { color: #16a34a; }
        
        .header {
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }
        .header h1 {
          margin: 0 0 10px 0;
          font-size: 28px;
        }
        
        .order-block {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 20px;
          page-break-inside: avoid;
        }
        .order-header {
          display: flex;
          justify-content: space-between;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 10px;
          margin-bottom: 10px;
        }
        .order-footer {
          text-align: right;
          font-size: 1.1em;
          font-weight: bold;
          border-top: 1px solid #e5e7eb;
          padding-top: 10px;
          margin-top: 10px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }
        th, td {
          padding: 6px 6px;
          border-bottom: 1px solid #f3f4f6;
          text-align: left;
        }
        th {
          background-color: #f9fafb;
          font-size: 0.9em;
          text-transform: uppercase;
          color: #4b5563;
        }
        
        .summary-box {
          padding: 20px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          background-color: #f9fafb;
          text-align: right;
          margin-top: 30px;
        }
        .summary-box .title {
          font-size: 0.9em;
          color: #6b7280;
          margin-bottom: 8px;
        }
        .summary-box .value {
          font-size: 24px;
          font-weight: bold;
        }
        
        .footer {
          margin-top: 50px;
          text-align: center;
          font-size: 0.85em;
          color: #9ca3af;
        }
      </style>
    </head>
    <body>
      <div class="header text-center">
        <h1>Detailed Sales Orders Report</h1>
        <div class="text-muted">For the period: ${dateFrom} to ${dateTo}</div>
      </div>
      
      ${ordersHTML || '<div class="text-center text-muted" style="padding: 40px">No sales orders found in this period.</div>'}
      
      <div class="summary-box">
        <div class="title">Total Revenue (Completed Orders)</div>
        <div class="value">Rs. ${totalRevenue.toFixed(2)}</div>
      </div>
      
      <div class="footer">
        Generated on ${new Date().toLocaleString()}
      </div>
    </body>
    </html>
  `;
}

function renderSummaryReportHTML(reportData) {
  const { dateFrom, dateTo, items, totalSales, totalDamagedLoss, totalProfit } = reportData;

  const itemsRows = items.map(item => `
    <tr>
      <td>
        <div class="font-medium">${item.name}</div>
        <div class="text-muted">${item.sku}</div>
      </td>
      <td class="text-right">${item.quantitySold}</td>
      <td class="text-right nowrap">Rs. ${item.latestUnitCost.toFixed(2)}</td>
      <td class="text-right nowrap">Rs. ${item.totalRevenue.toFixed(2)}</td>
      <td class="text-right nowrap">Rs. ${item.totalCost.toFixed(2)}</td>
      <td class="text-right text-red nowrap">Rs. ${item.damagedLoss.toFixed(2)}</td>
      <td class="text-right font-medium nowrap ${item.profit < 0 ? 'text-red' : 'text-green'}">Rs. ${item.profit.toFixed(2)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Sales & Profitability Report</title>
      <style>
        body {
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          color: #333;
          margin: 0;
          padding: 40px;
          font-size: 13px;
        }
        .nowrap { white-space: nowrap; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .font-bold { font-weight: bold; }
        .font-medium { font-weight: 500; }
        .text-muted { color: #6b7280; font-size: 0.85em; }
        .text-red { color: #dc2626; }
        .text-green { color: #16a34a; }
        
        .header {
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }
        .header h1 {
          margin: 0 0 10px 0;
          font-size: 28px;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 40px;
        }
        th, td {
          padding: 10px 6px;
          border-bottom: 1px solid #e5e7eb;
          text-align: left;
        }
        th {
          background-color: #f9fafb;
          font-size: 0.9em;
          text-transform: uppercase;
          color: #4b5563;
        }
        
        .summary-grid {
          display: flex;
          gap: 20px;
        }
        .summary-box {
          flex: 1;
          padding: 20px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          background-color: #f9fafb;
        }
        .summary-box.red-box {
          background-color: #fef2f2;
          border-color: #fecaca;
        }
        .summary-box .title {
          font-size: 0.9em;
          color: #6b7280;
          margin-bottom: 8px;
        }
        .summary-box.red-box .title {
          color: #dc2626;
        }
        .summary-box .value {
          font-size: 24px;
          font-weight: bold;
        }
        
        .footer {
          margin-top: 50px;
          text-align: center;
          font-size: 0.85em;
          color: #9ca3af;
        }
      </style>
    </head>
    <body>
      <div class="header text-center">
        <h1>Sales & Profitability Report</h1>
        <div class="text-muted">For the period: ${dateFrom} to ${dateTo}</div>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>Item / SKU</th>
            <th class="text-right">Qty Sold</th>
            <th class="text-right">Unit Cost</th>
            <th class="text-right">Total Revenue</th>
            <th class="text-right">Total Cost</th>
            <th class="text-right">Damaged Loss</th>
            <th class="text-right">Profit</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows || '<tr><td colspan="7" class="text-center text-muted">No sales found in this period.</td></tr>'}
        </tbody>
      </table>
      
      <div class="summary-grid">
        <div class="summary-box">
          <div class="title">Total Sales Revenue</div>
          <div class="value">Rs. ${totalSales.toFixed(2)}</div>
        </div>
        <div class="summary-box red-box">
          <div class="title">Total Damaged Loss</div>
          <div class="value text-red">Rs. ${totalDamagedLoss.toFixed(2)}</div>
        </div>
        <div class="summary-box">
          <div class="title">Total Profit</div>
          <div class="value ${totalProfit < 0 ? 'text-red' : 'text-green'}">Rs. ${totalProfit.toFixed(2)}</div>
        </div>
      </div>
      
      <div class="footer">
        Generated on ${new Date().toLocaleString()}
      </div>
    </body>
    </html>
  `;
}

module.exports = { generatePDF, renderReportHTML, renderReceiptHTML };
