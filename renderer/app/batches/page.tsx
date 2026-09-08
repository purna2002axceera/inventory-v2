'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { callIpc, IpcError } from '@/lib/ipc-client';
import type { Batch, Item } from '@/lib/types';

const PAGE_SIZE = 10;

function BatchesPageContent() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Item[]>([]);
  const [itemFilter, setItemFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(false);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const params: { page: number; pageSize: number; itemId?: number } = { page, pageSize: PAGE_SIZE };
      if (itemFilter !== 'ALL') {
        params.itemId = Number(itemFilter);
      }
      const [batchResult, itemsResult] = await Promise.all([
        callIpc(window.electronAPI.production.listBatches(params)),
        callIpc(window.electronAPI.items.list({ pageSize: 200 })),
      ]);
      setBatches(batchResult.batches || (Array.isArray(batchResult) ? batchResult : []));
      setTotal(batchResult.total || (Array.isArray(batchResult) ? batchResult.length : 0));
      setItems(itemsResult.items);
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Failed to load batches.');
    } finally {
      setLoading(false);
    }
  }, [page, itemFilter]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  useEffect(() => {
    setPage(1);
  }, [itemFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Batches</h1>

      <Select value={itemFilter} onValueChange={setItemFilter}>
        <SelectTrigger className="w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All items</SelectItem>
          {items.map((item) => (
            <SelectItem key={item.item_id} value={String(item.item_id)}>
              {item.sku} — {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Batch Ref</TableHead>
              <TableHead>Production Date</TableHead>
              <TableHead className="text-right">Qty Made</TableHead>
              <TableHead className="text-right">Qty Left</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : batches.length ? (
              batches.map((b) => (
                <TableRow key={b.batch_id}>
                  <TableCell>
                    {b.item_name} <span className="text-xs text-muted-foreground font-mono">{b.item_sku}</span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{b.batch_ref}</TableCell>
                  <TableCell>{b.production_date}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.quantity_made}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.quantity_left}</TableCell>
                  <TableCell>
                    {b.batchStatus === 'ACTIVE' && <Badge>Active</Badge>}
                    {b.batchStatus === 'SOLD_OUT' && <Badge variant="secondary">Sold Out</Badge>}
                    {b.batchStatus === 'PENDING_APPROVAL' && <Badge variant="outline">Pending Approval</Badge>}
                    {b.batchStatus === 'REVERSED' && <Badge variant="destructive">Reversed</Badge>}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No batches found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{loading ? 'Loading...' : `${total} batch${total === 1 ? '' : 'es'} total`}</span>
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
    </div>
  );
}

export default function BatchesPage() {
  return (
    <RequireAuth>
      <AppShell>
        <BatchesPageContent />
      </AppShell>
    </RequireAuth>
  );
}
