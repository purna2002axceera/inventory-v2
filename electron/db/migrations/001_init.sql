CREATE TABLE IF NOT EXISTS users (
  user_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
  item_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  sku           TEXT UNIQUE,
  name          TEXT NOT NULL,
  bike_model    TEXT NOT NULL,
  type          TEXT NOT NULL CHECK(type IN ('SEAT_COVER','SEAT')),
  stock_count   INTEGER NOT NULL DEFAULT 0,
  unit_cost     REAL DEFAULT 0,
  unit_price    REAL NOT NULL DEFAULT 0,
  description   TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_items_model ON items(bike_model);
CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);

CREATE TABLE IF NOT EXISTS batches (
  batch_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id         INTEGER NOT NULL REFERENCES items(item_id),
  batch_ref       TEXT,
  quantity_made   INTEGER NOT NULL,
  quantity_left   INTEGER NOT NULL,
  production_date TEXT NOT NULL,
  notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_batches_item ON batches(item_id, production_date);
CREATE INDEX IF NOT EXISTS idx_batches_fifo ON batches(item_id, quantity_left, production_date);

CREATE TABLE IF NOT EXISTS production_receipts (
  grn_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  grn_number    TEXT NOT NULL UNIQUE,
  item_id       INTEGER NOT NULL REFERENCES items(item_id),
  batch_id      INTEGER NOT NULL REFERENCES batches(batch_id),
  quantity      INTEGER NOT NULL,
  received_date TEXT NOT NULL,
  notes         TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  customer_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  address      TEXT,
  phone        TEXT,
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales_orders (
  so_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  so_number    TEXT NOT NULL UNIQUE,
  customer_id  INTEGER NOT NULL REFERENCES customers(customer_id),
  order_date   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('PENDING','COMPLETED','CANCELLED')),
  created_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_so_date ON sales_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_so_customer ON sales_orders(customer_id);

CREATE TABLE IF NOT EXISTS sales_order_items (
  soi_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  so_id       INTEGER NOT NULL REFERENCES sales_orders(so_id),
  item_id     INTEGER NOT NULL REFERENCES items(item_id),
  batch_id    INTEGER NOT NULL REFERENCES batches(batch_id),
  quantity    INTEGER NOT NULL,
  unit_cost   REAL NOT NULL,
  unit_price  REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_soi_item ON sales_order_items(item_id);

CREATE TABLE IF NOT EXISTS sales_returns (
  return_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  return_number TEXT NOT NULL UNIQUE,
  customer_id   INTEGER NOT NULL REFERENCES customers(customer_id),
  so_id         INTEGER REFERENCES sales_orders(so_id),
  return_date   TEXT NOT NULL,
  reason        TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales_return_items (
  sri_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id   INTEGER NOT NULL REFERENCES sales_returns(return_id),
  item_id     INTEGER NOT NULL REFERENCES items(item_id),
  quantity    INTEGER NOT NULL,
  condition   TEXT NOT NULL CHECK(condition IN ('RESALABLE','DAMAGED'))
);

-- NEW: damaged-return review queue (your requested change)
CREATE TABLE IF NOT EXISTS damaged_stock_review (
  review_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  sri_id       INTEGER NOT NULL REFERENCES sales_return_items(sri_id),
  item_id      INTEGER NOT NULL REFERENCES items(item_id),
  quantity     INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','REJECTED')),
  reviewed_by  INTEGER REFERENCES users(user_id),
  reviewed_at  TEXT,
  note         TEXT,
  created_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_damaged_status ON damaged_stock_review(status);

CREATE TABLE IF NOT EXISTS stock_ledger (
  ledger_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id          INTEGER NOT NULL REFERENCES items(item_id),
  change_type      TEXT NOT NULL CHECK(change_type IN (
                     'PRODUCTION','SALE','RETURN_RESALABLE',
                     'RETURN_DAMAGED','RETURN_DAMAGED_ACCEPTED','RETURN_DAMAGED_REJECTED',
                     'ADJUSTMENT'
                   )),
  quantity_change  INTEGER NOT NULL,
  resulting_stock  INTEGER NOT NULL,
  reference_type   TEXT,
  reference_id     INTEGER,
  note             TEXT,
  created_at       TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ledger_item ON stock_ledger(item_id, created_at);