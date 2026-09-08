'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { callIpc, IpcError } from '@/lib/ipc-client';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import type { ReturnNoteDetail } from '@/lib/types';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'outline',
  APPROVED: 'default',
  REJECTED: 'destructive',
};

export function ReturnDetailDialog({
  returnId,
  onOpenChange,
  onActionTaken,
}: {
  returnId: number | null;
  onOpenChange: (open: boolean) => void;
  onActionTaken: () => void;
}) {
  const { user } = useAuth();
  const [detail, setDetail] = useState<ReturnNoteDetail | null>(null);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (returnId) {
      callIpc(window.electronAPI.returns.get(returnId)).then((d) => setDetail(d as ReturnNoteDetail));
    } else {
      setDetail(null);
    }
  }, [returnId]);

  async function handleApprove() {
    if (!returnId) return;
    setActing(true);
    try {
      await callIpc(window.electronAPI.returns.approve({ returnId, userId: user?.userId }));
      toast.success('Return note approved — stock updated');
      onOpenChange(false);
      onActionTaken();
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Failed to approve return.');
    } finally {
      setActing(false);
    }
  }

  async function handleReject() {
    if (!returnId) return;
    setActing(true);
    try {
      await callIpc(window.electronAPI.returns.reject({ returnId, userId: user?.userId }));
      toast.success('Return note rejected');
      onOpenChange(false);
      onActionTaken();
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Failed to reject return.');
    } finally {
      setActing(false);
    }
  }

  return (
    <Dialog open={!!returnId} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{detail?.return_number ?? 'Loading...'}</DialogTitle>
        </DialogHeader>
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Type:</span>{' '}
                <Badge variant={detail.type === 'INTERNAL' ? 'secondary' : 'default'}>
                  {detail.type === 'INTERNAL' ? 'Internal' : 'Customer'}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>{' '}
                <Badge variant={STATUS_VARIANT[detail.status] || 'outline'}>{detail.status}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Date:</span> {detail.return_date}
              </div>
              {detail.so_number && (
                <div>
                  <span className="text-muted-foreground">Sales Order:</span>{' '}
                  <span className="font-mono">{detail.so_number}</span>
                  {detail.customer_name && (
                    <span className="text-muted-foreground"> ({detail.customer_name})</span>
                  )}
                </div>
              )}
            </div>

            {detail.reason && (
              <div className="text-sm">
                <span className="text-muted-foreground">Reason:</span>
                <p className="mt-1 whitespace-pre-wrap bg-muted/50 rounded-md p-3">{detail.reason}</p>
              </div>
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Condition</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.items.map((line) => (
                    <TableRow key={line.rni_id}>
                      <TableCell>
                        {line.item_name}{' '}
                        <span className="text-xs text-muted-foreground font-mono">{line.item_sku}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                      <TableCell>
                        <Badge variant={line.condition === 'RESALABLE' ? 'default' : 'destructive'}>
                          {line.condition === 'RESALABLE' ? 'Resalable' : 'Damaged'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {detail.decision_note && (
              <div className="text-sm">
                <span className="text-muted-foreground">Decision Note:</span>
                <p className="mt-1 whitespace-pre-wrap bg-muted/50 rounded-md p-3">{detail.decision_note}</p>
              </div>
            )}

            {detail.status === 'PENDING' && (
              <DialogFooter>
                <Button variant="destructive" onClick={handleReject} disabled={acting}>
                  Reject
                </Button>
                <Button onClick={handleApprove} disabled={acting}>
                  {acting ? 'Processing...' : 'Approve'}
                </Button>
              </DialogFooter>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
