import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Printer, ChevronDown } from 'lucide-react';
import { Product } from '@/types/pos';
import JsBarcode from 'jsbarcode';

interface Props {
  product: Product | null;
  onClose: () => void;
}

export function LabelPrintModal({ product, onClose }: Props) {
  const [selectedTierId, setSelectedTierId] = useState<string | 'base'>('base');
  const [copies, setCopies] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);

  const tier = product?.packagingTiers?.find((t) => t.id === selectedTierId);
  const barcode = (tier?.barcode ?? product?.barcode)?.trim() || product?.sku;
  const displayName = tier ? `${product!.name} (${tier.name})` : product?.name ?? '';
  const price = tier
    ? (tier.sellingPriceOverride ?? (product!.nomadBitePrice * Number(tier.quantityInBase)))
    : product?.nomadBitePrice ?? 0;

  useEffect(() => {
    if (!svgRef.current || !barcode) return;
    try {
      JsBarcode(svgRef.current, barcode, {
        format: 'CODE128',
        width: 2,
        height: 50,
        displayValue: true,
        fontSize: 11,
        margin: 4,
      });
    } catch {
      // invalid barcode value — clear SVG
      if (svgRef.current) svgRef.current.innerHTML = '';
    }
  }, [barcode, product]);

  const handlePrint = () => window.print();

  if (!product) return null;

  const tiers = product.packagingTiers ?? [];

  return (
    <>
      {/* Print-only area — hidden normally, shown only during print */}
      <div className="label-print-area" style={{ display: 'none' }}>
        {Array.from({ length: copies }).map((_, i) => (
          <div key={i} className="label-item">
            <svg id={`barcode-print-${i}`} />
            <p className="label-name">{displayName}</p>
            <p className="label-price">KES {Number(price).toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Print stylesheet injected dynamically */}
      <style>{`
        @media print {
          body > *:not(.label-print-area) { display: none !important; }
          .label-print-area { display: flex !important; flex-wrap: wrap; gap: 4mm; padding: 4mm; }
          .label-item { width: 58mm; border: 0.5px solid #ccc; padding: 2mm; display: flex; flex-direction: column; align-items: center; font-family: monospace; page-break-inside: avoid; }
          .label-item svg { width: 54mm; }
          .label-name { font-size: 8pt; font-weight: bold; text-align: center; margin: 1mm 0 0; word-break: break-word; }
          .label-price { font-size: 10pt; font-weight: 900; margin: 1mm 0 0; }
        }
      `}</style>

      {/* Need to also populate print SVGs when printing */}
      <PrintPopulator barcode={barcode ?? ''} copies={copies} displayName={displayName} price={Number(price)} />

      <Dialog open={!!product} onOpenChange={onClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-black">Print Barcode Label</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* Tier selector */}
            {tiers.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">Tier / Size</p>
                <div className="relative">
                  <select
                    value={selectedTierId}
                    onChange={(e) => setSelectedTierId(e.target.value)}
                    className="w-full rounded-xl border bg-card px-3 py-2 text-sm appearance-none pr-8"
                  >
                    <option value="base">Base unit — {product.unit}</option>
                    {tiers.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({t.quantityInBase} {product.unit})</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            )}

            {/* Label preview */}
            <div className="rounded-xl border bg-muted/30 p-4 flex flex-col items-center gap-2">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Preview (58mm label)</p>
              <div className="bg-white rounded border p-2 w-full flex flex-col items-center" style={{ maxWidth: 220 }}>
                {barcode ? (
                  <svg ref={svgRef} className="w-full" />
                ) : (
                  <p className="text-xs text-muted-foreground py-4">No barcode / SKU available</p>
                )}
                <p className="text-[11px] font-bold text-center mt-1 leading-tight">{displayName}</p>
                <p className="text-sm font-black mt-0.5">KES {Number(price).toLocaleString()}</p>
              </div>
            </div>

            {/* Copies */}
            <div className="flex items-center gap-3">
              <p className="text-sm font-semibold flex-1">Copies</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCopies((n) => Math.max(1, n - 1))}
                  className="h-7 w-7 rounded-lg border flex items-center justify-center font-bold text-sm hover:bg-muted"
                >−</button>
                <span className="w-8 text-center font-mono text-sm font-bold">{copies}</span>
                <button
                  onClick={() => setCopies((n) => Math.min(50, n + 1))}
                  className="h-7 w-7 rounded-lg border flex items-center justify-center font-bold text-sm hover:bg-muted"
                >+</button>
              </div>
            </div>

            <button
              onClick={handlePrint}
              className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              <Printer className="h-4 w-4" />
              Print {copies} Label{copies !== 1 ? 's' : ''}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Populates the hidden print-area SVGs before printing
function PrintPopulator({ barcode, copies, displayName, price }: { barcode: string; copies: number; displayName: string; price: number }) {
  useEffect(() => {
    const handler = () => {
      for (let i = 0; i < copies; i++) {
        const el = document.getElementById(`barcode-print-${i}`);
        if (el && barcode) {
          try {
            JsBarcode(el as unknown as SVGElement, barcode, { format: 'CODE128', width: 2, height: 50, displayValue: true, fontSize: 11, margin: 4 });
          } catch { /* skip invalid */ }
        }
      }
    };
    window.addEventListener('beforeprint', handler);
    return () => window.removeEventListener('beforeprint', handler);
  }, [barcode, copies, displayName, price]);

  return null;
}
