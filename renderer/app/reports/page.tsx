'use client';

import * as React from 'react';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { AppShell } from '@/components/app-shell';
import { RequireAuth } from '@/components/require-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { callIpc, IpcError } from '@/lib/ipc-client';

function ReportsPageContent() {
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);
  const [activeTab, setActiveTab] = React.useState<'stocks' | 'grns' | 'returns'>('stocks');
  
  const [loading, setLoading] = React.useState(false);
  const [stocksData, setStocksData] = React.useState<any[]>([]);
  const [grnsData, setGrnsData] = React.useState<any[]>([]);
  const [returnsData, setReturnsData] = React.useState<any[]>([]);

  const fetchReport = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        startDate: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
        endDate: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
        pageSize: 500,
      };

      if (activeTab === 'stocks') {
        const result = await callIpc(window.electronAPI.reports.getStocks(params));
        setStocksData(result.items);
      } else if (activeTab === 'grns') {
        const result = await callIpc(window.electronAPI.reports.getGRNs(params));
        setGrnsData(result.receipts);
      } else if (activeTab === 'returns') {
        const result = await callIpc(window.electronAPI.reports.getReturns(params));
        setReturnsData(result.returns);
      }
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Failed to load report.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, dateRange]);

  React.useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground mt-2">Generate meaningful reports for inventory movements, receipts, and returns.</p>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-card border rounded-lg p-4 shadow-sm">
        <div className="flex gap-2">
          <Button 
            variant={activeTab === 'stocks' ? 'default' : 'outline'} 
            onClick={() => setActiveTab('stocks')}
          >
            Item Stocks
          </Button>
          <Button 
            variant={activeTab === 'grns' ? 'default' : 'outline'} 
            onClick={() => setActiveTab('grns')}
          >
            Goods Receipts (GRN)
          </Button>
          <Button 
            variant={activeTab === 'returns' ? 'default' : 'outline'} 
            onClick={() => setActiveTab('returns')}
          >
            Return Notes
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          <DatePickerWithRange date={dateRange} setDate={setDateRange} />
          <Button variant="outline" onClick={async () => {
            const data = activeTab === 'stocks' ? stocksData : activeTab === 'grns' ? grnsData : returnsData;
            try {
              const res = await window.electronAPI.system.printToPDF({
                type: activeTab,
                dateFrom: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
                dateTo: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
                data
              });
              if (res.success) toast.success(`Saved to ${res.filePath}`);
              else if (res.error) toast.error(res.error);
            } catch (e: any) {
              toast.error(e.message || 'Failed to save PDF');
            }
          }} title="Save as PDF">
            <Printer className="h-4 w-4 mr-2" />
            Save as PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {activeTab === 'stocks' && 'Item Stocks Ledger'}
            {activeTab === 'grns' && 'Goods Receipts (GRN)'}
            {activeTab === 'returns' && 'Return Notes'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {activeTab === 'stocks' && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Stock In (Period)</TableHead>
                      <TableHead className="text-right">Stock Out (Period)</TableHead>
                      <TableHead className="text-right font-bold text-primary">Current Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stocksData.map(item => (
                      <TableRow key={item.item_id}>
                        <TableCell className="font-medium">{item.sku}</TableCell>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>{item.bike_model}</TableCell>
                        <TableCell className="text-right text-green-600 font-medium">+{item.stock_in}</TableCell>
                        <TableCell className="text-right text-red-600 font-medium">-{item.stock_out}</TableCell>
                        <TableCell className="text-right font-bold text-primary">{item.stock_count}</TableCell>
                      </TableRow>
                    ))}
                    {stocksData.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No data found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}

              {activeTab === 'grns' && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>GRN No.</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead className="text-right">Qty Received</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grnsData.map(grn => (
                      <TableRow key={grn.grn_id}>
                        <TableCell>{grn.received_date}</TableCell>
                        <TableCell className="font-medium text-primary">{grn.grn_number}</TableCell>
                        <TableCell>
                          <div className="font-medium">{grn.item_name}</div>
                          <div className="text-xs text-muted-foreground">{grn.sku}</div>
                        </TableCell>
                        <TableCell>{grn.batch_ref}</TableCell>
                        <TableCell className="text-right font-bold text-green-600">+{grn.quantity}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{grn.notes || '-'}</TableCell>
                      </TableRow>
                    ))}
                    {grnsData.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No Goods Receipts found for the selected period.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}

              {activeTab === 'returns' && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Return No.</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Related Order</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Items Returned</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returnsData.map(rn => (
                      <TableRow key={rn.return_id}>
                        <TableCell>{rn.return_date}</TableCell>
                        <TableCell className="font-medium text-primary">{rn.return_number}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            rn.type === 'CUSTOMER' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                          }`}>
                            {rn.type}
                          </span>
                        </TableCell>
                        <TableCell>{rn.so_number || 'N/A'}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            rn.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                            rn.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {rn.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <ul className="list-disc list-inside text-sm text-muted-foreground">
                            {rn.items?.map((i: any) => (
                              <li key={i.rni_id}>
                                <span className="font-medium text-foreground">{i.name}</span> x{i.quantity} ({i.condition}{i.condition === 'DAMAGED' ? `, ${i.resolution === 'EXCHANGE' ? 'exchanged' : 'refunded'}` : ''})
                              </li>
                            ))}
                          </ul>
                        </TableCell>
                      </TableRow>
                    ))}
                    {returnsData.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No Return Notes found for the selected period.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <ReportsPageContent />
      </AppShell>
    </RequireAuth>
  );
}
