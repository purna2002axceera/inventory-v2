-- Per-customer, per-item price overrides ("this customer pays a different price for this
-- item"). This is purely a default lookup at sale time — salesOrders:create resolves the
-- line price to whatever's here (or the item's normal unit_price if no row exists), then
-- stores that resolved price on the sales_order_item as usual. Nothing downstream (profit
-- report, credit outstanding, returns, PDFs) needs to know an override was involved; they
-- already only ever read the snapshotted per-line price.
CREATE TABLE IF NOT EXISTS customer_item_prices (
  customer_id INTEGER NOT NULL REFERENCES customers(customer_id),
  item_id     INTEGER NOT NULL REFERENCES items(item_id),
  unit_price  REAL NOT NULL,
  updated_at  TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (customer_id, item_id)
);
