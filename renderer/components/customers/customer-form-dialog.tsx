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

import { callIpc, IpcError } from '@/lib/ipc-client';
import { config } from '@/lib/config';
import { SRI_LANKA_DISTRICTS, type Customer } from '@/lib/types';

const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  address: z.string().optional(),
  district: z.string().optional().nullable(),
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
    resolver: zodResolver(customerSchema),
    defaultValues: { name: '', phone: '', address: '', district: '' },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: editingCustomer?.name ?? '',
        phone: editingCustomer?.phone ?? '',
        address: editingCustomer?.address ?? '',
        district: editingCustomer?.district ?? '',
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
