'use client';

import { useEffect, useState, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Trash2, Plus } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

import { callIpc, IpcError } from '@/lib/ipc-client';
import type { Item, ReturnableItem } from '@/lib/types';
import { useAsyncSearch } from '@/hooks/use-async-search';
import { AsyncCombobox } from '@/components/ui/async-combobox';

// --- Internal Return schema ---
const internalLineSchema = z.object({
  itemId: z.string().min(1, 'Item is required'),
  quantity: z.coerce.number().int('Must be a whole number').positive('Must be greater than 0'),
});

const internalSchema = z.object({
  returnDate: z.string().min(1, 'Return date is required').refine((d) => d <= new Date().toISOString().slice(0, 10), { message: 'Date cannot be in the future' }),
  reason: z.string().optional(),
  items: z
    .array(internalLineSchema)
    .min(1, 'At least one item is required')
    .superRefine((items, ctx) => {
      const seen = new Set<string>();
      items.forEach((item, i) => {
        if (item.itemId && seen.has(item.itemId)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate item', path: [i, 'itemId'] });
        }
        seen.add(item.itemId);
      });
    }),
});
type InternalFormValues = z.infer<typeof internalSchema>;

// --- Customer Return schema ---
const customerLineSchema = z
  .object({
    itemId: z.string().min(1, 'Item is required'),
    quantity: z.coerce.number().int('Must be a whole number').min(0, 'Cannot be negative'),
    condition: z.enum(['RESALABLE', 'DAMAGED'], { message: 'Select condition' }),
    resolution: z.enum(['REFUND', 'EXCHANGE']).optional(),
  })
  .superRefine((line, ctx) => {
    if (line.quantity > 0 && line.condition === 'DAMAGED' && !line.resolution) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose refund or exchange', path: ['resolution'] });
    }
  });

