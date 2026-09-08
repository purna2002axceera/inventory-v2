'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import html2pdf from 'html2pdf.js';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Printer, Send } from 'lucide-react';
import { callIpc } from '@/lib/ipc-client';
import { config } from '@/lib/config';
import type { SalesOrder } from '@/lib/types';

type SoDetail = SalesOrder & {
  customer_phone: string | null;
  items: { soi_id: number; item_name: string; item_sku: string; item_id: number; quantity: number; unit_price: number; batch_ref: string }[];
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

  const handleWhatsApp = async () => {
    if (!detail) return;
    setIsGenerating(true);
    try {
      const element = printRef.current;
      if (!element) return;

      const safeName = (detail.customer_name || 'Customer').replace(/[^a-zA-Z0-9]/g, '_');
      const safePhone = (detail.customer_phone || '').replace(/[^a-zA-Z0-9]/g, '');
      const filename = `${detail.so_number}_${safeName}_${safePhone}.pdf`;

      // Generate PDF as base64
      const opt = {
        margin:       10,
        filename:     filename,
        image:        { type: 'jpeg' as const, quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
      };

      const pdfBase64 = await html2pdf().set(opt).from(element).outputPdf('datauristring');
      const base64Data = pdfBase64.split('base64,')[1];

      const saveResult = await window.electronAPI.system.saveReceiptPdf({
        base64Data,
        filename
      });

      if (!saveResult.success) {
        toast.error('Failed to save PDF: ' + saveResult.error);
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
      callIpc(window.electronAPI.salesOrders.get(soId)).then((d) => {
        setDetail(d as SoDetail);
        // Fetch approved return quantities for this SO using the so_number
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
    } else {
      setDetail(null);
      setReturnedMap(new Map());
    }
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
          <div className="space-y-4 print:p-8" ref={printRef}>
            <div className="hidden print:block text-center mb-6 border-b pb-4">
              <img src={config.logos.print} alt="Logo" className="h-16 mx-auto mb-2 object-contain" />
              <h2 className="text-xl font-bold uppercase tracking-wider">Sales Order Receipt</h2>
            </div>
            <div className="text-sm text-muted-foreground print:text-black print:font-medium">
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
