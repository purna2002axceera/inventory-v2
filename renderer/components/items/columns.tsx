'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, ArrowUpDown } from 'lucide-react';
import type { Item } from '@/lib/types';

type ColumnActions = {
  onEdit: (item: Item) => void;
  onArchive: (item: Item) => void;
};

export function getColumns({ onEdit, onArchive }: ColumnActions): ColumnDef<Item>[] {
  return [
    {
      accessorKey: 'sku',
      header: 'SKU',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.sku}</span>,
    },
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="-ml-3"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Name
          <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      ),
    },
    { accessorKey: 'bike_model', header: 'Bike Model' },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.type}</Badge>
      ),
    },
    {
      accessorKey: 'stock_count',
      header: () => <div className="text-right">Stock</div>,
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="text-right tabular-nums">
            {item.isLowStock ? (
              <Badge variant="destructive" className="tabular-nums">
                {item.stock_count} low
              </Badge>
            ) : (
              item.stock_count
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'unit_cost',
      header: () => <div className="text-right">Cost</div>,
      cell: ({ row }) => (
        <div className="text-right tabular-nums">
          Rs. {row.original.unit_cost.toFixed(2)}
        </div>
      ),
    },
    {
      accessorKey: 'unit_price',
      header: () => <div className="text-right">Price</div>,
      cell: ({ row }) => (
        <div className="text-right tabular-nums font-medium">
          Rs. {row.original.unit_price.toFixed(2)}
        </div>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Created Date',
      cell: ({ row }) => {
        const date = new Date(row.original.created_at);
        return <span className="text-muted-foreground">{date.toLocaleDateString()}</span>;
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const item = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(item)}>Edit</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onArchive(item)}
                className="text-destructive focus:text-destructive"
              >
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
