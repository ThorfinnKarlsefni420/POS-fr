import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useImportProducts, useProducts } from '@/hooks/use-products';
import { useSettingsStore } from '@/features/admin/store/use-settings-store';
import { parseSpreadsheet, ParseResult } from '@/lib/file-parser';
import { Product } from '@/types/pos';
import { Upload, AlertTriangle, CheckCircle, Download } from 'lucide-react';

interface Props { open: boolean; onClose: () => void; }
type Step = 'upload' | 'preview' | 'done';
type ImportStatus = 'new' | 'price-change' | 'updated' | 'unchanged';
interface Tagged extends Product {
  _status: ImportStatus;
  _oldCostPrice?: number;
  _oldSellingPrice?: number;
}

function crossCheck(parsed: Product[], existing: Product[]): Tagged[] {
  const bySku = new Map(existing.map((p) => [p.sku.toLowerCase(), p]));
  const byName = new Map(existing.map((p) => [p.name.toLowerCase().trim(), p]));

  return parsed.map((p) => {
    const match =
      bySku.get(p.sku.toLowerCase()) ??
      byName.get(p.name.toLowerCase().trim());

    if (!match) return { ...p, _status: 'new' };

    const priceChanged =
      match.costPrice !== p.costPrice || match.sellingPrice !== p.sellingPrice;
    if (priceChanged) {
      return {
        ...p,
        _status: 'price-change',
        _oldCostPrice: match.costPrice,
        _oldSellingPrice: match.sellingPrice,
      };
    }

    const otherChanged =
      match.name.toLowerCase() !== p.name.toLowerCase() ||
      match.category !== p.category ||
      match.unit !== p.unit;
    return { ...p, _status: otherChanged ? 'updated' : 'unchanged' };
  });
}

const STATUS_BADGE: Record<ImportStatus, { label: string; style: React.CSSProperties }> = {
  new:           { label: 'New',          style: { background: 'oklch(0.5 0.15 145 / 0.15)', color: 'oklch(0.4 0.12 145)' } },
  'price-change':{ label: 'Price Change', style: { background: 'oklch(0.7 0.18 70 / 0.15)',  color: 'oklch(0.45 0.15 70)' } },
  updated:       { label: 'Updated',      style: { background: 'oklch(0.6 0.18 230 / 0.15)', color: 'oklch(0.4 0.15 230)' } },
  unchanged:     { label: 'No Change',    style: { background: 'oklch(0.5 0 0 / 0.08)',       color: 'oklch(0.5 0 0)' } },
};

const ROW_HIGHLIGHT: Record<ImportStatus, string> = {
  new:           'bg-green-50/40',
  'price-change':'bg-amber-50/40',
  updated:       'bg-blue-50/40',
  unchanged:     '',
};

