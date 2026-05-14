import { useRef, useState, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FolderOpen, CheckCircle, XCircle, Loader2, X, Search, Plus } from 'lucide-react';
import { useProducts } from '@/hooks/use-products';
import { useSettingsStore } from '@/features/admin/store/use-settings-store';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Product } from '@/types/pos';

// ─── Fuzzy matching ───────────────────────────────────────────────────────────

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter((t) => t.length > 1);
}

function matchScore(a: string, b: string): number {
  const fa = tokenize(a);
  const fb = tokenize(b);
  if (!fa.length || !fb.length) return 0;
  let matched = 0;
  for (const ta of fa) {
    if (fb.some((tb) => tb.startsWith(ta) || ta.startsWith(tb))) matched++;
  }
  return matched / Math.max(fa.length, fb.length);
}

function stemFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').trim();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Candidate {
  id: string;
  name: string;
  sku: string;
  score: number; // 0 = manually added
}

interface MatchRow {
  file: File;
  stem: string;
  candidates: Candidate[];
  checkedIds: string[];
  rowSearch: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  updatedCount?: number;
}

// ─── Lazy preview — creates/revokes blob URL only while mounted ───────────────

function LazyPreview({ file }: { file: File }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return src
    ? <img src={src} alt="" className="h-12 w-12 object-cover rounded-lg border shrink-0" />
    : <div className="h-12 w-12 rounded-lg border bg-muted shrink-0" />;
}

