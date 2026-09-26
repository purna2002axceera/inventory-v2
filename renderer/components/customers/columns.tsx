'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { config } from '@/lib/config';
import type { Customer } from '@/lib/types';

export function getCustomerColumns(
  onEdit: (c: Customer) => void,
  onDelete: (c: Customer) => void,
  onViewCreditHistory: (c: Customer) => void
): ColumnDef<Customer>[] {
  const columns: ColumnDef<Customer>[] = [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'phone', header: 'Phone', cell: ({ row }) => row.original.phone || '—' },
    { accessorKey: 'address', header: 'Address', cell: ({ row }) => row.original.address || '—' },
  ];

  if (config.clientName === 'nethu') {
    columns.push({
      accessorKey: 'district',
      header: 'District',
      cell: ({ row }) => row.original.district || '—',
    });
  }

  columns.push(
    {
      accessorKey: 'sales_order_count',
      header: 'Sales Orders',
      cell: ({ row }) => (
        <span className={row.original.sales_order_count > 0 ? "font-bold" : "text-muted-foreground"}>
          {row.original.sales_order_count || 0}
        </span>
      )
    },
    {
      accessorKey: 'return_note_count',
      header: 'Return Notes',
      cell: ({ row }) => (
        <span className={row.original.return_note_count > 0 ? "font-bold text-red-500" : "text-muted-foreground"}>
          {row.original.return_note_count || 0}
        </span>
      )
    },
    {
      id: 'credit',
      header: 'Credit',
      cell: ({ row }) => {
        const c = row.original;
        const pct = c.credit_enabled && c.credit_limit > 0 ? Math.min(100, (c.credit_used / c.credit_limit) * 100) : 0;
        return (
          <div className="space-y-1 min-w-[130px]">
            {c.credit_enabled ? (
              <>
                <div className="text-xs tabular-nums">
                  Rs. {c.credit_used.toFixed(2)} / {c.credit_limit.toFixed(2)}
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
            {c.total_written_off > 0 && (
              <button
                type="button"
                onClick={() => onViewCreditHistory(c)}
                className="block text-xs text-destructive underline underline-offset-2"
              >
                ⚠ Rs. {c.total_written_off.toFixed(2)} defaulted
              </button>
            )}
          </div>
        );
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const canDelete = !row.original.sales_order_count && !row.original.return_note_count;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(row.original)}>Edit</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(row.original)}
                disabled={!canDelete}
                className={canDelete ? "text-red-600" : ""}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    }
  );

  return columns;
}
