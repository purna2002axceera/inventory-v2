-- Migration 009: Add raw material cost breakdown columns to items and district to customers
ALTER TABLE items ADD COLUMN cost_name_printing REAL DEFAULT NULL;
ALTER TABLE items ADD COLUMN cost_punch REAL DEFAULT NULL;
ALTER TABLE items ADD COLUMN cost_wire REAL DEFAULT NULL;
ALTER TABLE items ADD COLUMN cost_packing_labor REAL DEFAULT NULL;

ALTER TABLE customers ADD COLUMN district TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_district ON customers(district);
