'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { ReturnNote } from '@/lib/types';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'outline',
  APPROVED: 'default',
  REJECTED: 'destructive',
};

const TYPE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  INTERNAL: 'secondary',
  CUSTOMER: 'default',
};

export function ReturnsTable({
  data,
  onRowClick,
}: {
  data: ReturnNote[];
  onRowClick: (r: ReturnNote) => void;
}) {
  return (
    <div className="border rounded-md overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Return #</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>SO #</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Items</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                No return notes found.
              </TableCell>
            </TableRow>
          ) : (
            data.map((r) => (
              <TableRow
                key={r.return_id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onRowClick(r)}
              >
                <TableCell className="font-mono text-sm">{r.return_number}</TableCell>
                <TableCell>
                  <Badge variant={TYPE_VARIANT[r.type] || 'outline'}>
                    {r.type === 'INTERNAL' ? 'Internal' : 'Customer'}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {r.so_number || '—'}
                </TableCell>
                <TableCell>{r.return_date}</TableCell>
                <TableCell className="text-right tabular-nums">{r.total_items}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[r.status] || 'outline'}>{r.status}</Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
