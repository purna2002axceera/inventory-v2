'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Printer } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { callIpc, IpcError } from '@/lib/ipc-client';
import type { SalesReportResult, DetailedSalesReportResult } from '@/lib/types';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const reportSchema = z.object({
  reportType: z.enum(['summary', 'detailed']),
  dateFrom: z.string().min(1, 'Start date is required'),
  dateTo: z.string().min(1, 'End date is required'),
});

type ReportFormValues = z.infer<typeof reportSchema>;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonthIso() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export function SalesReportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [report, setReport] = useState<SalesReportResult | DetailedSalesReportResult | null>(null);

  const form = useForm<ReportFormValues>({
    resolver: zodResolver(reportSchema) as any,
    defaultValues: {
      reportType: 'summary',
      dateFrom: startOfMonthIso(),
      dateTo: todayIso(),
    },
  });

  async function onSubmit(values: ReportFormValues) {
    try {
      const data = await callIpc(window.electronAPI.salesOrders.report({
        reportType: values.reportType,
        dateFrom: values.dateFrom,
        dateTo: values.dateTo,
      }));
      setReport(data);
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Failed to generate report.');
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      onOpenChange(isOpen);
      if (!isOpen) {
        setReport(null);
        form.reset({
          reportType: 'summary',
          dateFrom: startOfMonthIso(),
          dateTo: todayIso(),
        });
      }
    }}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto print:max-w-none print:w-full print:h-full print:m-0 print:p-0 print:border-none print:shadow-none print:overflow-visible flex flex-col">
        <DialogHeader className="print:hidden">
          <DialogTitle>Sales Report</DialogTitle>
        </DialogHeader>

        {!report ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 print:hidden">
              <FormField
                control={form.control}
                name="reportType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Report Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select report type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="summary">Sales & Profitability Summary</SelectItem>
                        <SelectItem value="detailed">Detailed Sales Orders</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="dateFrom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>From Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dateTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>To Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Generating...' : 'Generate Report'}
              </Button>
            </form>
          </Form>
        ) : (
          <div className="space-y-6 flex-1 print:p-8">
            <div className="flex justify-between items-start print:hidden">
              <h2 className="text-xl font-bold">Report Results</h2>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setReport(null)}>
                  Back
                </Button>
                <Button variant="outline" onClick={async () => {
                  if (!report) return;
                  try {
                    const res = await window.electronAPI.system.printToPDF(report);
                    if (res.success) toast.success(`Saved to ${res.filePath}`);
                    else if (res.error) toast.error(res.error);
                  } catch (e: any) {
                    toast.error(e.message || 'Failed to save PDF');
                  }
                }}>
                  <Printer className="h-4 w-4 mr-2" />
                  Save as PDF
                </Button>
                <Button onClick={handlePrint}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
              </div>
            </div>

            {/* Print Header */}
            <div className="hidden print:block mb-8 text-center border-b pb-4">
              <h1 className="text-3xl font-bold">
                {report.type === 'summary' ? 'Sales & Profitability Report' : 'Detailed Sales Orders Report'}
              </h1>
              <p className="text-muted-foreground mt-2 text-lg">
                For the period: {report.dateFrom} to {report.dateTo}
              </p>
            </div>

            {report.type === 'summary' ? (
              <>
                <div className="overflow-x-auto border rounded-md print:border-none print:overflow-visible">
                  <Table className="print:text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item / SKU</TableHead>
                        <TableHead className="text-right">Qty Sold</TableHead>
                        <TableHead className="text-right">Unit Cost (Latest)</TableHead>
                        <TableHead className="text-right">Total Revenue</TableHead>
                        <TableHead className="text-right">Total Cost</TableHead>
                        <TableHead className="text-right text-destructive">Damaged Loss</TableHead>
                        <TableHead className="text-right">Profit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.items.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            No sales found in this period.
                          </TableCell>
                        </TableRow>
                      ) : (
                        report.items.map((item) => (
                          <TableRow key={item.itemId}>
                            <TableCell>
                              <div className="font-medium">{item.name}</div>
                              <div className="text-xs text-muted-foreground font-mono">{item.sku}</div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{item.quantitySold}</TableCell>
                            <TableCell className="text-right tabular-nums">Rs. {item.latestUnitCost.toFixed(2)}</TableCell>
                            <TableCell className="text-right tabular-nums">Rs. {item.totalRevenue.toFixed(2)}</TableCell>
                            <TableCell className="text-right tabular-nums">Rs. {item.totalCost.toFixed(2)}</TableCell>
                            <TableCell className="text-right tabular-nums text-destructive">Rs. {item.damagedLoss.toFixed(2)}</TableCell>
                            <TableCell className={`text-right tabular-nums font-medium ${item.profit < 0 ? 'text-destructive' : 'text-emerald-600 print:text-black'}`}>
                              Rs. {item.profit.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-6">
                  <div className="p-4 border rounded-lg bg-muted/50 print:bg-transparent print:border-2">
                    <div className="text-sm text-muted-foreground mb-1">Total Sales Revenue</div>
                    <div className="text-2xl font-bold tabular-nums">Rs. {report.totalSales.toFixed(2)}</div>
                  </div>
                  <div className="p-4 border rounded-lg bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900 print:bg-transparent print:border-2 print:border-gray-200">
                    <div className="text-sm text-red-600 dark:text-red-400 mb-1">Total Damaged Loss</div>
                    <div className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">Rs. {report.totalDamagedLoss.toFixed(2)}</div>
                  </div>
                  <div className="p-4 border rounded-lg bg-muted/50 print:bg-transparent print:border-2">
                    <div className="text-sm text-muted-foreground mb-1">Total Profit</div>
                    <div className={`text-2xl font-bold tabular-nums ${report.totalProfit < 0 ? 'text-destructive' : 'text-emerald-600 print:text-black'}`}>
                      Rs. {report.totalProfit.toFixed(2)}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-6">
                  {(report as DetailedSalesReportResult).orders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border rounded-md">
                      No sales orders found in this period.
                    </div>
                  ) : (
                    (report as DetailedSalesReportResult).orders.map((o) => (
                      <div key={o.soNumber} className="border rounded-md p-4 print:border-b print:rounded-none print:p-2 print:mb-4">
                        <div className="flex justify-between items-start mb-3 pb-2 border-b">
                          <div>
                            <div className="font-bold text-lg">{o.soNumber}</div>
                            <div className="text-sm text-muted-foreground">{new Date(o.orderDate).toLocaleDateString()}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium">{o.customerName}</div>
                            <div className={`text-xs font-bold ${o.status === 'CANCELLED' ? 'text-destructive' : 'text-emerald-600'}`}>
                              {o.status}
                            </div>
                          </div>
                        </div>
                        <Table className="print:text-sm">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Item</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                              <TableHead className="text-right">Unit Price</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {o.lines.map((l, i) => (
                              <TableRow key={i}>
                                <TableCell>
                                  <div className="font-medium">{l.itemName}</div>
                                  <div className="text-xs text-muted-foreground font-mono">{l.itemSku}</div>
                                </TableCell>
                                <TableCell className="text-right">{l.quantity}</TableCell>
                                <TableCell className="text-right tabular-nums">Rs. {l.unitPrice.toFixed(2)}</TableCell>
                                <TableCell className="text-right tabular-nums">Rs. {l.totalPrice.toFixed(2)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <div className="text-right mt-3 font-bold text-lg border-t pt-2">
                          Order Total: Rs. {o.totalAmount.toFixed(2)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-6 p-4 border rounded-lg bg-muted/50 print:bg-transparent print:border-2 text-right">
                  <div className="text-sm text-muted-foreground mb-1">Total Revenue (Completed Orders)</div>
                  <div className="text-3xl font-bold tabular-nums">Rs. {(report as DetailedSalesReportResult).totalRevenue.toFixed(2)}</div>
                </div>
              </>
            )}

            <div className="hidden print:block mt-16 text-sm text-muted-foreground text-center">
              Generated on {new Date().toLocaleString()}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
