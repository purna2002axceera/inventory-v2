'use client';

import { useEffect } from 'react';
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

function paymentSchema(outstanding: number) {
  return z.object({
    amount: z.coerce.number().positive('Must be greater than 0').max(outstanding, `Cannot exceed the outstanding balance (Rs. ${outstanding.toFixed(2)})`),
    paymentDate: z.string().min(1, 'Date is required'),
    note: z.string().optional(),
  });
}
type PaymentFormValues = { amount: number; paymentDate: string; note?: string };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function RecordPaymentDialog({
  soId,
  outstanding,
  open,
  onOpenChange,
  onSaved,
}: {
  soId: number;
  outstanding: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema(outstanding)) as any,
    defaultValues: { amount: outstanding, paymentDate: todayIso(), note: '' },
  });

  useEffect(() => {
    if (open) {
      form.reset({ amount: outstanding, paymentDate: todayIso(), note: '' });
    }
  }, [open, outstanding, form]);

  async function onSubmit(values: PaymentFormValues) {
    try {
      await callIpc(
        window.electronAPI.salesOrders.recordCreditPayment({
          soId,
          amount: values.amount,
          paymentDate: values.paymentDate,
          note: values.note || undefined,
        })
      );
      toast.success('Payment recorded');
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
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>Outstanding: Rs. {outstanding.toFixed(2)}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (Rs.)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} step="0.01" max={outstanding} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="paymentDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
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
