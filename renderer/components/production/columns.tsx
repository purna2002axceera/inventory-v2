'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ProductionReceipt } from '@/lib/types';

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'secondary',
  APPROVED: 'default',
  REJECTED: 'destructive',
  REVERSED: 'outline',
};

type ColumnActions = {
  onApprove: (receipt: ProductionReceipt) => void;
  onReject: (receipt: ProductionReceipt) => void;
  onReverse: (receipt: ProductionReceipt) => void;
};

export function getProductionColumns({ onApprove, onReject, onReverse }: ColumnActions): ColumnDef<ProductionReceipt>[] {
  return [
    {
      accessorKey: 'grn_number',
      header: 'GRN #',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.grn_number}</span>,
    },
    {
      accessorKey: 'item_name',
      header: 'Item',
      cell: ({ row }) => (
        <div>
          <div>{row.original.item_name}</div>
          <div className="text-xs text-muted-foreground font-mono">{row.original.item_sku}</div>
        </div>
      ),
    },
    {
      accessorKey: 'quantity',
      header: () => <div className="text-right">Quantity</div>,
      cell: ({ row }) => <div className="text-right tabular-nums">{row.original.quantity}</div>,
    },
    { accessorKey: 'received_date', header: 'Received Date' },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANTS[row.original.status] ?? 'outline'}>{row.original.status}</Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const receipt = row.original;
        if (receipt.status === 'PENDING') {
          return (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onApprove(receipt)}>
                Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => onReject(receipt)}>
                Reject
              </Button>
            </div>
          );
        }
        if (receipt.status === 'APPROVED') {
          return (
            <Button size="sm" variant="destructive" onClick={() => onReverse(receipt)}>
              Reverse
            </Button>
          );
        }
        return null;
      },
    },
  ];
}
