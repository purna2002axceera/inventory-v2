'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { callIpc, IpcError } from '@/lib/ipc-client';
import type { Item, StockAdjustment } from '@/lib/types';

const adjustmentSchema = z.object({
  actualCount: z.coerce.number().int('Must be a whole number').min(0, 'Cannot be negative'),
  reason: z.string().min(1, 'A reason is required'),
});
type AdjustmentFormValues = z.infer<typeof adjustmentSchema>;

export function StockAdjustmentDialog({
  item,
  onOpenChange,
  onSaved,
}: {
  item: Item | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [history, setHistory] = useState<StockAdjustment[]>([]);

  const form = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentSchema) as any,
    defaultValues: { actualCount: 0, reason: '' },
  });

  useEffect(() => {
    if (item) {
      form.reset({ actualCount: item.stock_count, reason: '' });
      callIpc(window.electronAPI.stockAdjustments.listForItem({ itemId: item.item_id }))
        .then((res) => setHistory(res.adjustments))
        .catch(() => setHistory([]));
    }
  }, [item]);

  const actualCount = form.watch('actualCount');
  const delta = item ? (Number(actualCount) || 0) - item.stock_count : 0;

  async function onSubmit(values: AdjustmentFormValues) {
    if (!item) return;
    try {
      await callIpc(
        window.electronAPI.stockAdjustments.create({
          itemId: item.item_id,
          actualCount: values.actualCount,
          reason: values.reason,
        })
      );
      toast.success('Stock adjusted');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Failed to adjust stock.');
    }
  }

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adjust Stock</DialogTitle>
          <DialogDescription>
            {item && (
              <>
                {item.name} <span className="font-mono text-xs">{item.sku}</span> — system stock: {item.stock_count}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {item && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="actualCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Actual counted stock</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {delta !== 0 && (
                <div className={`text-sm rounded-md p-3 ${delta < 0 ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-600'}`}>
                  {delta < 0
                    ? `This will reduce stock by ${Math.abs(delta)}, from ${item.stock_count} to ${item.stock_count + delta}.`
                    : `This will increase stock by ${delta}, from ${item.stock_count} to ${item.stock_count + delta}.`}
                </div>
              )}

              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason</FormLabel>
                    <FormControl>
                      <Textarea placeholder="e.g. recounted, 2 short — cause unknown" rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {history.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">Recent adjustments</div>
                  <div className="rounded-md border divide-y max-h-32 overflow-y-auto">
                    {history.map((h) => (
                      <div key={h.ledger_id} className="p-2 text-xs flex items-start justify-between gap-2">
                        <span className="text-muted-foreground">{h.note}</span>
                        <span className={`shrink-0 font-medium tabular-nums ${h.quantity_change < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                          {h.quantity_change > 0 ? '+' : ''}{h.quantity_change}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="submit" disabled={form.formState.isSubmitting || delta === 0}>
                  {form.formState.isSubmitting ? 'Saving...' : 'Save Adjustment'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
