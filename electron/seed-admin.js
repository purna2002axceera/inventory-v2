const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const { runMigrations } = require('./migrate');

// Mirrors Electron's app.getPath('userData') on Windows: %APPDATA%\<app name>
// "inventory-app" must match the "name" field in the root package.json.
function getUserDataPath() {
  const appName = 'inventory-app';
  return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), appName);
}

const fs = require('fs');
const userDataDir = getUserDataPath();
fs.mkdirSync(userDataDir, { recursive: true });

const dbPath = path.join(userDataDir, 'inventory.db');
console.log('Seeding admin user into:', dbPath);

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');
runMigrations(db);

const username = process.argv[2] || 'admin';
const password = process.argv[3] || 'admin123';
const passwordHash = bcrypt.hashSync(password, 10);

try {
  db.prepare(
    'INSERT INTO users (username, password_hash, full_name) VALUES (?, ?, ?)'
  ).run(username, passwordHash, 'Administrator');
  console.log(`✅ Created user "${username}" with password "${password}"`);
} catch (err) {
  console.error('❌ Failed to create user:', err.message);
} finally {
  db.close();
}