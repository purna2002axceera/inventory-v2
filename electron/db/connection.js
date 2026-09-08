const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const { app } = require('electron');

let db = null;

function getDb() {
  if (db) return db;

  const dbPath = path.join(app.getPath('userData'), 'inventory.db');
  db = new DatabaseSync(dbPath);

  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA synchronous = NORMAL;');

  // Checkpoint WAL on startup to prevent unbounded WAL file growth.
  // TRUNCATE resets the WAL file to zero bytes after checkpointing.
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch (e) {
    // Non-critical — log and continue
    console.warn('WAL checkpoint warning:', e.message);
  }

  return db;
}

function runTransaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { getDb, runTransaction };