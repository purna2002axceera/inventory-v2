'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';

import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { SalesOrdersTable } from '@/components/sales-orders/sales-orders-table';
import { SoFormDialog } from '@/components/sales-orders/so-form-dialog';
import { SoDetailDialog } from '@/components/sales-orders/so-detail-dialog';
import { SalesReportDialog } from '@/components/sales-orders/sales-report-dialog';
import { callIpc, IpcError } from '@/lib/ipc-client';
import type { SalesOrder } from '@/lib/types';

const PAGE_SIZE = 10;

function SalesOrdersPageContent() {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [selectedSoId, setSelectedSoId] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const debouncedSearch = useDebounce(search, 300);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const payload = {
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch || undefined,
        dateFrom: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
        dateTo: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
      };
      console.log('FRONTEND -> Sending salesOrders:list request with payload:', payload);
      const result = await callIpc(window.electronAPI.salesOrders.list(payload));
      console.log('FRONTEND <- Received salesOrders:list response:', result);
      setOrders(result.orders);
      setTotal(result.total);
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Failed to load sales orders.');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, dateRange]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, dateRange]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sales Orders</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setReportOpen(true)}>
            Generate Report
          </Button>
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Sales Order
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Search by SO # or Customer Name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <DatePickerWithRange date={dateRange} setDate={setDateRange} />
        {(search || dateRange) && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearch('');
              setDateRange(undefined);
              setPage(1);
            }}
            className="px-2"
          >
            <X className="h-4 w-4 mr-1" />
            Reset
          </Button>
        )}
      </div>

      <SalesOrdersTable data={orders} onRowClick={(o) => setSelectedSoId(o.so_id)} />

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{loading ? 'Loading...' : `${total} order${total === 1 ? '' : 's'} total`}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      <SoFormDialog open={formOpen} onOpenChange={setFormOpen} onSaved={loadOrders} />
      <SoDetailDialog soId={selectedSoId} onOpenChange={(open) => !open && setSelectedSoId(null)} />
      <SalesReportDialog open={reportOpen} onOpenChange={setReportOpen} />
    </div>
  );
}

export default function SalesOrdersPage() {
  return (
    <RequireAuth>
      <AppShell>
        <SalesOrdersPageContent />
      </AppShell>
    </RequireAuth>
  );
}
