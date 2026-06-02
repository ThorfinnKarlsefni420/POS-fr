import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Upload, Download, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

interface ParsedRow {
  sku: string;
  tierName: string;
  qtyInBase: number;
  costPrice: number;
  sellingPrice: number | null;
  barcode: string | null;
}

interface ImportResult {
  sku: string;
  status: 'ok' | 'skipped';
  tiersApplied?: number;
  reason?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

function downloadTemplate() {
  const rows = [
    ['SKU', 'Tier Name', 'Qty in Base', 'Cost Price (KES)', 'Sell Price (KES)', 'Barcode'],
    ['FLOUR001', 'Kg', 1, 80, 120, ''],
    ['FLOUR001', 'Bag 5kg', 5, 380, 550, '5901234123457'],
    ['FLOUR001', 'Bag 25kg', 25, 1800, 2500, ''],
    ['OIL002', 'Litre', 1, 150, 200, ''],
    ['OIL002', 'Jerrican 5L', 5, 720, 950, '8901234567890'],
    ['OIL002', 'Jerrican 20L', 20, 2800, 3700, ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 16 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tiers');
  XLSX.writeFile(wb, 'packaging-tiers-template.xlsx');
}

function parseSheet(file: File): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        // Skip header row
        const rows: ParsedRow[] = [];
        for (let i = 1; i < raw.length; i++) {
          const r = raw[i] as (string | number)[];
          const sku = String(r[0] ?? '').trim();
          const tierName = String(r[1] ?? '').trim();
          const qtyInBase = Number(r[2]);
          const costPrice = Number(r[3]);
          const sellRaw = r[4];
          const barcode = String(r[5] ?? '').trim() || null;

          if (!sku || !tierName || !(qtyInBase > 0)) continue;

          rows.push({
            sku,
            tierName,
            qtyInBase,
            costPrice: isNaN(costPrice) ? 0 : costPrice,
            sellingPrice: sellRaw !== '' && !isNaN(Number(sellRaw)) ? Number(sellRaw) : null,
            barcode,
          });
        }
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function TierImportDialog({ open, onClose, onDone }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  const reset = () => {
    setParsed(null);
    setParseError('');
    setResults(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    setParseError('');
    setParsed(null);
    try {
      const rows = await parseSheet(file);
      if (rows.length === 0) { setParseError('No valid rows found. Check the file matches the template format.'); return; }
      setParsed(rows);
    } catch {
      setParseError('Failed to read file. Make sure it\'s a valid .xlsx or .csv file.');
    }
  };

  const handleImport = async () => {
    if (!parsed) return;
    setImporting(true);
    try {
      const { results: res } = await api.products.bulkTiers(parsed);
      setResults(res);
      onDone();
    } catch (err) {
      setParseError((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  // Group parsed rows by SKU for the preview table
  const bySku = parsed
    ? parsed.reduce<Record<string, ParsedRow[]>>((acc, r) => {
        (acc[r.sku] ??= []).push(r);
        return acc;
      }, {})
    : null;

  const skuCount = bySku ? Object.keys(bySku).length : 0;
  const okCount = results?.filter((r) => r.status === 'ok').length ?? 0;
  const skippedCount = results?.filter((r) => r.status === 'skipped').length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-black">Import Packaging Tiers from Excel</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">

          {/* Step 1 — download template */}
          <div className="rounded-xl border p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">1. Download the template</p>
              <p className="text-xs text-muted-foreground mt-0.5">Fill in your product SKUs and tier details. One row per tier per product.</p>
            </div>
            <button
              onClick={downloadTemplate}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold hover:bg-muted transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Template.xlsx
            </button>
          </div>

          {/* Step 2 — upload */}
          {!results && (
            <div
              className="rounded-xl border-2 border-dashed p-6 text-center cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            >
              <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-semibold">2. Upload your filled spreadsheet</p>
              <p className="text-xs text-muted-foreground mt-1">Drag & drop or click · .xlsx or .csv</p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.csv,.xls"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          )}

          {parseError && (
            <div className="flex items-center gap-2 text-xs font-semibold text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {parseError}
            </div>
          )}

          {/* Preview */}
          {parsed && !results && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  Preview — {parsed.length} tier row{parsed.length !== 1 ? 's' : ''} across {skuCount} SKU{skuCount !== 1 ? 's' : ''}
                </p>
                <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground underline">Clear</button>
              </div>

              <div className="rounded-xl border overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0" style={{ background: 'var(--muted)' }}>
                    <tr className="border-b">
                      <th className="text-left p-2 font-semibold text-muted-foreground">SKU</th>
                      <th className="text-left p-2 font-semibold text-muted-foreground">Tier</th>
                      <th className="text-right p-2 font-semibold text-muted-foreground">Qty in Base</th>
                      <th className="text-right p-2 font-semibold text-muted-foreground">Cost</th>
                      <th className="text-right p-2 font-semibold text-muted-foreground">Sell</th>
                      <th className="text-left p-2 font-semibold text-muted-foreground">Barcode</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {parsed.map((r, i) => (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="p-2 font-mono">{r.sku}</td>
                        <td className="p-2 font-semibold">{r.tierName}</td>
                        <td className="p-2 text-right">{r.qtyInBase}</td>
                        <td className="p-2 text-right text-muted-foreground">{r.costPrice > 0 ? r.costPrice.toLocaleString() : '—'}</td>
                        <td className="p-2 text-right" style={{ color: 'var(--primary)' }}>
                          {r.sellingPrice != null ? r.sellingPrice.toLocaleString() : <span className="text-muted-foreground">auto</span>}
                        </td>
                        <td className="p-2 font-mono text-muted-foreground text-[10px]">{r.barcode ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-2 justify-end">
                <button onClick={reset} className="h-9 px-4 rounded-lg border text-sm font-semibold hover:bg-muted">
                  Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="h-9 px-4 rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50"
                  style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                >
                  {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                  Import {skuCount} Product{skuCount !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
                  <CheckCircle2 className="h-8 w-8 shrink-0" style={{ color: 'oklch(0.5 0.15 145)' }} />
                  <div>
                    <p className="text-2xl font-black" style={{ color: 'oklch(0.4 0.15 145)' }}>{okCount}</p>
                    <p className="text-xs text-muted-foreground">products updated</p>
                  </div>
                </div>
                {skippedCount > 0 && (
                  <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
                    <AlertTriangle className="h-8 w-8 shrink-0" style={{ color: 'oklch(0.55 0.15 60)' }} />
                    <div>
                      <p className="text-2xl font-black" style={{ color: 'oklch(0.55 0.15 60)' }}>{skippedCount}</p>
                      <p className="text-xs text-muted-foreground">SKUs not found</p>
                    </div>
                  </div>
                )}
              </div>

              {skippedCount > 0 && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                  <p className="text-xs font-semibold">Skipped SKUs</p>
                  {results.filter((r) => r.status === 'skipped').map((r) => (
                    <p key={r.sku} className="text-xs text-muted-foreground">
                      <span className="font-mono">{r.sku}</span> — {r.reason}
                    </p>
                  ))}
                </div>
              )}

              <button
                onClick={() => { reset(); onClose(); }}
                className="w-full h-10 rounded-xl font-bold text-sm"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                Done
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
