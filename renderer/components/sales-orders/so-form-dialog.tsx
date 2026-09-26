'use client';

import { useEffect, useState, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { callIpc, IpcError } from '@/lib/ipc-client';
import type { Customer, Item } from '@/lib/types';
import { useAsyncSearch } from '@/hooks/use-async-search';
import { AsyncCombobox } from '@/components/ui/async-combobox';

const soSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  orderDate: z.string().min(1, 'Order date is required').refine((d) => d <= new Date().toISOString().slice(0, 10), { message: 'Order date cannot be in the future' }),
  paymentType: z.enum(['CASH', 'CREDIT']).default('CASH'),
  creditDueDate: z.string().optional(),
  lines: z
    .array(
      z.object({
        itemId: z.string().min(1, 'Item is required'),
        batchId: z.string().optional(), // '' or 'AUTO' both mean FIFO
        quantity: z.coerce.number().int('Must be a whole number').positive('Must be greater than 0'),
      })
    )
    .min(1, 'At least one line is required'),
}).superRefine((data, ctx) => {
  const itemIds = new Set<string>();
  data.lines.forEach((line, i) => {
    if (line.itemId) {
      if (itemIds.has(line.itemId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate item selected', path: ['lines', i, 'itemId'] });
      } else {
        itemIds.add(line.itemId);
      }
    }
  });
  if (data.paymentType === 'CREDIT' && !data.creditDueDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Due date is required for credit sales', path: ['creditDueDate'] });
  }
});

type SoFormValues = z.infer<typeof soSchema>;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function SoFormDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [confirmValues, setConfirmValues] = useState<SoFormValues | null>(null);

  // Async search for customers
  const customerSearch = useAsyncSearch<Customer>({
    fetcher: useCallback(async (params) => {
      const result = await callIpc(window.electronAPI.customers.list({
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
      }));
      return { data: result.customers, total: result.total };
    }, []),
    idKey: 'customer_id',
    pageSize: 30,
  });

  // Shared async search for items (shared across all order lines)
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

  const form = useForm<SoFormValues>({
    resolver: zodResolver(soSchema) as any,
    defaultValues: { customerId: '', orderDate: todayIso(), paymentType: 'CASH', creditDueDate: '', lines: [{ itemId: '', batchId: 'AUTO', quantity: 1 }] },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' });

  const selectedCustomerId = form.watch('customerId');
  const selectedCustomer = selectedCustomerId ? customerSearch.getById(selectedCustomerId) : undefined;
  const paymentType = form.watch('paymentType');
  const watchedLines = form.watch('lines');

  // Non-credit customers can't have a credit order left dangling — force back to cash.
  useEffect(() => {
    if (!selectedCustomer?.credit_enabled && paymentType === 'CREDIT') {
      form.setValue('paymentType', 'CASH');
      form.setValue('creditDueDate', '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomerId]);

  const grandTotal = watchedLines.reduce((sum, l) => {
    const item = l.itemId ? itemSearch.getById(l.itemId) : undefined;
    return sum + (item ? item.unit_price * (Number(l.quantity) || 0) : 0);
  }, 0);
  const availableCredit = selectedCustomer ? selectedCustomer.credit_limit - selectedCustomer.credit_used : 0;
  const exceedsCredit = paymentType === 'CREDIT' && selectedCustomer ? grandTotal > availableCredit + 0.005 : false;

  useEffect(() => {
    if (open) {
      form.reset({ customerId: '', orderDate: todayIso(), paymentType: 'CASH', creditDueDate: '', lines: [{ itemId: '', batchId: 'AUTO', quantity: 1 }] });
    } else {
      customerSearch.reset();
      itemSearch.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form]);



  function onSubmit(values: SoFormValues) {
    setConfirmValues(values);
  }

  async function handleConfirm() {
    if (!confirmValues) return;
    const values = confirmValues;
    setConfirmValues(null);

    // Detect duplicate item + batch combinations and warn the user.
    // The backend merges them safely, but the user should know.
    const seen = new Map<string, number>();
    for (const line of values.lines) {
      const batchKey = line.batchId && line.batchId !== 'AUTO' ? line.batchId : 'AUTO';
      const key = `${line.itemId}:${batchKey}`;
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    const duplicates = Array.from(seen.values()).filter((count) => count > 1);
    if (duplicates.length > 0) {
      toast.info(
        'Duplicate lines for the same item + batch were detected and will be merged (quantities combined).'
      );
    }

    try {
      await callIpc(
        window.electronAPI.salesOrders.create({
          customerId: Number(values.customerId),
          orderDate: values.orderDate,
          paymentType: values.paymentType,
          creditDueDate: values.paymentType === 'CREDIT' ? values.creditDueDate : undefined,
          lines: values.lines.map((l) => ({
            itemId: Number(l.itemId),
            batchId: l.batchId && l.batchId !== 'AUTO' ? Number(l.batchId) : undefined,
            quantity: l.quantity,
          })),
        })
      );
      toast.success('Sales order created');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Something went wrong.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Sales Order</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit, () => {
              // On validation failure, scroll the first error into view
              setTimeout(() => {
                const formEl = document.querySelector('[data-so-form]');
                const firstError = formEl?.querySelector('[data-slot="form-message"]');
                if (firstError) {
                  firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }, 50);
            })}
            className="flex flex-col gap-4"
            data-so-form
          >
            {/* Fixed top section: customer + date */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer</FormLabel>
                    <FormControl>
                      <AsyncCombobox
                        search={customerSearch}
                        value={field.value}
                        onSelect={(id) => field.onChange(id)}
                        getId={(c) => String(c.customer_id)}
                        renderOption={(c) => {
                          const details = [c.address, c.phone].filter(Boolean).join(' • ');
                          return <>{c.name} {details && `(${details})`}</>;
                        }}
                        renderSelected={(c) => c.name}
                        placeholder="Select a customer"
                        searchPlaceholder="Search by name, address or phone..."
                        emptyText="No customer found."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="orderDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {selectedCustomer?.credit_enabled === 1 && (
              <div className="rounded-md border p-3 space-y-3 bg-muted/30">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="paymentType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="CASH">Cash</SelectItem>
                            <SelectItem value="CREDIT">Credit</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {paymentType === 'CREDIT' && (
                    <FormField
                      control={form.control}
                      name="creditDueDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Due Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Available credit: Rs. {availableCredit.toFixed(2)} of Rs. {selectedCustomer.credit_limit.toFixed(2)} limit
                  (Rs. {selectedCustomer.credit_used.toFixed(2)} already owed)
                </p>
                {exceedsCredit && (
                  <p className="text-xs text-destructive">
                    This order (Rs. {grandTotal.toFixed(2)}) exceeds {selectedCustomer.name}'s available credit (Rs. {availableCredit.toFixed(2)} left).
                  </p>
                )}
              </div>
            )}

            {/* Scrollable order lines area */}
            <div className="space-y-3 overflow-y-auto max-h-[45vh] pr-1">
              <FormLabel>Order Lines</FormLabel>
              {fields.map((field, index) => {
                const selectedItemId = form.watch(`lines.${index}.itemId`);
                const selectedItem = selectedItemId ? itemSearch.getById(selectedItemId) : undefined;

                return (
                  <div key={field.id} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <FormField
                        control={form.control}
                        name={`lines.${index}.itemId`}
                        render={({ field }) => (
                          <FormItem className="flex-1 min-w-0">
                            <FormControl>
                              <AsyncCombobox
                                search={itemSearch}
                                value={field.value}
                                onSelect={(id) => {
                                  field.onChange(id);
                                  form.setValue(`lines.${index}.batchId`, 'AUTO');
                                }}
                                getId={(i) => String(i.item_id)}
                                renderOption={(i) => <>{i.sku} — {i.name} (Stock: {i.stock_count})</>}
                                renderSelected={(i) => `${i.sku} — ${i.name}`}
                                placeholder="Select item"
                                searchPlaceholder="Search item by SKU or name..."
                                emptyText="No item found."
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`lines.${index}.quantity`}
                        render={({ field }) => (
                          <FormItem className="w-24">
                            <FormControl>
                              <Input type="number" min={1} step={1} placeholder="Qty" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={fields.length === 1}
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>


                    {selectedItem && (
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Total available: {selectedItem.stock_count}</span>
                        <span className="font-medium text-foreground">Selling price: Rs. {selectedItem.unit_price.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ itemId: '', batchId: 'AUTO', quantity: 1 })}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Line
              </Button>
            </div>

            {/* Sticky footer — always visible */}
            <DialogFooter className="border-t pt-4">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Create Order
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>

      <AlertDialog open={!!confirmValues} onOpenChange={(o) => { if (!o) setConfirmValues(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Sales Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to create this Sales Order? This action will allocate stock and generate a sales order number.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Yes, Create Order</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
