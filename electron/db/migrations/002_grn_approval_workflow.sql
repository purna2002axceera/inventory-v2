ALTER TABLE production_receipts ADD COLUMN status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK(status IN ('PENDING','APPROVED','REJECTED','REVERSED'));

ALTER TABLE production_receipts ADD COLUMN decided_by INTEGER REFERENCES users(user_id);
ALTER TABLE production_receipts ADD COLUMN decided_at TEXT;
ALTER TABLE production_receipts ADD COLUMN decision_note TEXT;

-- SQLite can't ALTER a CHECK constraint directly, so we rebuild the table.
CREATE TABLE stock_ledger_new (
  ledger_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id          INTEGER NOT NULL REFERENCES items(item_id),
  change_type      TEXT NOT NULL CHECK(change_type IN (
                     'PRODUCTION','SALE','RETURN_RESALABLE',
                     'RETURN_DAMAGED','RETURN_DAMAGED_ACCEPTED','RETURN_DAMAGED_REJECTED',
                     'ADJUSTMENT','PRODUCTION_REVERSED'
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
