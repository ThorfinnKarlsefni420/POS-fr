import { useRef, useState, useMemo } from 'react';
import { FolderOpen, CheckCircle, AlertTriangle, XCircle, Loader2, X } from 'lucide-react';
import { useProducts } from '@/hooks/use-products';
import { useSettingsStore } from '@/features/admin/store/use-settings-store';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ─── Fuzzy matching ───────────────────────────────────────────────────────────

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1); // ignore single chars like "x"
}

function matchScore(filename: string, productName: string): number {
  const fa = tokenize(filename);
  const fb = tokenize(productName);
  if (!fa.length || !fb.length) return 0;

  let matched = 0;
  for (const ta of fa) {
    // prefix match: "diaper" matches "diaper4" and vice-versa
    if (fb.some((tb) => tb.startsWith(ta) || ta.startsWith(tb))) matched++;
  }
  // score = matched tokens / max token count (penalises very long unmatched product names)
  return matched / Math.max(fa.length, fb.length);
}

function stemFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').trim();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MatchRow {
  file: File;
  preview: string;        // object URL
  stem: string;           // filename without extension
  matchedId: string | null;
  score: number;
  candidates: Array<{ id: string; name: string; score: number }>;
  status: 'pending' | 'uploading' | 'done' | 'error' | 'skipped';
  cloudUrl?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export function LocalImageMatcher({ open, onClose }: Props) {
  const { data: products = [] } = useProducts();
  const { cloudinaryCloudName, cloudinaryUploadPreset } = useSettingsStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<MatchRow[]>([]);
  const [uploading, setUploading] = useState(false);

  const stats = useMemo(() => {
    const good = rows.filter((r) => r.matchedId && r.score >= 0.5).length;
    const low  = rows.filter((r) => r.matchedId && r.score > 0 && r.score < 0.5).length;
    const none = rows.filter((r) => !r.matchedId).length;
    return { good, low, none };
  }, [rows]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const newRows: MatchRow[] = [];

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const stem = stemFilename(file.name);

      // Score all products, keep top 5
      const scored = products
        .map((p) => ({ id: p.id, name: p.name, score: matchScore(stem, p.name) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      const best = scored[0] ?? null;

      newRows.push({
        file,
        preview: URL.createObjectURL(file),
        stem,
        matchedId: best && best.score > 0 ? best.id : null,
        score: best?.score ?? 0,
        candidates: scored,
        status: 'pending',
      });
    }

    setRows((prev) => [...prev, ...newRows]);
  };

  const setMatch = (idx: number, productId: string | null) => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        const p = products.find((x) => x.id === productId);
        const score = p ? matchScore(r.stem, p.name) : 0;
        return { ...r, matchedId: productId, score };
      })
    );
  };

  const removeRow = (idx: number) => {
    setRows((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleUpload = async () => {
    const toUpload = rows.filter((r) => r.matchedId && r.status === 'pending');
    if (!toUpload.length) return;
    setUploading(true);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.matchedId || row.status !== 'pending') continue;

      const product = products.find((p) => p.id === row.matchedId);
      if (!product) continue;

      setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, status: 'uploading' } : r));

      try {
        const result = await uploadToCloudinary(
          row.file,
          cloudinaryCloudName,
          cloudinaryUploadPreset,
          product.sku
        );
        await api.products.update(product.id, { imageUrl: result.secure_url });
        setRows((prev) =>
          prev.map((r, idx) => idx === i ? { ...r, status: 'done', cloudUrl: result.secure_url } : r)
        );
      } catch {
        setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, status: 'error' } : r));
      }
    }

    queryClient.invalidateQueries({ queryKey: ['products'] });
    setUploading(false);
  };

  const handleClose = () => {
    rows.forEach((r) => URL.revokeObjectURL(r.preview));
    setRows([]);
    onClose();
  };

  const pendingCount = rows.filter((r) => r.matchedId && r.status === 'pending').length;
  const doneCount = rows.filter((r) => r.status === 'done').length;

  const scoreColor = (score: number) => {
    if (score >= 0.6) return 'text-green-600 bg-green-500/10';
    if (score >= 0.35) return 'text-amber-600 bg-amber-500/10';
    return 'text-red-600 bg-red-500/10';
  };

  const statusIcon = (status: MatchRow['status']) => {
    if (status === 'uploading') return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    if (status === 'done')      return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (status === 'error')     return <XCircle className="h-4 w-4 text-red-500" />;
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-black">Match Local Images to Products</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Upload images from your device — the system fuzzy-matches filenames to product names automatically.
          </p>
        </DialogHeader>

        {/* Drop / pick zone */}
        <div
          className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:bg-muted/40 transition-colors shrink-0"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        >
          <FolderOpen className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm font-semibold">Drop images here or click to browse</p>
          <p className="text-xs text-muted-foreground mt-1">Supports JPG, PNG, WEBP — select multiple at once</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        {/* Stats bar */}
        {rows.length > 0 && (
          <div className="flex items-center gap-4 text-xs font-medium shrink-0">
            <span>{rows.length} images loaded</span>
            {stats.good > 0 && <span className="text-green-600">{stats.good} high confidence</span>}
            {stats.low  > 0 && <span className="text-amber-600">{stats.low} low confidence</span>}
            {stats.none > 0 && <span className="text-red-500">{stats.none} unmatched</span>}
            {doneCount   > 0 && <span className="text-primary ml-auto">{doneCount} uploaded</span>}
          </div>
        )}

        {/* Match table */}
        {rows.length > 0 && (
          <div className="flex-1 overflow-y-auto border rounded-xl">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted z-10">
                <tr>
                  <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Image</th>
                  <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Filename</th>
                  <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Matched Product</th>
                  <th className="text-center p-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conf.</th>
                  <th className="text-center p-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-muted/20">
                    <td className="p-2">
                      <img src={row.preview} alt="" className="h-10 w-10 object-cover rounded-lg border" />
                    </td>
                    <td className="p-2 max-w-[180px]">
                      <p className="text-xs font-medium truncate">{row.file.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{row.stem}</p>
                    </td>
                    <td className="p-2">
                      <select
                        value={row.matchedId ?? ''}
                        disabled={row.status !== 'pending'}
                        onChange={(e) => setMatch(idx, e.target.value || null)}
                        className="w-full text-xs rounded-md border border-input bg-background px-2 py-1.5 disabled:opacity-60"
                      >
                        <option value="">— No match —</option>
                        {/* Top candidates first */}
                        {row.candidates.length > 0 && (
                          <optgroup label="Top matches">
                            {row.candidates.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="All products">
                          {products
                            .filter((p) => !row.candidates.some((c) => c.id === p.id))
                            .map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </optgroup>
                      </select>
                    </td>
                    <td className="p-2 text-center">
                      {statusIcon(row.status) ?? (
                        row.matchedId ? (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${scoreColor(row.score)}`}>
                            {Math.round(row.score * 100)}%
                          </span>
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-muted-foreground/30 mx-auto" />
                        )
                      )}
                    </td>
                    <td className="p-2 text-center">
                      <button
                        onClick={() => removeRow(idx)}
                        disabled={row.status === 'uploading'}
                        className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-3 pt-1 shrink-0">
          <button onClick={handleClose} className="px-4 py-2.5 rounded-lg border font-semibold text-sm hover:bg-muted transition-colors">
            {doneCount > 0 ? 'Close' : 'Cancel'}
          </button>
          {rows.length > 0 && (
            <button
              onClick={handleUpload}
              disabled={uploading || pendingCount === 0}
              className="flex-1 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
              {uploading
                ? 'Uploading…'
                : `Upload & Save ${pendingCount} image${pendingCount !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
