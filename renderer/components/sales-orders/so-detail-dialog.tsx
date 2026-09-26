'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
import { Printer, Send } from 'lucide-react';
import { callIpc, IpcError } from '@/lib/ipc-client';
import { config } from '@/lib/config';
import type { SalesOrder, CreditPayment } from '@/lib/types';
import { RecordPaymentDialog } from './record-payment-dialog';

type SoDetail = SalesOrder & {
  customer_phone: string | null;
  items: { soi_id: number; item_name: string; item_sku: string; item_id: number; quantity: number; unit_price: number; batch_ref: string }[];
  creditPayments?: CreditPayment[];
  outstanding?: number;
  refundDue?: number;
};

type ReturnedMap = Map<number, number>;

export function SoDetailDialog({ soId, onOpenChange }: { soId: number | null; onOpenChange: (open: boolean) => void }) {
  const [detail, setDetail] = useState<SoDetail | null>(null);
  const [returnedMap, setReturnedMap] = useState<ReturnedMap>(new Map());
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Sales_Order_${detail?.so_number || 'Receipt'}`,
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [writeOffNote, setWriteOffNote] = useState('');
  const [acting, setActing] = useState(false);

  function loadDetail() {
    if (!soId) return;
    callIpc(window.electronAPI.salesOrders.get(soId)).then((d) => {
      setDetail(d as SoDetail);
      callIpc(window.electronAPI.returns.getReturnableItems((d as SoDetail).so_number))
        .then((result) => {
          const map = new Map<number, number>();
          for (const item of result.items) {
            map.set(item.itemId, item.alreadyReturned);
          }
          setReturnedMap(map);
        })
        .catch(() => setReturnedMap(new Map()));
    });
  }

  async function handleWriteOff() {
    if (!detail) return;
    setActing(true);
    try {
      await callIpc(window.electronAPI.salesOrders.writeOffCredit({ soId: detail.so_id, note: writeOffNote || undefined }));
      toast.success('Credit sale written off as bad debt');
      setWriteOffOpen(false);
      setWriteOffNote('');
      loadDetail();
    } catch (err) {
      toast.error(err instanceof IpcError ? err.message : 'Failed to write off credit sale.');
    } finally {
      setActing(false);
    }
  }

  const handleWhatsApp = async () => {
    if (!detail) return;
    setIsGenerating(true);
    try {
      const safeName = (detail.customer_name || 'Customer').replace(/[^a-zA-Z0-9]/g, '_');
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
      const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(/:/g, '-');
      const filename = `${safeName}_${dateStr}_${timeStr}.pdf`;

      const total = aggregatedItems.reduce((sum, l) => sum + l.quantity * l.unit_price, 0);

      const receiptData = {
        soNumber: detail.so_number,
        customerName: detail.customer_name,
        customerPhone: detail.customer_phone,
        orderDate: detail.order_date,
        logoPath: config.logos.print,
        businessDetails: config.businessDetails,
        items: aggregatedItems.map((line) => ({
          name: line.item_name,
          sku: line.item_sku,
          quantity: line.quantity,
          unitPrice: line.unit_price,
          returned: line.returned,
        })),
        total,
      };

      // Rendered natively via Electron's printToPDF (same pipeline as "Print / PDF")
      // rather than html2canvas, which cannot resolve the app's CSS custom properties
      // and produced near-invisible text in the exported PDF.
      const genResult = await window.electronAPI.system.generateReceiptPdf({
        receiptData,
        filename,
      });

      if (!genResult.success) {
        toast.error('Failed to save PDF: ' + genResult.error);
        return;
      }

      toast.success(`PDF saved to Desktop!`);

      // Open WhatsApp
      let phone = detail.customer_phone || '';
      if (phone.startsWith('0')) {
        phone = '94' + phone.substring(1);
      }
      phone = phone.replace(/[^0-9]/g, '');

      const message = `Hello ${detail.customer_name}, here is the receipt for your order ${detail.so_number}.`;
      const whatsappUrl = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`;
      
      await window.electronAPI.system.openExternal(whatsappUrl);
    } catch (err: any) {
      toast.error('Something went wrong: ' + err.message);
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (soId) {
      loadDetail();
    } else {
      setDetail(null);
      setReturnedMap(new Map());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soId]);

  // Aggregate items by SKU to hide batch splits from the UI
  const aggregatedItems = useMemo(() => {
    if (!detail?.items) return [];
    
    const map = new Map<string, typeof detail.items[0] & { returned: number }>();
    
    for (const item of detail.items) {
      const existing = map.get(item.item_sku);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        map.set(item.item_sku, { ...item, returned: returnedMap.get(item.item_id) || 0 });
      }
    }
    
    return Array.from(map.values());
  }, [detail?.items, returnedMap]);

  return (
    <Dialog open={!!soId} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>
            {detail?.so_number ?? 'Loading...'}
            {detail?.status === 'CANCELLED' && (
              <Badge variant="destructive" className="ml-2">Cancelled</Badge>
            )}
            {detail?.payment_type === 'CREDIT' && (
              <Badge
                variant={detail.credit_status === 'PAID' ? 'default' : detail.credit_status === 'WRITTEN_OFF' ? 'destructive' : 'outline'}
                className="ml-2"
              >
                Credit — {detail.credit_status === 'PENDING_PAYMENT' ? 'Pending Payment' : detail.credit_status === 'PAID' ? 'Paid' : 'Written Off'}
              </Badge>
            )}
          </DialogTitle>
          {detail && (
            <div className="flex items-center gap-2 mr-6 no-print">
              <Button variant="outline" size="sm" onClick={() => handlePrint()}>
                <Printer className="mr-2 h-4 w-4" />
                Print / PDF
              </Button>
              <Button 
                size="sm" 
                onClick={handleWhatsApp} 
                disabled={isGenerating}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Send className="mr-2 h-4 w-4" />
                {isGenerating ? 'Generating...' : 'Send to WhatsApp'}
              </Button>
            </div>
          )}
        </DialogHeader>
        {detail && (
          <div className="space-y-4 print:p-0" ref={printRef}>
            {/* ─── Screen-only flat layout (unchanged) ─── */}
            <div className="print:hidden">
              <div className="text-sm text-muted-foreground">
                {detail.customer_name} {detail.customer_phone && `• ${detail.customer_phone}`} • {detail.order_date}
              </div>
              <div className="overflow-x-auto w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aggregatedItems.map((line) => (
                      <TableRow key={line.item_sku}>
                        <TableCell className="min-w-[200px]">
                          {line.item_name} <span className="text-xs text-muted-foreground font-mono">{line.item_sku}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {line.quantity}
                          {line.returned > 0 && (
                            <span className="text-xs text-destructive ml-1">({line.returned} returned)</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">Rs. {line.unit_price.toFixed(2)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          Rs. {(line.quantity * line.unit_price).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="text-right font-semibold">
                Total: Rs. {aggregatedItems.reduce((sum, l) => sum + l.quantity * l.unit_price, 0).toFixed(2)}
              </div>

              {detail.payment_type === 'CREDIT' && (
                <div className="mt-4 rounded-md border p-3 space-y-3">
                  {detail.credit_status === 'WRITTEN_OFF' ? (
                    <div className="text-sm">
                      <span className="text-destructive font-medium">
                        Written off Rs. {(detail.written_off_amount ?? 0).toFixed(2)}
                      </span>{' '}
                      on {detail.written_off_at}
                      {detail.written_off_note && (
                        <p className="text-muted-foreground mt-1">{detail.written_off_note}</p>
                      )}
                    </div>
                  ) : (
                    <>
                      {(detail.refundDue ?? 0) > 0 && (
                        <div className="text-sm bg-emerald-500/10 text-emerald-600 rounded-md p-2">
                          Customer overpaid relative to the order's current value (after a return) —{' '}
                          <span className="font-semibold">refund Rs. {(detail.refundDue ?? 0).toFixed(2)} in cash</span>.
                        </div>
                      )}
                      <div className="flex items-center justify-between text-sm">
                        <span>
                          Due {detail.credit_due_date} • Outstanding: <span className="font-semibold">Rs. {(detail.outstanding ?? 0).toFixed(2)}</span>
                        </span>
                        {detail.credit_status === 'PENDING_PAYMENT' && (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => setPaymentDialogOpen(true)}>
                              Record Payment
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => setWriteOffOpen(true)}>
                              Write off as bad debt
                            </Button>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {detail.creditPayments && detail.creditPayments.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">Payment history</div>
                      {detail.creditPayments.map((p) => (
                        <div key={p.payment_id} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {p.payment_date}{p.note && ` — ${p.note}`}
                          </span>
                          <span className="font-medium tabular-nums">Rs. {p.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ─── Print-only paginated layout (16 items per page) ─── */}
            {(() => {
              const ITEMS_PER_PAGE = 16;
              const pages: typeof aggregatedItems[] = [];
              for (let i = 0; i < aggregatedItems.length; i += ITEMS_PER_PAGE) {
                pages.push(aggregatedItems.slice(i, i + ITEMS_PER_PAGE));
              }
              if (pages.length === 0) pages.push([]);
              const totalPages = pages.length;

              return pages.map((pageItems, pageIndex) => (
                <div
                  key={pageIndex}
                  className="hidden print:block receipt-page"
                  style={pageIndex < totalPages - 1 ? { pageBreakAfter: 'always' } : undefined}
                >
                  {/* Business header */}
                  <div className="mb-6 border-b pb-4">
                    <div className="flex items-center justify-center gap-8 mb-3">
                      <img src={config.logos.print} alt="Logo" className="h-44 w-44 object-contain shrink-0" />
                      {config.businessDetails && (
                        <div className="text-xs text-black leading-relaxed">
                          <div className="font-bold text-2xl mb-1">{config.businessDetails.name}</div>
                          <div>{config.businessDetails.address}</div>
                          {config.businessDetails.phones.length > 0 && <div>Tel: {config.businessDetails.phones.join(' / ')}</div>}
                          <div>{config.businessDetails.email}</div>
                          {config.businessDetails.regNo && <div>Reg No. {config.businessDetails.regNo}</div>}
                        </div>
                      )}
                    </div>
                    <h2 className="text-xl font-bold uppercase tracking-wider text-center">Sales Order Receipt</h2>
                  </div>

                  {/* Customer info */}
                  <div className="text-sm text-black font-medium mb-2">
                    {detail.customer_name} {detail.customer_phone && `• ${detail.customer_phone}`} • {detail.order_date}
                    {totalPages > 1 && (
                      <span className="float-right text-xs text-gray-500">Page {pageIndex + 1} of {totalPages}</span>
                    )}
                  </div>

                  {/* Items table */}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageItems.map((line) => (
                        <TableRow key={line.item_sku}>
                          <TableCell className="min-w-[200px]">
                            {line.item_name} <span className="text-xs font-mono text-gray-500">{line.item_sku}</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {line.quantity}
                            {line.returned > 0 && (
                              <span className="text-xs text-red-600 ml-1">({line.returned} returned)</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">Rs. {line.unit_price.toFixed(2)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            Rs. {(line.quantity * line.unit_price).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Total only on the last page */}
                  {pageIndex === totalPages - 1 && (
                    <div className="text-right font-semibold mt-4">
                      Total: Rs. {aggregatedItems.reduce((sum, l) => sum + l.quantity * l.unit_price, 0).toFixed(2)}
                    </div>
                  )}
                </div>
              ));
            })()}

            {/* Branding footer – fixed to bottom of every page via CSS */}
            <div className="receipt-page-footer">
              Developed by CA Software Solutions 0770301793
            </div>
          </div>
        )}
      </DialogContent>

      {detail && (
        <RecordPaymentDialog
          soId={detail.so_id}
          outstanding={detail.outstanding ?? 0}
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          onSaved={loadDetail}
        />
      )}

      <AlertDialog open={writeOffOpen} onOpenChange={(o) => { if (!o) { setWriteOffOpen(false); setWriteOffNote(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Write off as bad debt?</AlertDialogTitle>
            <AlertDialogDescription>
              This forgives the remaining Rs. {(detail?.outstanding ?? 0).toFixed(2)} owed on this credit sale and registers
              it as a real loss in the profit report. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Reason (optional)"
            rows={2}
            value={writeOffNote}
            onChange={(e) => setWriteOffNote(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleWriteOff} disabled={acting} className="bg-red-600 hover:bg-red-700">
              {acting ? 'Writing off...' : 'Write off'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
