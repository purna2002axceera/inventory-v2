'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';

import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { ProductionTable } from '@/components/production/production-table';
import { GrnFormDialog } from '@/components/production/grn-form-dialog';
import { useAuth } from '@/lib/auth-context';
import { callIpc, IpcError } from '@/lib/ipc-client';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';
import type { ProductionReceipt } from '@/lib/types';

const PAGE_SIZE = 10;

function ProductionPageContent() {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<ProductionReceipt[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const debouncedSearch = useDebounce(search, 300);

  const loadReceipts = useCallback(async () => {
    setLoading(true);
    try {
      const payload = {
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch || undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        dateFrom: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
        dateTo: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
      };
      console.log('FRONTEND -> Sending production:list request with payload:', payload);
      const result = await callIpc(window.electronAPI.production.list(payload));
      console.log('FRONTEND <- Received production:list response:', result);
      
      setReceipts(result.receipts);
      setTotal(result.total);
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Failed to load production receipts.');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, dateRange]);

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, dateRange]);

  async function handleApprove(receipt: ProductionReceipt) {
    try {
      await callIpc(window.electronAPI.production.approve({ grnId: receipt.grn_id, userId: user?.userId }));
      toast.success(`${receipt.grn_number} approved — stock updated`);
      loadReceipts();
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Failed to approve GRN.');
    }
  }

  async function handleReject(receipt: ProductionReceipt) {
    try {
      await callIpc(window.electronAPI.production.reject({ grnId: receipt.grn_id, userId: user?.userId }));
      toast.success(`${receipt.grn_number} rejected`);
      loadReceipts();
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Failed to reject GRN.');
    }
  }

  async function handleReverse(receipt: ProductionReceipt) {
    try {
      await callIpc(window.electronAPI.production.reverse({ grnId: receipt.grn_id, userId: user?.userId }));
      toast.success(`${receipt.grn_number} reversed — stock rolled back`);
      loadReceipts();
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Failed to reverse GRN.');
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Production / GRN</h1>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New GRN
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Search by GRN #, Item Name, or SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="REVERSED">Reversed</SelectItem>
          </SelectContent>
        </Select>
        <DatePickerWithRange date={dateRange} setDate={setDateRange} />
        {(search || statusFilter !== 'ALL' || dateRange) && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearch('');
              setStatusFilter('ALL');
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

      <ProductionTable data={receipts} onApprove={handleApprove} onReject={handleReject} onReverse={handleReverse} />

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{loading ? 'Loading...' : `${total} receipt${total === 1 ? '' : 's'} total`}</span>
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

      <GrnFormDialog open={formOpen} onOpenChange={setFormOpen} onSaved={loadReceipts} />
    </div>
  );
}

export default function ProductionPage() {
  return (
    <RequireAuth>
      <AppShell>
        <ProductionPageContent />
      </AppShell>
    </RequireAuth>
  );
}
