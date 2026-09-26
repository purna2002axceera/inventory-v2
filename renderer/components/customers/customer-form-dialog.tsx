'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

import { callIpc, IpcError } from '@/lib/ipc-client';
import { config } from '@/lib/config';
import { SRI_LANKA_DISTRICTS, type Customer } from '@/lib/types';

const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  address: z.string().optional(),
  district: z.string().optional().nullable(),
  creditEnabled: z.boolean().default(false),
  creditLimit: z.coerce.number().min(0, 'Must be zero or positive').default(0),
});

type CustomerFormValues = z.infer<typeof customerSchema>;

export function CustomerFormDialog({
  open,
  onOpenChange,
  editingCustomer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingCustomer: Customer | null;
  onSaved: () => void;
}) {
  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema) as any,
    defaultValues: { name: '', phone: '', address: '', district: '', creditEnabled: false, creditLimit: 0 },
  });

  const creditEnabled = form.watch('creditEnabled');

  useEffect(() => {
    if (open) {
      form.reset({
        name: editingCustomer?.name ?? '',
        phone: editingCustomer?.phone ?? '',
        address: editingCustomer?.address ?? '',
        district: editingCustomer?.district ?? '',
        creditEnabled: !!editingCustomer?.credit_enabled,
        creditLimit: editingCustomer?.credit_limit ?? 0,
      });
    }
  }, [open, editingCustomer, form]);

  async function onSubmit(values: CustomerFormValues) {
    try {
      const payload = {
        name: values.name,
        phone: values.phone || undefined,
        address: values.address || undefined,
        district: values.district && values.district !== 'NONE' ? values.district : null,
        creditEnabled: values.creditEnabled,
        creditLimit: values.creditEnabled ? values.creditLimit : 0,
      };

      if (editingCustomer) {
        await callIpc(window.electronAPI.customers.update({ customerId: editingCustomer.customer_id, ...payload }));
        toast.success('Customer updated');
      } else {
        await callIpc(window.electronAPI.customers.create(payload));
        toast.success('Customer created');
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Something went wrong.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingCustomer ? 'Edit Customer' : 'New Customer'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone (optional)</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {config.clientName === 'nethu' && (
              <FormField
                control={form.control}
                name="district"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>District (optional)</FormLabel>
                    <Select
                      value={field.value || 'NONE'}
                      onValueChange={(val) => field.onChange(val === 'NONE' ? '' : val)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select District..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="NONE">— None / Unspecified —</SelectItem>
                        {SRI_LANKA_DISTRICTS.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="creditEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-2 rounded-md border p-3 space-y-0">
                  <FormLabel className="!mt-0 cursor-pointer font-normal">
                    Enable credit purchases
                  </FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            {creditEnabled && (
              <FormField
                control={form.control}
                name="creditLimit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Credit limit (Rs.)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="0.01" {...field} />
                    </FormControl>
                    {editingCustomer && (editingCustomer.credit_used ?? 0) > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Currently owes Rs. {editingCustomer.credit_used.toFixed(2)} — the limit can't be set below this.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
