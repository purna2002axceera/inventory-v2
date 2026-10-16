'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { callIpc, IpcError } from '@/lib/ipc-client';
import type { CustomerItemPrice, CustomerItemPricesResult } from '@/lib/types';

export function CustomerPricingDialog({
  customerId,
  onOpenChange,
}: {
  customerId: number | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [result, setResult] = useState<CustomerItemPricesResult | null>(null);
  const [search, setSearch] = useState('');
  // Live text buffers per item_id, separate from committed data, so typing doesn't
  // round-trip to the backend on every keystroke — only on blur/Enter.
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    if (customerId) {
      callIpc(window.electronAPI.customers.getItemPrices(customerId)).then((data) => {
        setResult(data);
        setDrafts(
          Object.fromEntries(data.items.map((i) => [i.item_id, i.custom_price != null ? String(i.custom_price) : '']))
        );
      });
    } else {
      setResult(null);
      setDrafts({});
      setSearch('');
    }
  }, [customerId]);

  const filteredItems = useMemo(() => {
    if (!result) return [];
    const term = search.trim().toLowerCase();
    if (!term) return result.items;
    return result.items.filter(
      (i) => i.name.toLowerCase().includes(term) || i.sku.toLowerCase().includes(term) || i.bike_model?.toLowerCase().includes(term)
    );
  }, [result, search]);

  function updateItemLocally(itemId: number, customPrice: number | null) {
    setResult((prev) => (prev ? { ...prev, items: prev.items.map((i) => (i.item_id === itemId ? { ...i, custom_price: customPrice } : i)) } : prev));
  }

  async function commitPrice(item: CustomerItemPrice, rawValue: string) {
    if (!customerId) return;
    const trimmed = rawValue.trim();

    // Blank means "back to default" — same as clicking the reset button.
    const nextValue = trimmed === '' ? null : Number(trimmed);
    if (nextValue !== null && (!Number.isFinite(nextValue) || nextValue < 0)) {
      toast.error('Enter a valid non-negative price.');
      setDrafts((d) => ({ ...d, [item.item_id]: item.custom_price != null ? String(item.custom_price) : '' }));
      return;
    }

    // No actual change — skip the round-trip.
    const currentValue = item.custom_price;
    if (nextValue === currentValue) return;

    setSavingId(item.item_id);
    try {
      await callIpc(window.electronAPI.customers.setItemPrice({ customerId, itemId: item.item_id, unitPrice: nextValue }));
      updateItemLocally(item.item_id, nextValue);
      setDrafts((d) => ({ ...d, [item.item_id]: nextValue != null ? String(nextValue) : '' }));
      toast.success(nextValue != null ? `Custom price set for "${item.name}"` : `Reset "${item.name}" to default price`);
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Failed to update price.');
      setDrafts((d) => ({ ...d, [item.item_id]: currentValue != null ? String(currentValue) : '' }));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Dialog open={!!customerId} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{result?.customerName ?? 'Loading...'} — Manage Pricing</DialogTitle>
        </DialogHeader>

        {result && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Set a custom price for specific items sold to this customer. Leave blank to use the item's normal price.
            </p>
            <Input
              placeholder="Search by name, SKU, or model..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Default Price</TableHead>
                    <TableHead className="text-right">Custom Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No items match your search.
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredItems.map((item) => (
                    <TableRow key={item.item_id}>
                      <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                      <TableCell>
                        {item.name}
                        {item.custom_price != null && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            Custom
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{item.stock_count}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        Rs. {item.default_price.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder={item.default_price.toFixed(2)}
                            value={drafts[item.item_id] ?? ''}
                            disabled={savingId === item.item_id}
                            onChange={(e) => setDrafts((d) => ({ ...d, [item.item_id]: e.target.value }))}
                            onBlur={(e) => commitPrice(item, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur();
                            }}
                            className="w-28 text-right tabular-nums"
                          />
                          {item.custom_price != null && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Reset to default price"
                              disabled={savingId === item.item_id}
                              onClick={() => commitPrice(item, '')}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