const customerSchema = z.object({
  soNumber: z.string().min(1, 'Sales order number is required'),
  orderDate: z.string().optional(),
  returnDate: z.string().min(1, 'Return date is required').refine((d) => d <= new Date().toISOString().slice(0, 10), { message: 'Date cannot be in the future' }),
  reason: z.string().optional(),
  items: z.array(customerLineSchema).min(1, 'At least one item is required'),
}).refine(data => {
  if (data.orderDate && data.returnDate) {
    return data.returnDate >= data.orderDate;
  }
  return true;
}, {
  message: "Return date cannot be before the sales order date",
  path: ["returnDate"]
});
type CustomerFormValues = z.infer<typeof customerSchema>;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function ReturnFormDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [returnType, setReturnType] = useState<'INTERNAL' | 'CUSTOMER' | null>(null);

  function handleClose() {
    setReturnType(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); else onOpenChange(true); }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {!returnType ? 'New Return Note' : returnType === 'INTERNAL' ? 'Internal Return' : 'Customer Return'}
          </DialogTitle>
        </DialogHeader>

        {!returnType ? (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">What type of return is this?</p>
            <div className="grid grid-cols-2 gap-4">
              <button
                className="p-6 border rounded-lg hover:bg-muted/50 text-left space-y-1 transition-colors"
                onClick={() => setReturnType('INTERNAL')}
              >
                <div className="font-semibold">Internal Return</div>
                <div className="text-sm text-muted-foreground">
                  Damaged, lost, or defective items from stock (e.g., rat damage, production defects)
                </div>
              </button>
              <button
                className="p-6 border rounded-lg hover:bg-muted/50 text-left space-y-1 transition-colors"
                onClick={() => setReturnType('CUSTOMER')}
              >
                <div className="font-semibold">Customer Return</div>
                <div className="text-sm text-muted-foreground">
                  Items returned by a customer against a sales order
                </div>
              </button>
            </div>
          </div>
        ) : returnType === 'INTERNAL' ? (
          <InternalReturnForm onClose={handleClose} onSaved={onSaved} />
        ) : (
          <CustomerReturnForm onClose={handleClose} onSaved={onSaved} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// â”€â”€â”€ Internal Return Form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function InternalReturnForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  // Async search for items
  const itemSearch = useAsyncSearch<Item>({
    fetcher: useCallback(async (params) => {
      const result = await callIpc(window.electronAPI.items.list({
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
      }));
      return { data: result.items, total: result.total };
    }, []),
    idKey: 'item_id',
    pageSize: 30,
  });

  const form = useForm<InternalFormValues>({
    resolver: zodResolver(internalSchema) as any,
    defaultValues: { returnDate: todayIso(), reason: '', items: [{ itemId: '', quantity: 1 }] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });

  async function onSubmit(values: InternalFormValues) {
    try {
      await callIpc(
        window.electronAPI.returns.create({
          type: 'INTERNAL',
          returnDate: values.returnDate,
          reason: values.reason,
          items: values.items.map((item) => ({
            itemId: Number(item.itemId),
            quantity: item.quantity,
            condition: 'DAMAGED' as const,
          })),
        })
      );
      toast.success('Internal return note created (pending approval)');
      onClose();
      onSaved();
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Failed to create return note.');
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="returnDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Return Date</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Return Reason (Optional)</FormLabel>
              <FormControl>
                <Textarea placeholder="Describe why these items are being returned..." rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-3">
          <FormLabel>Items to Return</FormLabel>
          {fields.map((field, index) => (
            <div key={field.id} className="rounded-md border p-3 space-y-2">
              <div className="flex items-start gap-2">
                <FormField
                  control={form.control}
                  name={`items.${index}.itemId`}
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <AsyncCombobox
                          search={itemSearch}
                          value={field.value}
                          onSelect={(id) => form.setValue(`items.${index}.itemId`, id, { shouldValidate: true })}
                          getId={(i) => String(i.item_id)}
                          renderOption={(i) => <>{i.sku} — {i.name} (Stock: {i.stock_count})</>}
                          renderSelected={(i) => `${i.sku} — ${i.name} (Stock: ${i.stock_count})`}
                          placeholder="Select item"
                          searchPlaceholder="Search item..."
                          emptyText="No item found."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`items.${index}.quantity`}
                  render={({ field }) => (
                    <FormItem className="w-24">
                      <FormControl>
                        <Input type="number" min={1} step={1} placeholder="Qty" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="button" variant="ghost" size="icon" disabled={fields.length === 1} onClick={() => remove(index)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ itemId: '', quantity: 1 })}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Item
          </Button>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Creating...' : 'Create Return Note'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

// â”€â”€â”€ Customer Return Form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CustomerReturnForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [soIdResolved, setSoIdResolved] = useState<number | null>(null);
  const [soInfo, setSoInfo] = useState<{ soNumber: string; customerName: string; orderDate?: string } | null>(null);
  const [returnableItems, setReturnableItems] = useState<ReturnableItem[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  // Async search for sales orders
  const soSearch = useAsyncSearch<any>({
    fetcher: useCallback(async (params) => {
      const result = await callIpc(window.electronAPI.salesOrders.list({
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
      }));
      return { data: result.orders, total: result.total };
    }, []),
    idKey: 'so_id',
    pageSize: 30,
  });

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema) as any,
    defaultValues: { soNumber: '', returnDate: todayIso(), reason: '', items: [] },
  });
  const { fields, replace } = useFieldArray({ control: form.control, name: 'items' });
  const watchedItems = form.watch('items');

  // Refund total: RESALABLE and DAMAGED+REFUND lines pay cash back; EXCHANGE lines don't.
  const totalRefund = watchedItems.reduce((sum, item, index) => {
    const ri = returnableItems[index];
    if (!ri || !item.quantity) return sum;
    const isRefund = item.condition === 'RESALABLE' || (item.condition === 'DAMAGED' && item.resolution === 'REFUND');
    return isRefund ? sum + item.quantity * ri.unitPrice : sum;
  }, 0);

  async function loadReturnableItems(soNumber: string) {
    if (!soNumber.trim()) return;

    setSearching(true);
    setSearchError(null);
    setSoIdResolved(null);
    setSoInfo(null);
    setReturnableItems([]);
    replace([]);

    try {
      const result = await callIpc(window.electronAPI.returns.getReturnableItems(soNumber.trim()));
      if (result.items.length === 0) {
        setSearchError('All items in this sales order have already been returned or are pending return.');
        setSearching(false);
        return;
      }

      setSoIdResolved(result.soId);
      setSoInfo({ soNumber: result.soNumber, customerName: result.customerName, orderDate: result.orderDate });
      form.setValue('orderDate', result.orderDate);
      setReturnableItems(result.items);
      replace(
        result.items.map((item) => ({
          itemId: String(item.itemId),
          quantity: 0,
          condition: 'RESALABLE' as const,
        }))
      );
    } catch (err) {
      setSearchError(err instanceof IpcError ? err.message : 'Failed to look up sales order.');
    } finally {
      setSearching(false);
    }
  }

  async function onSubmit(values: CustomerFormValues) {
    if (!soIdResolved) return;

    // Filter out items with 0 quantity
    const returnItems = values.items
      .filter((item) => item.quantity > 0)
      .map((item) => ({
        itemId: Number(item.itemId),
        quantity: item.quantity,
        condition: item.condition as 'RESALABLE' | 'DAMAGED',
        resolution: item.condition === 'DAMAGED' ? (item.resolution as 'REFUND' | 'EXCHANGE') : undefined,
      }));

    if (returnItems.length === 0) {
      toast.error('Enter a return quantity for at least one item.');
      return;
    }

    try {
      await callIpc(
        window.electronAPI.returns.create({
          type: 'CUSTOMER',
          soId: soIdResolved,
          returnDate: values.returnDate,
          reason: values.reason,
          items: returnItems,
        })
      );
      toast.success('Customer return note created (pending approval)');
      onClose();
      onSaved();
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Failed to create return note.');
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="soNumber"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Sales Order Number</FormLabel>
                <FormControl>
                  <div className="flex-1">
                    <AsyncCombobox
                      search={soSearch}
                      value={field.value}
                      onSelect={(id) => {
                        const so = soSearch.getById(id);
                        if (so) {
                          form.setValue('soNumber', so.so_number, { shouldValidate: true });
                          loadReturnableItems(so.so_number);
                        }
                      }}
                      getId={(o) => String(o.so_id)}
                      renderOption={(o) => <>{o.so_number} — {o.customer_name}</>}
                      renderSelected={(o) => `${o.so_number} — ${o.customer_name}`}
                      placeholder="Search and select SO..."
                      searchPlaceholder="Type SO number or customer..."
                      emptyText="No sales orders found."
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="returnDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Return Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {searchError && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{searchError}</div>
        )}

        {soInfo && (
          <div className="text-sm bg-muted/50 rounded-md p-3 space-y-1">
            <div>
              <span className="text-muted-foreground">Order:</span>{' '}
              <span className="font-mono font-medium">{soInfo.soNumber}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Customer:</span>{' '}
              <span className="font-medium">{soInfo.customerName}</span>
            </div>
          </div>
        )}

        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Return Reason (Optional)</FormLabel>
              <FormControl>
                <Textarea placeholder="Describe the reason for this return..." rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {returnableItems.length > 0 && (
          <div className="space-y-3">
            <FormLabel>Items to Return</FormLabel>
            {fields.map((field, index) => {
              const ri = returnableItems[index];
              if (!ri) return null;
              return (
                <div key={field.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{ri.itemName}</span>{' '}
                      <span className="text-xs text-muted-foreground font-mono">{ri.itemSku}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Sold: {ri.soldQty} · Returnable: {ri.maxReturnable}
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <FormField
                      control={form.control}
                      name={`items.${index}.quantity`}
                      render={({ field }) => (
                        <FormItem className="w-24">
                          <FormLabel className="text-xs">Qty</FormLabel>
                          <FormControl>
                            <Input type="number" min={0} max={ri.maxReturnable} step={1} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.condition`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel className="text-xs">Condition</FormLabel>
                          <RadioGroup
                            onValueChange={(value) => {
                              field.onChange(value);
                              // Resolution only applies to DAMAGED; clear it when switching back to RESALABLE.
                              if (value === 'RESALABLE') {
                                form.setValue(`items.${index}.resolution`, undefined);
                              }
                            }}
                            value={field.value}
                            className="flex gap-4 mt-1"
                          >
                            <div className="flex items-center gap-2">
                              <RadioGroupItem value="RESALABLE" id={`cond-resalable-${index}`} />
                              <Label htmlFor={`cond-resalable-${index}`} className="text-sm cursor-pointer">
                                Resalable (restock)
                              </Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <RadioGroupItem value="DAMAGED" id={`cond-damaged-${index}`} />
                              <Label htmlFor={`cond-damaged-${index}`} className="text-sm cursor-pointer">
                                Damaged (discard)
                              </Label>
                            </div>
                          </RadioGroup>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {watchedItems[index]?.condition === 'DAMAGED' && (
                    <FormField
                      control={form.control}
                      name={`items.${index}.resolution`}
                      render={({ field }) => {
                        const qty = watchedItems[index]?.quantity || 0;
                        const insufficientStock = field.value === 'EXCHANGE' && qty > ri.stockCount;
                        return (
                          <FormItem className="rounded-md bg-muted/30 p-2">
                            <FormLabel className="text-xs">Resolution</FormLabel>
                            <RadioGroup
                              onValueChange={field.onChange}
                              value={field.value}
                              className="flex gap-4 mt-1"
                            >
                              <div className="flex items-center gap-2">
                                <RadioGroupItem value="REFUND" id={`res-refund-${index}`} />
                                <Label htmlFor={`res-refund-${index}`} className="text-sm cursor-pointer">
                                  Refund money
                                </Label>
                              </div>
                              <div className="flex items-center gap-2">
                                <RadioGroupItem value="EXCHANGE" id={`res-exchange-${index}`} />
                                <Label htmlFor={`res-exchange-${index}`} className="text-sm cursor-pointer">
                                  Exchange for new one
                                </Label>
                              </div>
                            </RadioGroup>
                            <div className="text-xs mt-1">
                              {field.value === 'EXCHANGE' ? (
                                <span className={insufficientStock ? 'text-destructive' : 'text-muted-foreground'}>
                                  In stock: {ri.stockCount}
                                  {insufficientStock ? ' — not enough to exchange, use refund instead.' : ' — no refund, replacement issued from stock.'}
                                </span>
                              ) : field.value === 'REFUND' ? (
                                <span className="text-muted-foreground">
                                  Refund amount: Rs. {(qty * ri.unitPrice).toFixed(2)}
                                </span>
                              ) : null}
                            </div>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                  )}

                  {watchedItems[index]?.condition === 'RESALABLE' && (watchedItems[index]?.quantity || 0) > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Refund amount: Rs. {((watchedItems[index]?.quantity || 0) * ri.unitPrice).toFixed(2)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {returnableItems.length > 0 && totalRefund > 0 && (
          <div className="flex items-center justify-between rounded-md border bg-muted/50 p-3 text-sm font-medium">
            <span>Total Refund</span>
            <span>Rs. {totalRefund.toFixed(2)}</span>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={form.formState.isSubmitting || !soIdResolved}>
            {form.formState.isSubmitting ? 'Creating...' : 'Create Return Note'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

