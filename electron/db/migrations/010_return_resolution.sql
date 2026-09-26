-- Per-line resolution for CUSTOMER returns: how a DAMAGED item is settled.
-- NULL for RESALABLE lines and all INTERNAL-return lines (not applicable).
-- Existing DAMAGED rows default to REFUND, preserving today's behavior exactly.
ALTER TABLE return_note_items ADD COLUMN resolution TEXT DEFAULT NULL;

-- Rebuild stock_ledger to allow the new 'RETURN_EXCHANGE_ISSUE' change_type
-- (SQLite can't ALTER a CHECK constraint in place — same rebuild pattern as 004).
CREATE TABLE stock_ledger_new (
  ledger_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id          INTEGER NOT NULL REFERENCES items(item_id),
  change_type      TEXT NOT NULL CHECK(change_type IN (
    'PRODUCTION','SALE','RETURN_RESTOCK','RETURN_DISCARD',
    'INTERNAL_RETURN','ADJUSTMENT','PRODUCTION_REVERSED',
    'RETURN_EXCHANGE_ISSUE'
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
