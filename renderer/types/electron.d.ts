import type { IpcResult } from '@/lib/ipc-client';
import type { Item, ItemTypeRecord, ItemsListResult, ProductionListResult, Customer, CustomersListResult, SalesOrder, SalesOrdersListResult, Batch, BatchesListResult, SalesReportResult, DetailedSalesReportResult, ReturnNotesListResult, ReturnableItemsResult, ReturnNoteDetail, StocksReportResult, GRNsReportResult, ReturnsReportResult, StockAdjustmentsListResult, CreditHistoryResult, CreditPayment } from '@/lib/types';

export interface ReceiptPdfData {
  soNumber: string;
  customerName: string;
  customerPhone: string | null;
  orderDate: string;
  logoPath: string;
  businessDetails: { name: string; address: string; phones: string[]; email: string; regNo?: string } | null;
  items: { name: string; sku: string; quantity: number; unitPrice: number; returned: number }[];
  total: number;
}

declare global {
  interface Window {
    electronAPI: {
      auth: {
        login: (
          username: string,
          password: string
        ) => Promise<IpcResult<{ userId: number; username: string; fullName: string | null }>>;
      };
      items: {
        listTypes: (params?: { search?: string }) => Promise<IpcResult<{ types: ItemTypeRecord[] }>>;
        createType: (params: { name: string }) => Promise<IpcResult<ItemTypeRecord>>;
        deleteType: (params: { name: string }) => Promise<IpcResult<{ success: boolean }>>;
        list: (params: {
          page?: number;
          pageSize?: number;
          search?: string;
          type?: string;
          bikeModel?: string;
          dateFrom?: string;
          dateTo?: string;
        }) => Promise<IpcResult<ItemsListResult>>;
        get: (itemId: number) => Promise<IpcResult<Item & { batches: unknown[] }>>;
        create: (item: {
          name: string;
          bikeModel: string;
          type: string;
          description?: string;
          unitCost?: number;
          unitPrice: number;
          costRexine?: number;
          costLabor?: number;
          costEmboss?: number;
          costThread?: number;
          costPacking?: number;
          costCover?: number;
          costNamePrinting?: number;
          costPunch?: number;
          costWire?: number;
          costPackingLabor?: number;
          costOther?: number;
        }) => Promise<IpcResult<Item>>;
        update: (item: {
          itemId: number;
          name?: string;
          bikeModel?: string;
          type?: string;
          description?: string;
          unitCost?: number;
          unitPrice?: number;
          costRexine?: number;
          costLabor?: number;
          costEmboss?: number;
          costThread?: number;
          costPacking?: number;
          costCover?: number;
          costNamePrinting?: number;
          costPunch?: number;
          costWire?: number;
          costPackingLabor?: number;
          costOther?: number;
        }) => Promise<IpcResult<Item>>;
        archive: (itemId: number) => Promise<IpcResult<{ itemId: number; archived: boolean }>>;
      };
      production: {
        create: (payload: {
          itemId: number;
          batchId?: number;
          quantity: number;
          receivedDate: string;
          notes?: string;
        }) => Promise<
          IpcResult<{
            grnId: number;
            grnNumber: string;
            batchId: number;
            itemId: number;
            quantity: number;
            status: string;
            isNewBatch: boolean;
          }>
        >;
        createBulk: (payload: {
          entries: {
            itemId: number;
            batchId?: number;
            quantity: number;
          }[];
          receivedDate: string;
          notes?: string;
        }) => Promise<
          IpcResult<{
            created: number;
            results: {
              grnId: number;
              grnNumber: string;
              batchId: number;
              itemId: number;
              quantity: number;
              status: string;
              isNewBatch: boolean;
            }[];
          }>
        >;
        approve: (payload: { grnId: number; userId?: number; note?: string }) => Promise<IpcResult<{ grnId: number; status: string; newStock: number }>>;
        reject: (payload: { grnId: number; userId?: number; note?: string }) => Promise<IpcResult<{ grnId: number; status: string }>>;
        reverse: (payload: { grnId: number; userId?: number; note?: string }) => Promise<IpcResult<{ grnId: number; status: string; newStock: number }>>;
        list: (params: {
          page?: number;
          pageSize?: number;
          search?: string;
          itemId?: number;
          status?: string;
          dateFrom?: string;
          dateTo?: string;
        }) => Promise<IpcResult<ProductionListResult>>;
        listBatches: (params: { page?: number; pageSize?: number; itemId?: number }) => Promise<IpcResult<BatchesListResult>>;
      };
      customers: {
        list: (params?: { page?: number; pageSize?: number; search?: string; district?: string }) => Promise<IpcResult<CustomersListResult>>;
        create: (customer: { name: string; address?: string; phone?: string; district?: string | null; creditEnabled?: boolean; creditLimit?: number }) => Promise<IpcResult<Customer>>;
        update: (customer: { customerId: number; name?: string; address?: string; phone?: string; district?: string | null; creditEnabled?: boolean; creditLimit?: number }) => Promise<IpcResult<Customer>>;
        delete: (customerId: number) => Promise<IpcResult<{ success: boolean }>>;
        getCreditHistory: (customerId: number) => Promise<IpcResult<CreditHistoryResult>>;
      };
      salesOrders: {
        create: (payload: {
          customerId: number;
          orderDate: string;
          lines: { itemId: number; batchId?: number; quantity: number }[];
          paymentType?: 'CASH' | 'CREDIT';
          creditDueDate?: string | null;
        }) => Promise<IpcResult<{ soId: number; soNumber: string; customerId: number; orderDate: string; lines: unknown[] }>>;
        list: (params: {
          page?: number;
          pageSize?: number;
          customerId?: number;
          dateFrom?: string;
          dateTo?: string;
          search?: string;
        }) => Promise<IpcResult<SalesOrdersListResult>>;
        get: (soId: number) => Promise<IpcResult<SalesOrder & { items: unknown[]; creditPayments?: CreditPayment[]; outstanding?: number; refundDue?: number }>>;
        report: (params: { reportType: 'summary' | 'detailed'; dateFrom: string; dateTo: string }) => Promise<IpcResult<SalesReportResult | DetailedSalesReportResult>>;
        recordCreditPayment: (payload: { soId: number; amount: number; paymentDate: string; note?: string }) => Promise<IpcResult<{ soId: number; outstanding: number; status: string }>>;
        writeOffCredit: (payload: { soId: number; note?: string }) => Promise<IpcResult<{ soId: number; writtenOffAmount: number; status: string }>>;
      };
      returns: {
        create: (payload: {
          type: 'INTERNAL' | 'CUSTOMER';
          soId?: number;
          returnDate: string;
          reason?: string;
          items: { itemId: number; quantity: number; condition: 'RESALABLE' | 'DAMAGED'; resolution?: 'REFUND' | 'EXCHANGE' }[];
        }) => Promise<IpcResult<{ returnId: number; returnNumber: string; status: string }>>;
        list: (params: {
          page?: number;
          pageSize?: number;
          type?: string;
          status?: string;
          dateFrom?: string;
          dateTo?: string;
          search?: string;
        }) => Promise<IpcResult<ReturnNotesListResult>>;
        get: (returnId: number) => Promise<IpcResult<ReturnNoteDetail>>;
        approve: (payload: { returnId: number; userId?: number; note?: string }) => Promise<IpcResult<{ returnId: number; status: string }>>;
        reject: (payload: { returnId: number; userId?: number; note?: string }) => Promise<IpcResult<{ returnId: number; status: string }>>;
        getReturnableItems: (soNumber: string) => Promise<IpcResult<ReturnableItemsResult>>;
      };
      stockAdjustments: {
        create: (payload: {
          itemId: number;
          actualCount: number;
          reason: string;
        }) => Promise<IpcResult<{ itemId: number; previousStock: number; newStock: number; delta: number }>>;
        listForItem: (params: { itemId: number; limit?: number }) => Promise<IpcResult<StockAdjustmentsListResult>>;
      };
      reports: {
        getStocks: (params: { startDate?: string; endDate?: string; pageSize?: number }) => Promise<IpcResult<StocksReportResult>>;
        getGRNs: (params: { startDate?: string; endDate?: string; pageSize?: number }) => Promise<IpcResult<GRNsReportResult>>;
        getReturns: (params: { startDate?: string; endDate?: string; pageSize?: number }) => Promise<IpcResult<ReturnsReportResult>>;
      };
      system: {
        printToPDF: (reportData: any) => Promise<{ success: boolean; filePath?: string; error?: string }>;
        generateReceiptPdf: (payload: { receiptData: ReceiptPdfData; filename: string }) => Promise<{ success: boolean; filePath?: string; error?: string }>;
        openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
      };
      dashboard: {
        getMetrics: (params?: { timeRange: string }) => Promise<IpcResult<{
          summary: { totalRevenue: number; totalOrders: number; totalReturns: number; lowStockCount: number; };
          salesByMonth: { month: string; revenue: number; quantity: number }[];
          topSellingItems: { name: string; sku: string; quantity: number; revenue: number }[];
          mostReturnedItems: { name: string; sku: string; quantity: number }[];
        }>>;
      };
      drive: {
        status: () => Promise<{ connected: boolean }>;
        connect: () => Promise<{ success: boolean; fileId?: string; error?: string }>;
        disconnect: () => Promise<{ success: boolean }>;
        backup: () => Promise<{ success: boolean; fileId?: string; error?: string }>;
      };
      license: {
        status: () => Promise<{ hwid: string; activated: boolean }>;
        activate: (key: string) => Promise<{ success: boolean; error?: string }>;
      };
    };
  }
}

export {};
