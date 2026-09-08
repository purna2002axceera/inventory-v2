-- Add count columns
ALTER TABLE customers ADD COLUMN sales_order_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN return_note_count INTEGER NOT NULL DEFAULT 0;

-- Backfill counts for existing customers
UPDATE customers 
SET sales_order_count = (
    SELECT COUNT(*) FROM sales_orders WHERE sales_orders.customer_id = customers.customer_id
),
return_note_count = (
    SELECT COUNT(*) 
    FROM return_notes 
    JOIN sales_orders ON return_notes.so_id = sales_orders.so_id 
    WHERE sales_orders.customer_id = customers.customer_id 
      AND return_notes.type = 'CUSTOMER'
);

-- Triggers for sales_orders to keep counts in sync automatically
CREATE TRIGGER IF NOT EXISTS update_customer_so_count_insert
AFTER INSERT ON sales_orders
BEGIN
    UPDATE customers SET sales_order_count = sales_order_count + 1 WHERE customer_id = NEW.customer_id;
END;

CREATE TRIGGER IF NOT EXISTS update_customer_so_count_delete
AFTER DELETE ON sales_orders
BEGIN
    UPDATE customers SET sales_order_count = sales_order_count - 1 WHERE customer_id = OLD.customer_id;
END;

-- Triggers for return_notes to keep counts in sync automatically
CREATE TRIGGER IF NOT EXISTS update_customer_rn_count_insert
AFTER INSERT ON return_notes
WHEN NEW.type = 'CUSTOMER' AND NEW.so_id IS NOT NULL
BEGIN
    UPDATE customers SET return_note_count = return_note_count + 1 
    WHERE customer_id = (SELECT customer_id FROM sales_orders WHERE so_id = NEW.so_id);
END;

CREATE TRIGGER IF NOT EXISTS update_customer_rn_count_delete
AFTER DELETE ON return_notes
WHEN OLD.type = 'CUSTOMER' AND OLD.so_id IS NOT NULL
BEGIN
    UPDATE customers SET return_note_count = return_note_count - 1 
    WHERE customer_id = (SELECT customer_id FROM sales_orders WHERE so_id = OLD.so_id);
END;

CREATE TRIGGER IF NOT EXISTS update_customer_rn_count_update
AFTER UPDATE OF so_id ON return_notes
WHEN OLD.type = 'CUSTOMER' AND NEW.type = 'CUSTOMER' AND OLD.so_id IS NOT NEW.so_id
BEGIN
    UPDATE customers SET return_note_count = return_note_count - 1 
    WHERE OLD.so_id IS NOT NULL AND customer_id = (SELECT customer_id FROM sales_orders WHERE so_id = OLD.so_id);
    
    UPDATE customers SET return_note_count = return_note_count + 1 
    WHERE NEW.so_id IS NOT NULL AND customer_id = (SELECT customer_id FROM sales_orders WHERE so_id = NEW.so_id);
END;
