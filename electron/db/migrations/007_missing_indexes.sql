-- Missing indexes for tables that are frequently JOINed and filtered on.
-- These prevent full-table scans as data grows over years.

-- sales_order_items: every SO detail view and report JOINs on so_id
CREATE INDEX IF NOT EXISTS idx_soi_so ON sales_order_items(so_id);

-- return_note_items: every return detail view JOINs on return_id
CREATE INDEX IF NOT EXISTS idx_rni_return ON return_note_items(return_id);

-- production_receipts: batch status queries and reverse checks filter on batch_id
CREATE INDEX IF NOT EXISTS idx_pr_batch ON production_receipts(batch_id);

-- production_receipts: GRN list sorts/filters by received_date
CREATE INDEX IF NOT EXISTS idx_pr_received_date ON production_receipts(received_date);

-- return_notes: returns list sorts/filters by return_date
CREATE INDEX IF NOT EXISTS idx_rn_return_date ON return_notes(return_date);

-- customers: customer search uses LIKE on name
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

-- stock_ledger: dashboard and reports filter by change_type
CREATE INDEX IF NOT EXISTS idx_ledger_change_type ON stock_ledger(change_type, created_at);
