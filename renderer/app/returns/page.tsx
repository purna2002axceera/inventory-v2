'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';

import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { ReturnsTable } from '@/components/returns/returns-table';
import { ReturnFormDialog } from '@/components/returns/return-form-dialog';
import { ReturnDetailDialog } from '@/components/returns/return-detail-dialog';
import { callIpc, IpcError } from '@/lib/ipc-client';
import type { ReturnNote } from '@/lib/types';

const PAGE_SIZE = 10;

function ReturnsPageContent() {
  const [returns, setReturns] = useState<ReturnNote[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedReturnId, setSelectedReturnId] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [type, setType] = useState<string>('ALL');
  const [status, setStatus] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const debouncedSearch = useDebounce(search, 300);

  const loadReturns = useCallback(async () => {
    setLoading(true);
    try {
      const payload = {
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch || undefined,
        type: type !== 'ALL' ? type : undefined,
        status: status !== 'ALL' ? status : undefined,
        dateFrom: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
        dateTo: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
      };
      const result = await callIpc(window.electronAPI.returns.list(payload));
      setReturns(result.returns);
      setTotal(result.total);
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Failed to load return notes.');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, type, status, dateRange]);

  useEffect(() => {
    loadReturns();
  }, [loadReturns]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, type, status, dateRange]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Return Notes</h1>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Return Note
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search by Return # or SO #..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Types</SelectItem>
            <SelectItem value="CUSTOMER">Customer</SelectItem>
            <SelectItem value="INTERNAL">Internal</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <DatePickerWithRange date={dateRange} setDate={setDateRange} />
        {(search || type !== 'ALL' || status !== 'ALL' || dateRange) && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearch('');
              setType('ALL');
              setStatus('ALL');
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

      <ReturnsTable data={returns} onRowClick={(r) => setSelectedReturnId(r.return_id)} />

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{loading ? 'Loading...' : `${total} return${total === 1 ? '' : 's'} total`}</span>
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

      <ReturnFormDialog open={formOpen} onOpenChange={setFormOpen} onSaved={loadReturns} />
      <ReturnDetailDialog
        returnId={selectedReturnId}
        onOpenChange={(open) => !open && setSelectedReturnId(null)}
        onActionTaken={loadReturns}
      />
    </div>
  );
}

export default function ReturnsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <ReturnsPageContent />
      </AppShell>
    </RequireAuth>
  );
}
