'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { callIpc } from '@/lib/ipc-client';
import type { CreditHistoryResult, CreditStatus } from '@/lib/types';

function statusBadge(status: CreditStatus) {
  if (status === 'WRITTEN_OFF') return <Badge variant="destructive">Written Off</Badge>;
  if (status === 'PAID') return <Badge>Paid</Badge>;
  return <Badge variant="outline">Pending Payment</Badge>;
}

export function CreditHistoryDialog({
  customerId,
  onOpenChange,
}: {
  customerId: number | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [history, setHistory] = useState<CreditHistoryResult | null>(null);

  useEffect(() => {
    if (customerId) {
      callIpc(window.electronAPI.customers.getCreditHistory(customerId)).then(setHistory);
    } else {
      setHistory(null);
    }
  }, [customerId]);

  return (
    <Dialog open={!!customerId} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{history?.customerName ?? 'Loading...'} — Credit History</DialogTitle>
        </DialogHeader>

        {history && (
          <div className="space-y-4">
            {history.totalWrittenOff > 0 && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
                Lifetime bad debt: <span className="font-semibold">Rs. {history.totalWrittenOff.toFixed(2)}</span> written
                off across this customer's credit history. This total persists even after individual balances are settled.
              </div>
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SO #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.orders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No credit sales for this customer.
                      </TableCell>
                    </TableRow>
                  )}
                  {history.orders.map((o) => (
                    <TableRow key={o.so_id}>
                      <TableCell className="font-mono">{o.so_number}</TableCell>
                      <TableCell>{o.order_date}</TableCell>
                      <TableCell className="text-right tabular-nums">Rs. {o.total_amount.toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums">Rs. {o.paid_amount.toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {o.credit_status === 'WRITTEN_OFF' ? (
                          <span className="text-destructive">Rs. {(o.written_off_amount ?? 0).toFixed(2)} written off</span>
                        ) : o.refundDue > 0 ? (
                          <span className="text-emerald-600">Rs. {o.refundDue.toFixed(2)} refund due</span>
                        ) : (
                          `Rs. ${o.outstanding.toFixed(2)}`
                        )}
                      </TableCell>
                      <TableCell>{statusBadge(o.credit_status)}</TableCell>
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
