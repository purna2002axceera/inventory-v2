const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

// Mirrors Electron's app.getPath('userData') on Windows: %APPDATA%\<app name>
function getUserDataPath() {
  const appName = 'inventory-app';
  return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), appName);
}

const filesToDelete = [
  path.join(getUserDataPath(), 'inventory.db'),
  path.join(getUserDataPath(), 'inventory.db-wal'),
  path.join(getUserDataPath(), 'inventory.db-shm')
];

console.log('⚠️ Warning: This will delete ALL data in the system.');

let clearedAny = false;

for (const file of filesToDelete) {
  if (fs.existsSync(file)) {
    try {
      fs.unlinkSync(file);
      console.log(`✅ Cleared existing database file at ${file}`);
      clearedAny = true;
    } catch (err) {
      if (err.code === 'EBUSY') {
        console.error(`❌ Failed to clear database file: The file ${file} is locked.`);
        console.error('Please close the running application (and any dev servers) before clearing data.');
        process.exit(1);
      } else {
        console.error(`❌ Failed to clear database file ${file}:`, err.message);
        process.exit(1);
      }
    }
  }
}

if (!clearedAny) {
  console.log(`Database files do not exist, nothing to clear.`);
}

console.log('\nRe-seeding admin user and applying migrations...');
spawnSync('node', [path.join(__dirname, 'electron', 'seed-admin.js')], { stdio: 'inherit' });
console.log('\n✅ Data cleared successfully. You can now start the application.');
