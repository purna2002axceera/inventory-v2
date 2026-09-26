-- Customer credit sales ("khata"-style): a customer can be allowed to buy on credit up to a
-- limit, tracked against how much they currently owe. Profit is booked at time of sale, exactly
-- like a cash sale (payment_type only changes how/when cash is collected) — a credit sale only
-- becomes a real loss if explicitly written off as bad debt.

ALTER TABLE customers ADD COLUMN credit_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN credit_limit REAL NOT NULL DEFAULT 0;

ALTER TABLE sales_orders ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'CASH' CHECK(payment_type IN ('CASH', 'CREDIT'));
ALTER TABLE sales_orders ADD COLUMN credit_status TEXT CHECK(credit_status IN ('PENDING_PAYMENT', 'PAID', 'WRITTEN_OFF'));
ALTER TABLE sales_orders ADD COLUMN credit_due_date TEXT;
ALTER TABLE sales_orders ADD COLUMN written_off_amount REAL;
ALTER TABLE sales_orders ADD COLUMN written_off_at TEXT;
ALTER TABLE sales_orders ADD COLUMN written_off_note TEXT;

-- Individual payments toward a credit sale, mirroring stock_ledger's audit-trail convention
-- (every payment recorded as its own row) rather than a single mutable running total.
CREATE TABLE IF NOT EXISTS credit_payments (
  payment_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  so_id        INTEGER NOT NULL REFERENCES sales_orders(so_id),
  amount       REAL NOT NULL,
  payment_date TEXT NOT NULL,
  note         TEXT,
  created_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_credit_payments_so ON credit_payments(so_id);
