const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables (.env in dev or next to executable in production)
const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env')
  : path.join(__dirname, '..', '.env');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const serve = require('electron-serve').default;
const loadURL = serve({ directory: path.join(__dirname, '..', 'renderer', 'out') });
const bcrypt = require('bcryptjs');

const { getDb } = require('./db/connection');
const { runMigrations } = require('./migrate');
const { registerAuthHandlers } = require('./ipc/auth');
const { registerItemsHandlers } = require('./ipc/items');
const { registerProductionHandlers } = require('./ipc/production');
const { registerCustomersHandlers } = require('./ipc/customers');
const { registerSalesOrdersHandlers } = require('./ipc/salesOrders');
const { registerReturnsHandlers } = require('./ipc/returns');
const { registerStockAdjustmentsHandlers } = require('./ipc/stockAdjustments');
const { registerDashboardHandlers } = require('./ipc/dashboard');
const { registerReportsHandlers } = require('./ipc/reports');
const { registerDriveHandlers, performBackup } = require('./ipc/drive');
const { registerLicenseHandlers } = require('./ipc/license');
const { generatePDF, renderReportHTML, renderReceiptHTML } = require('./pdfGenerator');

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:3000');
    win.webContents.openDevTools();
  } else {
    loadURL(win);
  }
}

function seedDefaultUser(db) {
  try {
    const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
    if (row.count === 0) {
      const passwordHash = bcrypt.hashSync('admin123', 10);
      db.prepare('INSERT INTO users (username, password_hash, full_name) VALUES (?, ?, ?)')
        .run('admin', passwordHash, 'Administrator');
      console.log('Seeded default admin user');
    }
  } catch (err) {
    console.error('Failed to seed default user:', err);
  }
}

app.whenReady().then(() => {
  const db = getDb();
  runMigrations(db);
  seedDefaultUser(db);

  registerAuthHandlers(ipcMain, getDb);
  registerItemsHandlers(ipcMain, getDb);
  registerProductionHandlers(ipcMain, getDb);
  registerCustomersHandlers(ipcMain, getDb);
  registerSalesOrdersHandlers(ipcMain, getDb);
  registerReturnsHandlers(ipcMain, getDb);
  registerStockAdjustmentsHandlers(ipcMain, getDb);
  registerDashboardHandlers(ipcMain, getDb);
  registerReportsHandlers(ipcMain, getDb);
  registerDriveHandlers(ipcMain, getDb);
  registerLicenseHandlers(ipcMain);

  ipcMain.handle('system:printToPDF', async (event, reportData) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { filePath } = await dialog.showSaveDialog(win, {
      title: 'Save PDF',
      defaultPath: 'Sales_Report.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (filePath) {
      try {
        const html = renderReportHTML(reportData);
        const data = await generatePDF(html);
        fs.writeFileSync(filePath, data);
        return { success: true, filePath };
      } catch (err) {
        console.error("PDF generation failed:", err);
        return { success: false, error: err.message };
      }
    }
    return { success: false };
  });

  ipcMain.handle('system:generateReceiptPdf', async (event, { receiptData, filename }) => {
    try {
      const html = renderReceiptHTML(receiptData);
      const data = await generatePDF(html);
      const defaultPath = path.join(app.getPath('desktop'), filename);
      fs.writeFileSync(defaultPath, data);
      return { success: true, filePath: defaultPath };
    } catch (err) {
      console.error('generateReceiptPdf failed', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('system:openExternal', async (event, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

let isQuitting = false;
app.on('before-quit', async (event) => {
  if (isQuitting) return;
  event.preventDefault();
  
  try {
     console.log("Attempting automatic backup on quit...");
     await performBackup(getDb);
     console.log("On-quit backup successful.");
  } catch (err) {
     if (err.message !== 'Not connected to Google Drive') {
        console.error("Backup on quit failed:", err);
     }
  } finally {
     isQuitting = true;
     app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});