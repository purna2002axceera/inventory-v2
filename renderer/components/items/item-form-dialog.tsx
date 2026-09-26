'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AsyncCombobox } from '@/components/ui/async-combobox';
import { useAsyncSearch } from '@/hooks/use-async-search';

import { callIpc, IpcError } from '@/lib/ipc-client';
import type { Item, ItemTypeRecord } from '@/lib/types';

const itemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  bikeModel: z.string().min(1, 'Bike model is required'),
  type: z.string().min(1, 'Type is required'),
  description: z.string().optional(),
  unitCost: z.coerce.number().min(0, 'Cost cannot be negative').optional(),
  unitPrice: z.coerce.number().min(0, 'Selling price is required and cannot be negative'),
  costRexine: z.union([z.coerce.number().min(0, 'Cannot be negative'), z.literal('')]).optional().transform(v => v === '' ? undefined : v),
  costLabor: z.union([z.coerce.number().min(0, 'Cannot be negative'), z.literal('')]).optional().transform(v => v === '' ? undefined : v),
  costEmboss: z.union([z.coerce.number().min(0, 'Cannot be negative'), z.literal('')]).optional().transform(v => v === '' ? undefined : v),
  costThread: z.union([z.coerce.number().min(0, 'Cannot be negative'), z.literal('')]).optional().transform(v => v === '' ? undefined : v),
  costPacking: z.union([z.coerce.number().min(0, 'Cannot be negative'), z.literal('')]).optional().transform(v => v === '' ? undefined : v),
  costCover: z.union([z.coerce.number().min(0, 'Cannot be negative'), z.literal('')]).optional().transform(v => v === '' ? undefined : v),
  costNamePrinting: z.union([z.coerce.number().min(0, 'Cannot be negative'), z.literal('')]).optional().transform(v => v === '' ? undefined : v),
  costPunch: z.union([z.coerce.number().min(0, 'Cannot be negative'), z.literal('')]).optional().transform(v => v === '' ? undefined : v),
  costWire: z.union([z.coerce.number().min(0, 'Cannot be negative'), z.literal('')]).optional().transform(v => v === '' ? undefined : v),
  costPackingLabor: z.union([z.coerce.number().min(0, 'Cannot be negative'), z.literal('')]).optional().transform(v => v === '' ? undefined : v),
  costOther: z.union([z.coerce.number().min(0, 'Cannot be negative'), z.literal('')]).optional().transform(v => v === '' ? undefined : v),
}).refine(data => {
  return (data.unitCost || 0) > 0;
}, {
  message: "Production cost must be greater than 0 (enter raw material costs)",
  path: ["unitCost"],
}).refine(data => {
  return data.unitPrice >= (data.unitCost || 0);
}, {
  message: "Selling price cannot be lower than production cost",
  path: ["unitPrice"],
});

type ItemFormValues = z.infer<typeof itemSchema>;

