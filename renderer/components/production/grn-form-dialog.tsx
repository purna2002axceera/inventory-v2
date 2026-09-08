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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

import { callIpc, IpcError } from '@/lib/ipc-client';
import type { Item, Batch } from '@/lib/types';
import { useAsyncSearch } from '@/hooks/use-async-search';
import { AsyncCombobox } from '@/components/ui/async-combobox';

const entrySchema = z.object({
  itemId: z.string().min(1, 'Item is required'),
  mode: z.enum(['EXISTING', 'NEW']),
  batchId: z.string().optional(),
  quantity: z.coerce.number().int('Must be a whole number').positive('Must be greater than 0'),
});

const grnBulkSchema = z.object({
  receivedDate: z.string().min(1, 'Received date is required').refine((d) => d <= new Date().toISOString().slice(0, 10), { message: 'Received date cannot be in the future' }),
  notes: z.string().optional(),
  entries: z
    .array(entrySchema)
    .min(1, 'At least one entry is required')
    .superRefine((entries, ctx) => {
      const itemIds = new Set<string>();
      entries.forEach((entry, i) => {
        if (entry.mode === 'EXISTING' && !entry.batchId) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select a batch', path: [i, 'batchId'] });
        }
        if (entry.itemId) {
          if (itemIds.has(entry.itemId)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate item selected', path: [i, 'itemId'] });
          } else {
            itemIds.add(entry.itemId);
          }
        }
      });
    }),
});

type GrnBulkFormValues = z.infer<typeof grnBulkSchema>;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_ENTRY = {
  itemId: '',
  mode: 'NEW' as const,
  batchId: '',
  quantity: 1,
};

export function GrnFormDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {

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

  const form = useForm<GrnBulkFormValues>({
    resolver: zodResolver(grnBulkSchema) as any,
    defaultValues: {
      receivedDate: todayIso(),
      notes: '',
      entries: [{ ...EMPTY_ENTRY }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'entries' });

  useEffect(() => {
    if (open) {
      form.reset({
        receivedDate: todayIso(),
        notes: '',
        entries: [{ ...EMPTY_ENTRY }],
      });
    } else {
      itemSearch.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form]);

  async function onSubmit(values: GrnBulkFormValues) {
    try {
      const payload = {
        receivedDate: values.receivedDate,
        notes: values.notes,
        entries: values.entries.map((e) => ({
          itemId: Number(e.itemId),
          batchId: e.mode === 'EXISTING' ? Number(e.batchId) : undefined,
          quantity: e.quantity,
        })),
      };

      const result = await callIpc(window.electronAPI.production.createBulk(payload));
      toast.success(`${result.created} production receipt${result.created === 1 ? '' : 's'} recorded (pending approval)`);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Something went wrong.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Production Receipt (GRN)</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Shared fields */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="receivedDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Received Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional, shared)</FormLabel>
                    <FormControl>
                      <Input placeholder="Applies to all entries" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Entry rows */}
            <div className="space-y-3">
              <FormLabel>Stock Entries</FormLabel>
              {fields.map((field, index) => {
                const selectedItemId = form.watch(`entries.${index}.itemId`);

                return (
                  <div key={field.id} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Entry {index + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={fields.length === 1}
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Item selector (AsyncCombobox) */}
                    <FormField
                      control={form.control}
                      name={`entries.${index}.itemId`}
                      render={({ field }) => (
                        <FormItem className="flex flex-col mt-2">
                          <FormLabel className="text-xs">Item</FormLabel>
                          <FormControl>
                            <AsyncCombobox
                              search={itemSearch}
                              value={field.value}
                              onSelect={(id) => {
                                form.setValue(`entries.${index}.itemId`, id);
                                form.setValue(`entries.${index}.mode`, 'NEW');
                                form.setValue(`entries.${index}.batchId`, '');
                              }}
                              getId={(i) => String(i.item_id)}
                              renderOption={(i) => <>{i.sku} — {i.name}</>}
                              renderSelected={(i) => `${i.sku} — ${i.name}`}
                              placeholder="Select an item"
                              searchPlaceholder="Search item by SKU or name..."
                              emptyText="No item found."
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {selectedItemId && (
                      <>
                        <div className="grid grid-cols-1 gap-3">
                          <FormField
                            control={form.control}
                            name={`entries.${index}.quantity`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">Quantity</FormLabel>
                                <FormControl>
                                  <Input type="number" min={1} step={1} {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ ...EMPTY_ENTRY })}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Entry
              </Button>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Saving...' : `Save ${fields.length} Entr${fields.length === 1 ? 'y' : 'ies'}`}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
