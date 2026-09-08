-- Create the item_types table
CREATE TABLE IF NOT EXISTS item_types (
  type_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Insert the default types
INSERT OR IGNORE INTO item_types (name, code) VALUES 
  ('SEAT_COVER', 'SC'),
  ('SEAT', 'ST');

-- Bypass the check constraint on items.type by renaming it to old_type
ALTER TABLE items RENAME COLUMN type TO old_type;

-- Add a new type column that references the new item_types table name
ALTER TABLE items ADD COLUMN type TEXT REFERENCES item_types(name);

-- Migrate the existing data to the new column
UPDATE items SET type = old_type;
