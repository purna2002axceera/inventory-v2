const crypto = require('crypto');
const { machineIdSync } = require('node-machine-id');

// VERY IMPORTANT: Never share this secret with the client!
const SECRET_SALT = 'INVENTORY_SUPER_SECRET_2026_KEY_PRO_EDITION';

function getMachineId() {
  try {
    // The second parameter `true` returns the original hardware ID instead of a hashed one
    const id = machineIdSync(true);
    // Hash it slightly to make it look clean (e.g. MACH-A1B2C3D4)
    const hash = crypto.createHash('sha256').update(id).digest('hex').substring(0, 10).toUpperCase();
    return `MACH-${hash}`;
  } catch (err) {
    // Fallback if hardware access fails
    return 'MACH-FALLBACK-1234';
  }
}

function generateLicenseKey(hwid) {
  // Generates a 16-character license key based on the HWID and the secret salt
  const hash = crypto.createHmac('sha256', SECRET_SALT)
                     .update(hwid)
                     .digest('hex')
                     .substring(0, 16)
                     .toUpperCase();
  // Format it as LIC-XXXX-XXXX-XXXX-XXXX for readability
  return `LIC-${hash.substring(0, 4)}-${hash.substring(4, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}`;
}

function verifyLicenseKey(hwid, providedKey) {
  if (!providedKey) return false;
  const expectedKey = generateLicenseKey(hwid);
  // Remove any accidental spaces
  return providedKey.trim() === expectedKey;
}

module.exports = {
  getMachineId,
  generateLicenseKey,
  verifyLicenseKey
};