// ─── Score badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  if (score === 0) return <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded-full bg-muted">manual</span>;
  const cls = score >= 0.6 ? 'text-green-600 bg-green-500/10' : score >= 0.3 ? 'text-amber-600 bg-amber-500/10' : 'text-muted-foreground bg-muted';
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cls}`}>{Math.round(score * 100)}%</span>;
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { open: boolean; onClose: () => void; }

export function LocalImageMatcher({ open, onClose }: Props) {
  const { data: products = [] } = useProducts();
  const { cloudinaryCloudName, cloudinaryUploadPreset } = useSettingsStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [rows, setRows] = useState<MatchRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 160,
    overscan: 3,
    measureElement: useCallback((el: Element) => el.getBoundingClientRect().height, []),
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setProcessing(true);
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    const CHUNK = 50;
    const newRows: MatchRow[] = [];

    for (let i = 0; i < imageFiles.length; i += CHUNK) {
      const chunk = imageFiles.slice(i, i + CHUNK);
      for (const file of chunk) {
        const stem = stemFilename(file.name);
        const candidates: Candidate[] = products
          .map((p) => ({ id: p.id, name: p.name, sku: p.sku, score: matchScore(stem, p.name) }))
          .filter((c) => c.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 20);
        const checkedIds = candidates.filter((c) => c.score >= 0.3).map((c) => c.id);
        newRows.push({ file, stem, candidates, checkedIds, rowSearch: '', status: 'pending' });
      }
      await new Promise((r) => setTimeout(r, 0));
    }

    setRows((prev) => [...prev, ...newRows]);
    setProcessing(false);
  };

  const toggleCheck = (rowIdx: number, id: string) => {
    setRows((prev) => prev.map((r, i) => {
      if (i !== rowIdx) return r;
      const has = r.checkedIds.includes(id);
      return { ...r, checkedIds: has ? r.checkedIds.filter((x) => x !== id) : [...r.checkedIds, id] };
    }));
  };

  const addCandidate = (rowIdx: number, product: Product) => {
    setRows((prev) => prev.map((r, i) => {
      if (i !== rowIdx) return r;
      if (r.candidates.some((c) => c.id === product.id)) {
        // already in list — just check it
        return { ...r, checkedIds: r.checkedIds.includes(product.id) ? r.checkedIds : [...r.checkedIds, product.id], rowSearch: '' };
      }
      const newCandidate: Candidate = { id: product.id, name: product.name, sku: product.sku, score: 0 };
      return { ...r, candidates: [...r.candidates, newCandidate], checkedIds: [...r.checkedIds, product.id], rowSearch: '' };
    }));
  };

  const setRowSearch = (rowIdx: number, value: string) => {
    setRows((prev) => prev.map((r, i) => i === rowIdx ? { ...r, rowSearch: value } : r));
  };

  const removeRow = (rowIdx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== rowIdx));
  };

  const handleUpload = async () => {
    const pending = rows.filter((r) => r.checkedIds.length > 0 && r.status === 'pending');
    if (!pending.length) return;
    setUploading(true);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.checkedIds.length || row.status !== 'pending') continue;
      const product = products.find((p) => p.id === row.checkedIds[0]);
      if (!product) continue;

      setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, status: 'uploading' } : r));
      try {
        const result = await uploadToCloudinary(row.file, cloudinaryCloudName, cloudinaryUploadPreset, product.sku);
        const { updated } = await api.products.bulkImage(row.checkedIds, result.secure_url);
        setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, status: 'done', updatedCount: updated } : r));
      } catch {
        setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, status: 'error' } : r));
      }
    }

    queryClient.invalidateQueries({ queryKey: ['products'] });
    setUploading(false);
  };

  const handleClose = () => { setRows([]); onClose(); };

  const pendingCount = rows.filter((r) => r.checkedIds.length > 0 && r.status === 'pending').length;
  const doneCount    = rows.filter((r) => r.status === 'done').length;

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop    = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0
    ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
    : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="font-black">Match Local Images to Products</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Each image can update multiple products. All matches above 30% are pre-selected — uncheck any you don't want, or search to add more.
          </p>
        </DialogHeader>

        {/* Drop zone */}
        <div
          className="border-2 border-dashed rounded-xl p-5 text-center cursor-pointer hover:bg-muted/40 transition-colors shrink-0"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        >
          <FolderOpen className="h-7 w-7 mx-auto mb-1.5 text-muted-foreground/50" />
          <p className="text-sm font-semibold">Drop images here or click to browse</p>
          <p className="text-xs text-muted-foreground mt-0.5">JPG, PNG, WEBP — select any number</p>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        </div>

        {processing && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Matching filenames to products…
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex items-center gap-3 text-xs font-medium shrink-0 text-muted-foreground">
            <span>{rows.length} images</span>
            <span>·</span>
            <span>{rows.reduce((s, r) => s + r.checkedIds.length, 0)} products will be updated</span>
            {doneCount > 0 && <span className="text-primary ml-auto">{doneCount} uploaded</span>}
          </div>
        )}

        {/* Virtualised card list */}
        {rows.length > 0 && (
          <div ref={containerRef} className="flex-1 overflow-y-auto min-h-0 space-y-0">
            <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
              {paddingTop > 0 && <div style={{ height: paddingTop }} />}
              {virtualItems.map((vRow) => {
                const row = rows[vRow.index];
                const idx = vRow.index;

                const searchResults: Product[] = row.rowSearch.trim()
                  ? products
                      .filter((p) => {
                        const q = row.rowSearch.toLowerCase();
                        return (
                          !row.candidates.some((c) => c.id === p.id) &&
                          (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
                        );
                      })
                      .slice(0, 6)
                  : [];

                return (
                  <div
                    key={idx}
                    data-index={idx}
                    ref={rowVirtualizer.measureElement}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vRow.start}px)` }}
                    className="pb-2"
                  >
                    <div className="border rounded-xl bg-card p-3 space-y-2.5">
                      {/* Header row */}
                      <div className="flex items-start gap-3">
                        <LazyPreview file={row.file} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{row.file.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{row.stem}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {row.checkedIds.length > 0
                              ? <span className="text-foreground font-semibold">{row.checkedIds.length}</span>
                              : <span className="text-destructive font-semibold">0</span>}{' '}
                            product{row.checkedIds.length !== 1 ? 's' : ''} selected
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {row.status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                          {row.status === 'done' && (
                            <span className="flex items-center gap-1 text-xs text-green-600 font-semibold">
                              <CheckCircle className="h-4 w-4" />
                              {row.updatedCount} updated
                            </span>
                          )}
                          {row.status === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
                          <button
                            onClick={() => removeRow(idx)}
                            disabled={row.status === 'uploading'}
                            className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Candidates list */}
                      {row.candidates.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {row.candidates.map((c) => {
                            const checked = row.checkedIds.includes(c.id);
                            return (
                              <button
                                key={c.id}
                                onClick={() => row.status === 'pending' && toggleCheck(idx, c.id)}
                                disabled={row.status !== 'pending'}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium transition-all ${
                                  checked
                                    ? 'border-primary/50 bg-primary/8 text-foreground'
                                    : 'border-border bg-muted/30 text-muted-foreground'
                                } disabled:cursor-default`}
                              >
                                <span className={`h-3 w-3 rounded-sm border flex items-center justify-center shrink-0 ${checked ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`}>
                                  {checked && <svg viewBox="0 0 8 8" className="h-2 w-2 fill-primary-foreground"><path d="M1 4l2 2 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>}
                                </span>
                                <span className="truncate max-w-[160px]">{c.name}</span>
                                <ScoreBadge score={c.score} />
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {row.candidates.length === 0 && row.status === 'pending' && (
                        <p className="text-xs text-muted-foreground italic">No automatic matches found — use search to add products.</p>
                      )}

                      {/* Search to add more products */}
                      {row.status === 'pending' && (
                        <div className="relative">
                          <div className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5">
                            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <input
                              type="text"
                              placeholder="Search to add more products…"
                              value={row.rowSearch}
                              onChange={(e) => setRowSearch(idx, e.target.value)}
                              className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground/60"
                            />
                            {row.rowSearch && (
                              <button onClick={() => setRowSearch(idx, '')} className="text-muted-foreground hover:text-foreground">
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                          {searchResults.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-card border rounded-lg shadow-lg overflow-hidden">
                              {searchResults.map((p) => (
                                <button
                                  key={p.id}
                                  onClick={() => addCandidate(idx, p)}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors text-left"
                                >
                                  <Plus className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="flex-1 truncate font-medium">{p.name}</span>
                                  <span className="text-muted-foreground font-mono shrink-0">{p.sku}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {paddingBottom > 0 && <div style={{ height: paddingBottom }} />}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={handleClose} className="px-4 py-2.5 rounded-lg border font-semibold text-sm hover:bg-muted transition-colors">
            {doneCount > 0 ? 'Close' : 'Cancel'}
          </button>
          {rows.length > 0 && (
            <button
              onClick={handleUpload}
              disabled={uploading || processing || pendingCount === 0}
              className="flex-1 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
              {uploading ? 'Uploading…' : `Upload ${pendingCount} image${pendingCount !== 1 ? 's' : ''} → apply to ${rows.filter(r => r.status === 'pending' && r.checkedIds.length > 0).reduce((s, r) => s + r.checkedIds.length, 0)} products`}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
