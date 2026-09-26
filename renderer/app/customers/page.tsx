'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X } from 'lucide-react';

import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { CustomersTable } from '@/components/customers/customers-table';
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog';
import { CreditHistoryDialog } from '@/components/customers/credit-history-dialog';
import { useDebounce } from '@/hooks/use-debounce';
import { callIpc, IpcError } from '@/lib/ipc-client';
import { config } from '@/lib/config';
import { SRI_LANKA_DISTRICTS, type Customer } from '@/lib/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const PAGE_SIZE = 10;

function CustomersPageContent() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('ALL');
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [historyCustomerId, setHistoryCustomerId] = useState<number | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const payload = {
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch || undefined,
        district: (config.clientName === 'nethu' && selectedDistrict !== 'ALL') ? selectedDistrict : undefined,
      };
      console.log('FRONTEND -> Sending customers:list request with payload:', payload);
      const result = await callIpc(window.electronAPI.customers.list(payload));
      console.log('FRONTEND <- Received customers:list response:', result);
      setCustomers(result.customers);
      setTotal(result.total);
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Failed to load customers.');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, selectedDistrict]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, selectedDistrict]);

  function openCreateDialog() {
    setEditingCustomer(null);
    setFormOpen(true);
  }

  function openEditDialog(customer: Customer) {
    setEditingCustomer(customer);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    toast.promise(
      callIpc(window.electronAPI.customers.delete(deleteTarget.customer_id)),
      {
        loading: 'Deleting customer...',
        success: () => {
          setDeleteTarget(null);
          loadCustomers();
          return 'Customer deleted successfully';
        },
        error: (err) => {
          setDeleteTarget(null);
          return err instanceof IpcError ? err.message : 'Failed to delete customer';
        }
      }
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customers</h1>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-1" />
          New Customer
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Search by name, phone, or address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {config.clientName === 'nethu' && (
          <Select
            value={selectedDistrict}
            onValueChange={(val) => {
              setSelectedDistrict(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Districts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Districts</SelectItem>
              {SRI_LANKA_DISTRICTS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {(search || (config.clientName === 'nethu' && selectedDistrict !== 'ALL')) && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearch('');
              setSelectedDistrict('ALL');
              setPage(1);
            }}
            className="px-2"
          >
            <X className="h-4 w-4 mr-1" />
            Reset
          </Button>
        )}
      </div>

      <CustomersTable
        data={customers}
        onEdit={openEditDialog}
        onDelete={(customer) => setDeleteTarget(customer)}
        onViewCreditHistory={(customer) => setHistoryCustomerId(customer.customer_id)}
      />

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{loading ? 'Loading...' : `${total} customer${total === 1 ? '' : 's'} total`}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      <CustomerFormDialog open={formOpen} onOpenChange={setFormOpen} editingCustomer={editingCustomer} onSaved={loadCustomers} />
      <CreditHistoryDialog customerId={historyCustomerId} onOpenChange={(open) => !open && setHistoryCustomerId(null)} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this customer?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete "{deleteTarget?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function CustomersPage() {
  return (
    <RequireAuth>
      <AppShell>
        <CustomersPageContent />
      </AppShell>
    </RequireAuth>
  );
}