export function ItemFormDialog({
  open,
  onOpenChange,
  editingItem,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingItem: Item | null;
  onSaved: () => void;
}) {
  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema) as any,
    defaultValues: { name: '', bikeModel: '', type: undefined, description: '', unitCost: 0, unitPrice: 0 },
  });

  const [isNewTypeOpen, setIsNewTypeOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [isCreatingType, setIsCreatingType] = useState(false);

  const [typeToDelete, setTypeToDelete] = useState<ItemTypeRecord | null>(null);
  const [isDeletingType, setIsDeletingType] = useState(false);

  const typeSearch = useAsyncSearch<ItemTypeRecord>({
    fetcher: async (params) => {
      const res = await callIpc(window.electronAPI.items.listTypes(params));
      return { data: res.types, total: res.types.length };
    },
    idKey: 'name',
  });

  const costRexine = form.watch('costRexine');
  const costLabor = form.watch('costLabor');
  const costEmboss = form.watch('costEmboss');
  const costThread = form.watch('costThread');
  const costPacking = form.watch('costPacking');
  const costCover = form.watch('costCover');
  const costNamePrinting = form.watch('costNamePrinting');
  const costPunch = form.watch('costPunch');
  const costWire = form.watch('costWire');
  const costPackingLabor = form.watch('costPackingLabor');
  const costOther = form.watch('costOther');

  const hasBreakdown = costRexine !== undefined || costLabor !== undefined || costEmboss !== undefined || costThread !== undefined || costPacking !== undefined || costCover !== undefined || costNamePrinting !== undefined || costPunch !== undefined || costWire !== undefined || costPackingLabor !== undefined || costOther !== undefined;

  useEffect(() => {
    const sum = (Number(costRexine) || 0) + (Number(costLabor) || 0) + (Number(costEmboss) || 0) +
      (Number(costThread) || 0) + (Number(costPacking) || 0) + (Number(costCover) || 0) +
      (Number(costNamePrinting) || 0) + (Number(costPunch) || 0) + (Number(costWire) || 0) + (Number(costPackingLabor) || 0) +
      (Number(costOther) || 0);
    form.setValue('unitCost', sum);
  }, [costRexine, costLabor, costEmboss, costThread, costPacking, costCover, costNamePrinting, costPunch, costWire, costPackingLabor, costOther, form, hasBreakdown]);

  useEffect(() => {
    if (open) {
      form.reset({
        name: editingItem?.name ?? '',
        bikeModel: editingItem?.bike_model ?? '',
        type: editingItem?.type,
        description: editingItem?.description ?? '',
        unitCost: editingItem?.unit_cost ?? 0,
        unitPrice: editingItem?.unit_price ?? 0,
        costRexine: editingItem?.cost_rexine ?? undefined,
        costLabor: editingItem?.cost_labor ?? undefined,
        costEmboss: editingItem?.cost_emboss ?? undefined,
        costThread: editingItem?.cost_thread ?? undefined,
        costPacking: editingItem?.cost_packing ?? undefined,
        costCover: editingItem?.cost_cover ?? undefined,
        costNamePrinting: editingItem?.cost_name_printing ?? undefined,
        costPunch: editingItem?.cost_punch ?? undefined,
        costWire: editingItem?.cost_wire ?? undefined,
        costPackingLabor: editingItem?.cost_packing_labor ?? undefined,
        costOther: editingItem?.cost_other ?? undefined,
      });
    }
  }, [open, editingItem, form]);

  async function onSubmit(values: ItemFormValues) {
    try {
      if (editingItem) {
        await callIpc(
          window.electronAPI.items.update({
            itemId: editingItem.item_id,
            name: values.name,
            bikeModel: values.bikeModel,
            type: values.type,
            description: values.description,
            unitCost: values.unitCost,
            unitPrice: values.unitPrice,
            costRexine: values.costRexine,
            costLabor: values.costLabor,
            costEmboss: values.costEmboss,
            costThread: values.costThread,
            costPacking: values.costPacking,
            costCover: values.costCover,
            costNamePrinting: values.costNamePrinting,
            costPunch: values.costPunch,
            costWire: values.costWire,
            costPackingLabor: values.costPackingLabor,
            costOther: values.costOther,
          })
        );
        toast.success('Item updated');
      } else {
        await callIpc(
          window.electronAPI.items.create({
            name: values.name,
            bikeModel: values.bikeModel,
            type: values.type,
            description: values.description,
            unitCost: values.unitCost,
            unitPrice: values.unitPrice,
            costRexine: values.costRexine,
            costLabor: values.costLabor,
            costEmboss: values.costEmboss,
            costThread: values.costThread,
            costPacking: values.costPacking,
            costCover: values.costCover,
            costNamePrinting: values.costNamePrinting,
            costPunch: values.costPunch,
            costWire: values.costWire,
            costPackingLabor: values.costPackingLabor,
            costOther: values.costOther,
          })
        );
        toast.success('Item created');
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Something went wrong.');
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Item' : 'New Item'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-2 gap-6 max-h-[80vh] overflow-y-auto pr-2">
              {/* Left Column: Basic Details */}
              <div className="space-y-4">
                {editingItem && (
                  <div className="text-sm text-muted-foreground">
                    SKU: <span className="font-mono">{editingItem.sku}</span>
                  </div>
                )}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="CT-100 Seat Cover — Black" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bikeModel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bike Model</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="CT-100" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Type</FormLabel>
                      <FormControl>
                        <AsyncCombobox
                          search={typeSearch}
                          value={field.value ?? ''}
                          onSelect={(id) => {
                            form.setValue('type', id, { shouldValidate: true });
                          }}
                          getId={(o) => o.name}
                          renderOption={(o) => (
                            <div className="flex items-center gap-2">
                              <span>{o.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">({o.item_count || 0} items)</span>
                            </div>
                          )}
                          renderSelected={(o) => o.name}
                          placeholder="Select type..."
                          searchPlaceholder="Search types..."
                          header={
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start text-primary"
                              onClick={() => {
                                setNewTypeName('');
                                setIsNewTypeOpen(true);
                              }}
                            >
                              <Plus className="mr-2 h-4 w-4" /> Add New Type
                            </Button>
                          }
                          renderOptionAction={(o) => (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => setTypeToDelete(o)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="unitCost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Production Cost</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} step="0.01" {...field} disabled />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="unitPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Selling Price</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} step="0.01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Right Column: Breakdown */}
              <div className="space-y-4 pl-6 border-l">
                <h3 className="text-sm font-medium mb-3">Raw Material Costs (Optional Breakdown)</h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="costRexine" render={({ field }) => (
                    <FormItem><FormLabel>Rexine</FormLabel><FormControl><Input type="number" min={0} step="0.01" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="costLabor" render={({ field }) => (
                    <FormItem><FormLabel>Labor (වැඩ කුලී)</FormLabel><FormControl><Input type="number" min={0} step="0.01" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="costEmboss" render={({ field }) => (
                    <FormItem><FormLabel>Emboss</FormLabel><FormControl><Input type="number" min={0} step="0.01" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="costThread" render={({ field }) => (
                    <FormItem><FormLabel>Thread/Cord/Piping</FormLabel><FormControl><Input type="number" min={0} step="0.01" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="costPacking" render={({ field }) => (
                    <FormItem><FormLabel>Packing Cost</FormLabel><FormControl><Input type="number" min={0} step="0.01" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="costCover" render={({ field }) => (
                    <FormItem><FormLabel>Cover (කවරේ)</FormLabel><FormControl><Input type="number" min={0} step="0.01" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="costNamePrinting" render={({ field }) => (
                    <FormItem><FormLabel>Helmet Lock/Zipper</FormLabel><FormControl><Input type="number" min={0} step="0.01" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="costPunch" render={({ field }) => (
                    <FormItem><FormLabel>Punch</FormLabel><FormControl><Input type="number" min={0} step="0.01" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="costWire" render={({ field }) => (
                    <FormItem><FormLabel>Wire/Camrella</FormLabel><FormControl><Input type="number" min={0} step="0.01" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="costPackingLabor" render={({ field }) => (
                    <FormItem><FormLabel>Packing Labour Cost</FormLabel><FormControl><Input type="number" min={0} step="0.01" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="costOther" render={({ field }) => (
                    <FormItem className="col-span-2"><FormLabel>Other</FormLabel><FormControl><Input type="number" min={0} step="0.01" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              </div>

              {/* Footer */}
              <div className="col-span-2 pt-4 border-t flex justify-end">
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isNewTypeOpen} onOpenChange={setIsNewTypeOpen}>
        <DialogContent className="sm:max-w-md" style={{ zIndex: 60 }}>
          <DialogHeader>
            <DialogTitle>Add New Type</DialogTitle>
            <DialogDescription>
              Enter the name of the new item type. A unique code will be generated automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newTypeName}
              onChange={e => setNewTypeName(e.target.value)}
              placeholder="e.g. Tank Cover"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateType();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewTypeOpen(false)} disabled={isCreatingType}>Cancel</Button>
            <Button onClick={handleCreateType} disabled={isCreatingType || !newTypeName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!typeToDelete} onOpenChange={(open) => !open && setTypeToDelete(null)}>
        <DialogContent className="sm:max-w-md" style={{ zIndex: 60 }}>
          <DialogHeader>
            <DialogTitle>Delete Type</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the type &quot;{typeToDelete?.name}&quot;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTypeToDelete(null)} disabled={isDeletingType}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteType} disabled={isDeletingType}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  async function handleCreateType() {
    if (!newTypeName.trim()) return;
    setIsCreatingType(true);
    try {
      const res = await callIpc(window.electronAPI.items.createType({ name: newTypeName }));
      toast.success('Type created successfully');
      form.setValue('type', res.name, { shouldValidate: true });
      typeSearch.reload(); // refresh list
      setIsNewTypeOpen(false);
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Failed to create type');
    } finally {
      setIsCreatingType(false);
    }
  }

  async function handleDeleteType() {
    if (!typeToDelete) return;
    setIsDeletingType(true);
    try {
      await callIpc(window.electronAPI.items.deleteType({ name: typeToDelete.name }));
      toast.success('Type deleted successfully');
      if (form.getValues().type === typeToDelete.name) {
        form.setValue('type', undefined as any);
      }
      typeSearch.reload(); // refresh list
      setTypeToDelete(null);
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Failed to delete type');
    } finally {
      setIsDeletingType(false);
    }
  }
}
