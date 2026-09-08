-- Track how much of a batch's current quantity_left came from each individual GRN,
-- so reversing one GRN only removes that GRN's own contribution, not the whole batch.
ALTER TABLE production_receipts ADD COLUMN contributed_quantity INTEGER;
UPDATE production_receipts SET contributed_quantity = quantity WHERE contributed_quantity IS NULL;
