'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, X } from 'lucide-react';

import { AsyncCombobox } from '@/components/ui/async-combobox';
import { useAsyncSearch } from '@/hooks/use-async-search';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { ItemsTable } from '@/components/items/items-table';
import { ItemFormDialog } from '@/components/items/item-form-dialog';
import { useDebounce } from '@/hooks/use-debounce';
import { callIpc, IpcError } from '@/lib/ipc-client';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import type { Item, ItemTypeRecord } from '@/lib/types';

const PAGE_SIZE = 10;

function ItemsPageContent() {
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [loading, setLoading] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Item | null>(null);

  const typeSearch = useAsyncSearch<ItemTypeRecord>({
    fetcher: async (params) => {
      const res = await callIpc(window.electronAPI.items.listTypes(params));
      return { data: res.types, total: res.types.length };
    },
    idKey: 'name',
  });

  const debouncedSearch = useDebounce(search, 300);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const payload = {
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch || undefined,
        type: typeFilter !== 'ALL' ? typeFilter : undefined,
        dateFrom: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
        dateTo: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
      };
      console.log('FRONTEND -> Sending items:list request with payload:', payload);
      const result = await callIpc(window.electronAPI.items.list(payload));
      console.log('FRONTEND <- Received items:list response:', result);

      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Failed to load items.');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, typeFilter, dateRange]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, typeFilter, dateRange]);

  function openCreateDialog() {
    setEditingItem(null);
    setFormOpen(true);
  }

  function openEditDialog(item: Item) {
    setEditingItem(item);
    setFormOpen(true);
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    try {
      await callIpc(window.electronAPI.items.archive(archiveTarget.item_id));
      toast.success('Item archived');
      setArchiveTarget(null);
      loadItems();
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Failed to archive item.');
      setArchiveTarget(null);
    }
  }

  function resetFilters() {
    setSearch('');
    setTypeFilter('ALL');
    setDateRange(undefined);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Items</h1>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-1" />
          New Item
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Search by name, SKU, or bike model..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <AsyncCombobox
          search={typeSearch}
          value={typeFilter === 'ALL' ? '' : typeFilter}
          onSelect={(id) => setTypeFilter(id || 'ALL')}
          getId={(o) => o.name}
          renderOption={(o) => o.name}
          renderSelected={(o) => o.name}
          placeholder="All types"
          searchPlaceholder="Search types..."
          className="w-40"
          header={
            <div className="px-2 py-1.5 cursor-pointer text-sm font-medium hover:bg-accent rounded-sm" onClick={() => setTypeFilter('ALL')}>
              All types
            </div>
          }
        />
        <DatePickerWithRange date={dateRange} setDate={setDateRange} />
        {(search || typeFilter !== 'ALL' || dateRange) && (
          <Button variant="ghost" onClick={resetFilters} className="px-2">
            <X className="h-4 w-4 mr-1" />
            Reset
          </Button>
        )}
      </div>

      <ItemsTable data={items} onEdit={openEditDialog} onArchive={(item) => setArchiveTarget(item)} />

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{loading ? 'Loading...' : `${total} item${total === 1 ? '' : 's'} total`}</span>
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

      <ItemFormDialog 
        open={formOpen} 
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) typeSearch.reload();
        }} 
        editingItem={editingItem} 
        onSaved={loadItems} 
      />
      <AlertDialog open={!!archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this item?</AlertDialogTitle>
            <AlertDialogDescription>
              "{archiveTarget?.name}" will be hidden from active lists. If it already has production or sales
              history, the archive will be rejected instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmArchive}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function ItemsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <ItemsPageContent />
      </AppShell>
    </RequireAuth>
  );
}
