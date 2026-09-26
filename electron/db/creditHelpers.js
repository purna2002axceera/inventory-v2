// Shared "how much is still owed" math for customer credit sales, used by both customers.js
// (credit-limit validation, credit-used display) and salesOrders.js (order-creation validation,
// payment recording, write-offs). Single source of truth so it can't drift between call sites.
//
// outstanding(so) = total sale value - value already returned as a refund - amount already paid.
// "Returned as a refund" reuses the exact same rule the profit report uses to decide whether a
// return reverses the original sale: RESALABLE and DAMAGED+REFUND lines reverse it (the customer
// got their money/credit back), DAMAGED+EXCHANGE doesn't (they kept a replacement, still owe the
// original price).
const COST_FLOOR_EPSILON = 1e-6;

function outstandingExpr(soIdExpr) {
  return `(
    (SELECT COALESCE(SUM(soi.quantity * soi.unit_price), 0) FROM sales_order_items soi WHERE soi.so_id = ${soIdExpr})
    - (SELECT COALESCE(SUM(rni.quantity * (SELECT MAX(unit_price) FROM sales_order_items WHERE so_id = ${soIdExpr} AND item_id = rni.item_id)), 0)
       FROM return_note_items rni
       JOIN return_notes rn ON rn.return_id = rni.return_id
       WHERE rn.so_id = ${soIdExpr} AND rn.status = 'APPROVED'
         AND (rni.condition = 'RESALABLE' OR (rni.condition = 'DAMAGED' AND COALESCE(rni.resolution, 'REFUND') = 'REFUND')))
    - (SELECT COALESCE(SUM(cp.amount), 0) FROM credit_payments cp WHERE cp.so_id = ${soIdExpr})
  )`;
}

function getSoOutstanding(db, soId) {
  // outstandingExpr('?') contains four placeholders (the returns term uses so_id twice,
  // once in its inner MAX(unit_price) subquery and once in its own WHERE) — bind soId to each.
  const row = db.prepare(`SELECT ${outstandingExpr('?')} AS outstanding`).get(soId, soId, soId, soId);
  return Math.max(0, row.outstanding);
}

// The flip side of outstanding: if a customer had already paid more than the order is worth
// after a refund-eligible return reduced its total (e.g. paid 8,000 of 10,000, then returned
// half the goods so the order is now only worth 4,000), the raw balance goes negative. That's
// real cash the shop now owes back, not something to silently clamp away — surfaced separately
// so it doesn't get lost the way it would if outstanding just floored at 0.
function getSoRefundDue(db, soId) {
  const row = db.prepare(`SELECT ${outstandingExpr('?')} AS raw`).get(soId, soId, soId, soId);
  return Math.max(0, -row.raw);
}

// Sum of outstanding balances across every one of this customer's still-unpaid credit sales —
// this is what a credit limit is actually measured against.
function getCustomerCreditUsed(db, customerId) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(${outstandingExpr('so.so_id')}), 0) AS used
       FROM sales_orders so
       WHERE so.customer_id = ? AND so.payment_type = 'CREDIT' AND so.credit_status = 'PENDING_PAYMENT'`
    )
    .get(customerId);
  return Math.max(0, row.used);
}

// Total ever written off as bad debt for this customer — stays nonzero forever, even after
// outstanding/credit_used have returned to 0, so a past default is never silently forgotten.
function getCustomerWrittenOffTotal(db, customerId) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(written_off_amount), 0) AS total
       FROM sales_orders
       WHERE customer_id = ? AND payment_type = 'CREDIT' AND credit_status = 'WRITTEN_OFF'`
    )
    .get(customerId);
  return row.total;
}

module.exports = { getSoOutstanding, getSoRefundDue, getCustomerCreditUsed, getCustomerWrittenOffTotal, COST_FLOOR_EPSILON };
