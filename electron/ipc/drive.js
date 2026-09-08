const { app, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { google } = require('googleapis');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI = 'http://127.0.0.1:3456/callback';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const TOKEN_PATH = path.join(app.getPath('userData'), 'google_drive_token.enc');

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID || CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials are not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
  }
  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
}

function saveTokens(tokens) {
  const data = JSON.stringify(tokens);
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(data);
    fs.writeFileSync(TOKEN_PATH, encrypted);
  } else {
    fs.writeFileSync(TOKEN_PATH, data);
  }
}

function loadTokens() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = fs.readFileSync(TOKEN_PATH);
      const decrypted = safeStorage.decryptString(encrypted);
      return JSON.parse(decrypted);
    } else {
      const data = fs.readFileSync(TOKEN_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading tokens', err);
    return null;
  }
}

async function cleanupOldBackups(drive) {
  try {
    // The drive.file scope only allows us to see files created by this app anyway.
    const res = await drive.files.list({
      q: "name contains 'inventory-backup' and trashed = false",
      fields: 'files(id, name, createdTime)',
      orderBy: 'createdTime desc'
    });

    const files = res.data.files || [];
    const MAX_BACKUPS = 100; // Keep the 100 most recent backups

    if (files.length > MAX_BACKUPS) {
      const filesToDelete = files.slice(MAX_BACKUPS);
      for (const file of filesToDelete) {
        await drive.files.delete({ fileId: file.id });
        console.log(`Deleted old backup: ${file.name}`);
      }
    }
  } catch (err) {
    console.error("Cleanup old backups failed:", err);
  }
}

async function performBackup(getDb) {
  const tokens = loadTokens();
  if (!tokens) throw new Error('Not connected to Google Drive');

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(tokens);
  
  if (getDb) {
    try {
      const db = getDb();
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch (e) {
      console.warn("Checkpoint warning before backup:", e.message);
    }
  }

  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const dbPath = path.join(app.getPath('userData'), 'inventory.db');
  
  const dateStr = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const fileName = `inventory-backup-${dateStr}.sqlite`;

  const fileMetadata = {
    name: fileName,
  };
  
  const media = {
    mimeType: 'application/x-sqlite3',
    body: fs.createReadStream(dbPath),
  };

  const res = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id',
  });
  
  // Clean up older backups in the background
  cleanupOldBackups(drive);

  return { success: true, fileId: res.data.id };
}

let currentAuthServer = null;

function registerDriveHandlers(ipcMain, getDb) {
  ipcMain.handle('drive:status', async () => {
    const tokens = loadTokens();
    return { connected: !!tokens };
  });

  ipcMain.handle('drive:connect', async () => {
    return new Promise((resolve, reject) => {
      if (currentAuthServer) {
        currentAuthServer.close();
        currentAuthServer = null;
      }
      
      try {
        currentAuthServer = http.createServer(async (req, res) => {
          try {
            if (req.url.indexOf('/callback') > -1) {
              const qs = new URL(req.url, 'http://127.0.0.1:3456').searchParams;
              const code = qs.get('code');
              
              if (!code) {
                 res.end('Authentication failed. No code found. You can close this tab.');
                 if (currentAuthServer) currentAuthServer.close();
                 return resolve({ success: false, error: "No code received" });
              }

              res.end('Authentication successful! You can close this tab and return to the Inventory App.');
              if (currentAuthServer) currentAuthServer.close();
              currentAuthServer = null;
              
              const oauth2Client = getOAuthClient();
              const { tokens } = await oauth2Client.getToken(code);
              saveTokens(tokens);
              resolve({ success: true });
            }
          } catch (e) {
            console.error("Auth server error:", e);
            reject(e);
          }
        }).listen(3456, '127.0.0.1', () => {
          const oauth2Client = getOAuthClient();
          const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            prompt: 'consent'
          });
          shell.openExternal(authUrl);
        });
      } catch (err) {
        reject(err);
      }
    });
  });

  ipcMain.handle('drive:disconnect', async () => {
    if (fs.existsSync(TOKEN_PATH)) {
      fs.unlinkSync(TOKEN_PATH);
    }
    return { success: true };
  });

  ipcMain.handle('drive:backup', async () => {
    try {
      const result = await performBackup(getDb);
      return result;
    } catch (error) {
      console.error("Backup failed:", error);
      return { success: false, error: error.message };
    }
  });
  
  setInterval(async () => {
    const tokens = loadTokens();
    if (tokens) {
      console.log("Running automatic interval backup...");
      try {
        await performBackup(getDb);
        console.log("Interval backup successful.");
      } catch (e) {
        console.error("Interval backup failed:", e);
      }
    }
  }, 6 * 60 * 60 * 1000);
}

module.exports = { registerDriveHandlers, performBackup, loadTokens };
