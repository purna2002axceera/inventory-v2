export type ItemType = string;

export interface ItemTypeRecord {
  type_id: number;
  name: string;
  code: string;
  item_count?: number;
}

export interface Item {
  item_id: number;
  sku: string;
  name: string;
  bike_model: string;
  type: ItemType;
  stock_count: number;
  unit_cost: number;
  unit_price: number;
  description: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
  isLowStock: boolean;
  cost_rexine: number | null;
  cost_labor: number | null;
  cost_emboss: number | null;
  cost_thread: number | null;
  cost_packing: number | null;
  cost_cover: number | null;
  cost_name_printing: number | null;
  cost_punch: number | null;
  cost_wire: number | null;
  cost_packing_labor: number | null;
  cost_other: number | null;
}

export interface StockAdjustment {
  ledger_id: number;
  quantity_change: number;
  resulting_stock: number;
  note: string | null;
  created_at: string;
}

export interface StockAdjustmentsListResult {
  adjustments: StockAdjustment[];
}

export const SRI_LANKA_DISTRICTS = [
  'Ampara',
  'Anuradhapura',
  'Badulla',
  'Batticaloa',
  'Colombo',
  'Galle',
  'Gampaha',
  'Hambantota',
  'Jaffna',
  'Kalutara',
  'Kandy',
  'Kegalle',
  'Kilinochchi',
  'Kurunegala',
  'Mannar',
  'Matale',
  'Matara',
  'Monaragala',
  'Mullaitivu',
  'Nuwara Eliya',
  'Polonnaruwa',
  'Puttalam',
  'Ratnapura',
  'Trincomalee',
  'Vavuniya',
] as const;

export type SriLankaDistrict = typeof SRI_LANKA_DISTRICTS[number];

export interface ItemsListResult {
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
}

export type GrnStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVERSED';

export interface ProductionReceipt {
  grn_id: number;
  grn_number: string;
  item_id: number;
  batch_id: number;
  quantity: number;
  received_date: string;
  notes: string | null;
  created_at: string;
  item_name: string;
  item_sku: string;
  status: GrnStatus;
  decided_by: number | null;
  decided_at: string | null;
  decision_note: string | null;
}

