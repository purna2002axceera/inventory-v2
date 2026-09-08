'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import type { SalesOrder } from '@/lib/types';

export const salesOrderColumns: ColumnDef<SalesOrder>[] = [
  { accessorKey: 'so_number', header: 'SO #', cell: ({ row }) => <span className="font-mono text-xs">{row.original.so_number}</span> },
  { accessorKey: 'customer_name', header: 'Customer' },
  { accessorKey: 'order_date', header: 'Order Date' },
  {
    accessorKey: 'total_amount',
    header: () => <div className="text-right">Total</div>,
    cell: ({ row }) => <div className="text-right tabular-nums">Rs. {row.original.total_amount.toFixed(2)}</div>,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <Badge>{row.original.status}</Badge>,
  },
];
