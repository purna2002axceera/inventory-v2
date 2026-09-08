-- Drop old unused return tables from 001_init.sql (never wired up)
DROP TABLE IF EXISTS damaged_stock_review;
DROP TABLE IF EXISTS sales_return_items;
DROP TABLE IF EXISTS sales_returns;

-- Unified return notes
CREATE TABLE IF NOT EXISTS return_notes (
  return_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  return_number TEXT NOT NULL UNIQUE,
  type          TEXT NOT NULL CHECK(type IN ('INTERNAL', 'CUSTOMER')),
  so_id         INTEGER REFERENCES sales_orders(so_id),
  return_date   TEXT NOT NULL,
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
  decided_by    INTEGER REFERENCES users(user_id),
  decided_at    TEXT,
  decision_note TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_return_notes_type ON return_notes(type);
CREATE INDEX IF NOT EXISTS idx_return_notes_status ON return_notes(status);
CREATE INDEX IF NOT EXISTS idx_return_notes_so ON return_notes(so_id);

-- Return note line items
CREATE TABLE IF NOT EXISTS return_note_items (
  rni_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id    INTEGER NOT NULL REFERENCES return_notes(return_id),
  item_id      INTEGER NOT NULL REFERENCES items(item_id),
  quantity     INTEGER NOT NULL,
  condition    TEXT NOT NULL CHECK(condition IN ('RESALABLE', 'DAMAGED'))
);

-- Rebuild stock_ledger with updated change_type options
CREATE TABLE stock_ledger_new (
  ledger_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id          INTEGER NOT NULL REFERENCES items(item_id),
  change_type      TEXT NOT NULL CHECK(change_type IN (
    'PRODUCTION','SALE','RETURN_RESTOCK','RETURN_DISCARD',
    'INTERNAL_RETURN','ADJUSTMENT','PRODUCTION_REVERSED'
  )),
  quantity_change  INTEGER NOT NULL,
  resulting_stock  INTEGER NOT NULL,
  reference_type   TEXT,
  reference_id     INTEGER,
  note             TEXT,
  created_at       TEXT DEFAULT (datetime('now'))
);
INSERT INTO stock_ledger_new SELECT * FROM stock_ledger;
DROP TABLE stock_ledger;
ALTER TABLE stock_ledger_new RENAME TO stock_ledger;
CREATE INDEX IF NOT EXISTS idx_ledger_item ON stock_ledger(item_id, created_at);