export interface ProductionListResult {
  receipts: ProductionReceipt[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Customer {
  customer_id: number;
  name: string;
  address: string | null;
  phone: string | null;
  district?: string | null;
  created_at: string;
  sales_order_count: number;
  return_note_count: number;
  credit_enabled: number;
  credit_limit: number;
  credit_used: number;
  total_written_off: number;
}

export interface CustomersListResult {
  customers: Customer[];
  total: number;
  page: number;
  pageSize: number;
}

export type CreditStatus = 'PENDING_PAYMENT' | 'PAID' | 'WRITTEN_OFF';

export interface SalesOrder {
  so_id: number;
  so_number: string;
  customer_id: number;
  customer_name: string;
  order_date: string;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  created_at: string;
  total_amount: number;
  payment_type: 'CASH' | 'CREDIT';
  credit_status: CreditStatus | null;
  credit_due_date: string | null;
  written_off_amount: number | null;
  written_off_at: string | null;
  written_off_note: string | null;
}

export interface CreditPayment {
  payment_id: number;
  so_id: number;
  amount: number;
  payment_date: string;
  note: string | null;
  created_at: string;
}

export interface CreditHistoryOrder {
  so_id: number;
  so_number: string;
  order_date: string;
  credit_status: CreditStatus;
  credit_due_date: string | null;
  written_off_amount: number | null;
  written_off_at: string | null;
  written_off_note: string | null;
  total_amount: number;
  paid_amount: number;
  outstanding: number;
  refundDue: number;
}

export interface CreditHistoryResult {
  customerName: string;
  totalWrittenOff: number;
  orders: CreditHistoryOrder[];
}

export interface SalesOrdersListResult {
  orders: SalesOrder[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Batch {
  batch_id: number;
  item_id: number;
  batch_ref: string | null;
  quantity_made: number;
  quantity_left: number;
  production_date: string;
  notes: string | null;
  item_name: string;
  item_sku: string;
  batchStatus: 'ACTIVE' | 'SOLD_OUT' | 'PENDING_APPROVAL' | 'REVERSED';
}
export interface BatchesListResult {
  batches: Batch[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SalesReportItem {
  itemId: number;
  sku: string;
  name: string;
  quantitySold: number;
  totalRevenue: number;
  latestUnitCost: number;
  totalCost: number;
  damagedLoss: number;
  badDebtLoss: number;
  profit: number;
}

export interface SalesReportResult {
  type: 'summary';
  dateFrom: string;
  dateTo: string;
  items: SalesReportItem[];
  totalSales: number;
  totalProfit: number;
  totalDamagedLoss: number;
  totalBadDebtLoss: number;
}

export interface DetailedSalesReportOrderLine {
  itemName: string;
  itemSku: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface DetailedSalesReportOrder {
  soNumber: string;
  customerName: string;
  orderDate: string;
  status: string;
  totalAmount: number;
  lines: DetailedSalesReportOrderLine[];
}

export interface DetailedSalesReportResult {
  type: 'detailed';
  dateFrom: string;
  dateTo: string;
  orders: DetailedSalesReportOrder[];
  totalRevenue: number;
}

export type ReturnType = 'INTERNAL' | 'CUSTOMER';
export type ReturnStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ReturnCondition = 'RESALABLE' | 'DAMAGED';
export type ReturnResolution = 'REFUND' | 'EXCHANGE';

export interface ReturnNote {
  return_id: number;
  return_number: string;
  type: ReturnType;
  so_id: number | null;
  so_number: string | null;
  return_date: string;
  reason: string | null;
  status: ReturnStatus;
  decided_by: number | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
  total_items: number;
}

export interface ReturnNoteDetail extends ReturnNote {
  customer_name: string | null;
  items: ReturnNoteItem[];
  totalRefund: number | null;
}

export interface ReturnNoteItem {
  rni_id: number;
  return_id: number;
  item_id: number;
  item_name: string;
  item_sku: string;
  quantity: number;
  condition: ReturnCondition;
  resolution: ReturnResolution | null;
  unit_price: number | null;
}

export interface ReturnNotesListResult {
  returns: ReturnNote[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReturnableItem {
  itemId: number;
  itemName: string;
  itemSku: string;
  soldQty: number;
  alreadyReturned: number;
  pendingReturn: number;
  maxReturnable: number;
  unitPrice: number;
  stockCount: number;
}

export interface ReturnableItemsResult {
  soId: number;
  soNumber: string;
  customerName: string;
  orderDate?: string;
  items: ReturnableItem[];
}

export interface StockReportItem {
  item_id: number;
  sku: string;
  name: string;
  bike_model: string;
  type: ItemType;
  stock_count: number;
  stock_in: number;
  stock_out: number;
}

export interface StocksReportResult {
  items: StockReportItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GrnReportRow {
  grn_id: number;
  grn_number: string;
  quantity: number;
  received_date: string;
  notes: string | null;
  created_at: string;
  sku: string;
  item_name: string;
  bike_model: string;
  batch_ref: string | null;
  production_date: string;
}

export interface GRNsReportResult {
  receipts: GrnReportRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReturnReportItem {
  rni_id: number;
  return_id: number;
  item_id: number;
  quantity: number;
  condition: ReturnCondition;
  resolution: ReturnResolution | null;
  name: string;
  sku: string;
  bike_model: string;
}

export interface ReturnReportRow {
  return_id: number;
  return_number: string;
  type: ReturnType;
  return_date: string;
  reason: string | null;
  status: ReturnStatus;
  created_at: string;
  so_number: string | null;
  items: ReturnReportItem[];
}

export interface ReturnsReportResult {
  returns: ReturnReportRow[];
  total: number;
  page: number;
  pageSize: number;
}
