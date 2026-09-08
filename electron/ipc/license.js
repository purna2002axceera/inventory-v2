const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { getMachineId, verifyLicenseKey } = require('../license-utils');

function getLicensePath() {
  return path.join(app.getPath('userData'), 'license.json');
}

function registerLicenseHandlers(ipcMain) {
  ipcMain.handle('license:status', async () => {
    const hwid = getMachineId();
    const licensePath = getLicensePath();
    
    let activated = false;
    if (fs.existsSync(licensePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(licensePath, 'utf8'));
        if (verifyLicenseKey(hwid, data.licenseKey)) {
          activated = true;
        }
      } catch (err) {
        console.error('Failed to read license file:', err);
      }
    }
    
    return { hwid, activated };
  });

  ipcMain.handle('license:activate', async (event, key) => {
    const hwid = getMachineId();
    if (verifyLicenseKey(hwid, key)) {
      const licensePath = getLicensePath();
      const userDataDir = app.getPath('userData');
      if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
      }
      fs.writeFileSync(licensePath, JSON.stringify({ licenseKey: key }));
      return { success: true };
    }
    return { success: false, error: 'Invalid license key for this machine.' };
  });
}

module.exports = { registerLicenseHandlers };