export function CsvUploadDialog({ open, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [loading, setLoading] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [tagged, setTagged] = useState<Tagged[]>([]);
  const [replaceAll, setReplaceAll] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const importProducts = useImportProducts();
  const serviceFeePercent = useSettingsStore((s) => s.serviceFeePercent);
  const { data: existingProducts = [] } = useProducts();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const result = await parseSpreadsheet(file, serviceFeePercent);
    setParseResult(result);
    setTagged(crossCheck(result.products, existingProducts));
    setStep('preview');
    setLoading(false);
  };

  const handleImport = async () => {
    if (!parseResult) return;
    setImportError(null);
    const toSend = replaceAll
      ? parseResult.products
      : tagged.filter((p) => p._status !== 'unchanged').map(({ _status, _oldCostPrice, _oldSellingPrice, ...p }) => p as Product);
    console.log(`[IMPORT DEBUG] Sending ${toSend.length} products (replaceAll=${replaceAll}). Breakdown: new=${counts.new} priceChange=${counts['price-change']} updated=${counts.updated} unchanged=${counts.unchanged}`);
    if (toSend.length > 0) {
      const s = toSend[0];
      console.log(`[IMPORT DEBUG] Sample product: name="${s.name}" sku="${s.sku}" costPrice=${s.costPrice} sellingPrice=${s.sellingPrice} nomadBitePrice=${s.nomadBitePrice} tiers=${s.packagingTiers?.length ?? 0}`);
    }
    try {
      const result = await importProducts.mutateAsync({ products: toSend, replace: replaceAll });
      console.log(`[IMPORT DEBUG] API response:`, result);
      if ((result as any).failed > 0) {
        console.error(`[IMPORT DEBUG] ${(result as any).failed} items failed. First errors:`, (result as any).firstErrors);
      }
      setStep('done');
    } catch (err) {
      console.error('[IMPORT DEBUG] Import threw:', err);
      setImportError(err instanceof Error ? err.message : 'Import failed — check that the server and database are running.');
    }
  };

  const handleClose = () => {
    setStep('upload');
    setParseResult(null);
    setTagged([]);
    setImportError(null);
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  };

  const counts = tagged.reduce(
    (acc, p) => { acc[p._status]++; return acc; },
    { new: 0, 'price-change': 0, updated: 0, unchanged: 0 } as Record<ImportStatus, number>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-black text-lg">Import Inventory</DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="flex flex-col gap-5 py-4">
            <div
              className="border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-4 cursor-pointer transition-colors hover:border-primary/50"
              style={{ borderColor: 'var(--border)' }}
              onClick={() => fileRef.current?.click()}
            >
              <div
                className="h-14 w-14 rounded-2xl flex items-center justify-center"
                style={{ background: 'oklch(0.477 0.216 27.3 / 0.08)' }}
              >
                <Upload className="h-7 w-7" style={{ color: 'var(--primary)' }} />
              </div>
              <div className="text-center">
                <p className="font-bold text-sm">Drop file here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports <strong>.xlsx</strong>, <strong>.xls</strong>, and <strong>.csv</strong>
                </p>
                <p className="text-xs text-muted-foreground">
                  Only <strong>Category</strong>, <strong>Item</strong>, and <strong>Price</strong> columns are needed — column names are matched automatically
                </p>
              </div>
              <button
                className="px-5 py-2 rounded-lg font-semibold text-sm"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                disabled={loading}
              >
                {loading ? 'Parsing…' : 'Choose File'}
              </button>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.ods" className="hidden" onChange={handleFile} />
            </div>

            <label
              className={`flex items-start gap-3 rounded-xl border-2 p-4 cursor-pointer transition-colors ${
                replaceAll
                  ? 'border-destructive/60 bg-destructive/5'
                  : 'border-border hover:border-border/80'
              }`}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-destructive"
                checked={replaceAll}
                onChange={(e) => setReplaceAll(e.target.checked)}
              />
              <div>
                <p className={`font-semibold text-sm ${replaceAll ? 'text-destructive' : ''}`}>
                  Clear entire inventory before import
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {replaceAll
                    ? 'All existing items will be permanently deleted before the new file is loaded.'
                    : 'Leave unchecked to merge — only new and changed items will be updated.'}
                </p>
              </div>
            </label>

            <div className="bg-muted rounded-xl p-4 text-xs text-muted-foreground space-y-2">
              <p className="font-semibold text-foreground text-sm">Flexible format</p>
              <p>Column names are matched automatically — any spreadsheet with an item name, category, and price column will work. NomadBite price is calculated from the service fee. Items already in the database are matched by SKU or name and will only be updated if prices or details changed.</p>
              <a
                href="/product-import-template.csv"
                download="product-import-template.csv"
                className="inline-flex items-center gap-1.5 text-xs font-semibold mt-1"
                style={{ color: 'var(--primary)' }}
              >
                <Download className="h-3.5 w-3.5" />
                Download CSV template
              </a>
            </div>
          </div>
        )}

        {step === 'preview' && parseResult && (
          <>
            <div className="flex items-center gap-2 py-2 flex-wrap">
              {counts.new > 0 && (
                <Badge style={STATUS_BADGE.new.style} className="font-semibold border-0">
                  {counts.new} new
                </Badge>
              )}
              {counts['price-change'] > 0 && (
                <Badge style={STATUS_BADGE['price-change'].style} className="font-semibold border-0">
                  {counts['price-change']} price change{counts['price-change'] > 1 ? 's' : ''}
                </Badge>
              )}
              {counts.updated > 0 && (
                <Badge style={STATUS_BADGE.updated.style} className="font-semibold border-0">
                  {counts.updated} updated
                </Badge>
              )}
              {counts.unchanged > 0 && (
                <Badge style={STATUS_BADGE.unchanged.style} className="font-semibold border-0">
                  {counts.unchanged} unchanged
                </Badge>
              )}
              {parseResult.skipped > 0 && <Badge variant="outline">{parseResult.skipped} skipped</Badge>}
              {parseResult.errors.length > 0 && <Badge variant="destructive">{parseResult.errors.length} errors</Badge>}
            </div>

            {parseResult.errors.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-xs text-destructive flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>{parseResult.errors.slice(0, 3).join('; ')}</div>
              </div>
            )}

            <div className="flex-1 overflow-auto border rounded-xl">
              <table className="w-full text-xs">
                <thead className="sticky top-0" style={{ background: 'var(--muted)' }}>
                  <tr>
                    <th className="text-left p-2 font-semibold">SKU</th>
                    <th className="text-left p-2 font-semibold">Name</th>
                    <th className="text-left p-2 font-semibold">Category</th>
                    <th className="text-left p-2 font-semibold">Unit</th>
                    <th className="text-right p-2 font-semibold">Cost</th>
                    <th className="text-right p-2 font-semibold" style={{ color: 'var(--primary)' }}>Selling Price</th>
                    <th className="text-center p-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tagged.map((p: Tagged, i: number) => (
                    <tr key={i} className={`hover:bg-muted/30 ${ROW_HIGHLIGHT[p._status]}`}>
                      <td className="p-2 font-mono text-muted-foreground">{p.sku}</td>
                      <td className="p-2 font-medium">{p.name}</td>
                      <td className="p-2 text-muted-foreground">{p.category}</td>
                      <td className="p-2 text-muted-foreground">{p.unit}</td>
                      <td className="p-2 text-right text-muted-foreground">
                        {p._status === 'price-change' && p._oldCostPrice !== undefined && p._oldCostPrice !== p.costPrice ? (
                          <span>
                            <span className="line-through opacity-50">{p._oldCostPrice.toLocaleString()}</span>
                            {' → '}
                            {p.costPrice.toLocaleString()}
                          </span>
                        ) : (
                          p.costPrice > 0 ? p.costPrice.toLocaleString() : '—'
                        )}
                      </td>
                      <td className="p-2 text-right font-bold" style={{ color: 'var(--primary)' }}>
                        {p._status === 'price-change' && p._oldSellingPrice !== undefined && p._oldSellingPrice !== p.sellingPrice ? (
                          <span>
                            <span className="line-through opacity-50">{p._oldSellingPrice.toLocaleString()}</span>
                            {' → '}
                            {p.sellingPrice.toLocaleString()}
                          </span>
                        ) : (
                          p.sellingPrice > 0 ? p.sellingPrice.toLocaleString() : '—'
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <span
                          className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold"
                          style={STATUS_BADGE[p._status].style}
                        >
                          {STATUS_BADGE[p._status].label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {importError && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-xs text-destructive flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>{importError}</div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep('upload')} className="flex-1 py-2.5 rounded-xl border font-semibold text-sm hover:bg-muted transition-colors">Back</button>
              <button
                onClick={handleImport}
                disabled={importProducts.isPending || (!replaceAll && counts.new + counts['price-change'] + counts.updated === 0)}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-opacity disabled:opacity-70"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                {importProducts.isPending
                  ? 'Importing…'
                  : replaceAll
                    ? `Replace with ${tagged.length} Items`
                    : `Apply ${counts.new + counts['price-change'] + counts.updated} Change${counts.new + counts['price-change'] + counts.updated !== 1 ? 's' : ''}`
                }
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center gap-5 py-8">
            <div className="h-16 w-16 rounded-full flex items-center justify-center" style={{ background: 'oklch(0.477 0.216 27.3 / 0.1)' }}>
              <CheckCircle className="h-9 w-9" style={{ color: 'var(--primary)' }} />
            </div>
            <div className="text-center">
              <p className="font-black text-lg">Import Successful</p>
              <p className="text-sm text-muted-foreground mt-1">
                {replaceAll
                  ? `${tagged.length} items saved to inventory.`
                  : `${counts.new} added · ${counts['price-change'] + counts.updated} updated · ${counts.unchanged} unchanged.`
                }
              </p>
            </div>
            <button onClick={handleClose} className="px-6 py-2.5 rounded-xl font-bold text-sm" style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>Done</button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
