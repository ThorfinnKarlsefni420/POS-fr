import { useRef, useState, useMemo } from 'react';
import { FolderOpen, CheckCircle, AlertTriangle, XCircle, Loader2, X, Info } from 'lucide-react';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { api, SuperAdminInventoryItem } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter((t) => t.length > 1);
}

function matchScore(filename: string, productName: string): number {
  const fa = tokenize(filename);
  const fb = tokenize(productName);
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

interface MatchRow {
  file: File;
  preview: string;
  stem: string;
  matchedId: string | null;
  matchedName: string | null;
  score: number;
  candidates: Array<{ id: string; name: string; score: number }>;
  status: 'pending' | 'uploading' | 'done' | 'error';
  cloudUrl?: string;
  updatedCount?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  products: SuperAdminInventoryItem[];
  cloudinaryCloudName: string;
  cloudinaryUploadPreset: string;
}

export function SuperAdminImageMatcher({ open, onClose, products, cloudinaryCloudName, cloudinaryUploadPreset }: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [uploading, setUploading] = useState(false);

  const noCloudinary = !cloudinaryCloudName || !cloudinaryUploadPreset;

  const stats = useMemo(() => ({
    good: rows.filter((r) => r.matchedId && r.score >= 0.5).length,
    low:  rows.filter((r) => r.matchedId && r.score > 0 && r.score < 0.5).length,
    none: rows.filter((r) => !r.matchedId).length,
    done: rows.filter((r) => r.status === 'done').length,
  }), [rows]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const newRows: MatchRow[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const stem = stemFilename(file.name);
      const scored = products
        .map((p) => ({ id: p.id, name: p.name, score: matchScore(stem, p.name) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      const best = scored[0] ?? null;
      newRows.push({
        file,
        preview: URL.createObjectURL(file),
        stem,
        matchedId:   best && best.score > 0 ? best.id   : null,
        matchedName: best && best.score > 0 ? best.name : null,
        score: best?.score ?? 0,
        candidates: scored,
        status: 'pending',
      });
    }
    setRows((prev) => [...prev, ...newRows]);
  };

  const setMatch = (idx: number, productId: string | null) => {
    setRows((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      const p = products.find((x) => x.id === productId);
      return { ...r, matchedId: productId, matchedName: p?.name ?? null, score: p ? matchScore(r.stem, p.name) : 0 };
    }));
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
      if (!row.matchedId || !row.matchedName || row.status !== 'pending') continue;

      setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, status: 'uploading' } : r));

      try {
        const product = products.find((p) => p.id === row.matchedId);
        const publicId = product?.sku || row.stem;
        const result = await uploadToCloudinary(row.file, cloudinaryCloudName, cloudinaryUploadPreset, publicId);
        const res = await api.superadmin.broadcastImage(row.matchedName, result.secure_url);
        setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, status: 'done', cloudUrl: result.secure_url, updatedCount: res.updated } : r));
      } catch {
        setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, status: 'error' } : r));
      }
    }

    queryClient.invalidateQueries({ queryKey: ['superadmin-inventory'] });
    setUploading(false);
  };

  const handleClose = () => {
    rows.forEach((r) => URL.revokeObjectURL(r.preview));
    setRows([]);
    onClose();
  };

  const pendingCount = rows.filter((r) => r.matchedId && r.status === 'pending').length;

  const scoreColor = (score: number) =>
    score >= 0.6 ? 'text-green-600 bg-green-500/10' :
    score >= 0.35 ? 'text-amber-600 bg-amber-500/10' :
    'text-red-600 bg-red-500/10';

  const statusCell = (row: MatchRow) => {
    if (row.status === 'uploading') return <Loader2 className="h-4 w-4 animate-spin text-orange-500 mx-auto" />;
    if (row.status === 'done')      return <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />;
    if (row.status === 'error')     return <XCircle className="h-4 w-4 text-red-500 mx-auto" />;
    if (row.matchedId) return (
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${scoreColor(row.score)}`}>
        {Math.round(row.score * 100)}%
      </span>
    );
    return <AlertTriangle className="h-4 w-4 text-muted-foreground/30 mx-auto" />;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle className="font-black">Bulk Image Upload</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Filenames are fuzzy-matched to product names. Each upload propagates to every store carrying that item — no store selection needed.
          </p>
        </DialogHeader>

        {noCloudinary && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700 shrink-0">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Cloudinary is not configured. Go to the <strong>Pricing</strong> tab → <strong>Cloudinary Settings</strong> and save your cloud name and upload preset first.</span>
          </div>
        )}

        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors shrink-0 ${
            noCloudinary ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/40'
          }`}
          onClick={() => !noCloudinary && fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (!noCloudinary) handleFiles(e.dataTransfer.files); }}
        >
          <FolderOpen className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm font-semibold">Drop images here or click to browse</p>
          <p className="text-xs text-muted-foreground mt-1">JPG · PNG · WEBP — select multiple at once</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        {rows.length > 0 && (
          <div className="flex items-center gap-3 text-xs font-medium shrink-0">
            <span className="text-muted-foreground">{rows.length} image{rows.length !== 1 ? 's' : ''}</span>
            {stats.good > 0 && <span className="text-green-600">{stats.good} matched</span>}
            {stats.low  > 0 && <span className="text-amber-600">{stats.low} low confidence</span>}
            {stats.none > 0 && <span className="text-red-500">{stats.none} unmatched</span>}
            {stats.done > 0 && <span className="text-orange-600 ml-auto">{stats.done} uploaded</span>}
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex-1 overflow-y-auto border rounded-xl min-h-0">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted z-10">
                <tr>
                  <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Image</th>
                  <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Filename</th>
                  <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Matched Product</th>
                  <th className="text-center p-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-16">Conf.</th>
                  <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Result</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-muted/20">
                    <td className="p-2">
                      <img src={row.preview} alt="" className="h-10 w-10 object-cover rounded-lg border" />
                    </td>
                    <td className="p-2 max-w-[160px]">
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
                    <td className="p-2 text-center">{statusCell(row)}</td>
                    <td className="p-2 text-xs">
                      {row.status === 'done' && row.updatedCount !== undefined && (
                        <span className="text-green-600 font-semibold">
                          {row.updatedCount} store{row.updatedCount !== 1 ? 's' : ''} updated
                        </span>
                      )}
                      {row.status === 'error' && <span className="text-red-500">Upload failed — retry</span>}
                    </td>
                    <td className="p-2">
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

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleClose}
            className="px-4 py-2.5 rounded-lg border font-semibold text-sm hover:bg-muted transition-colors"
          >
            {stats.done > 0 ? 'Close' : 'Cancel'}
          </button>
          {rows.length > 0 && (
            <button
              onClick={handleUpload}
              disabled={uploading || pendingCount === 0 || noCloudinary}
              className="flex-1 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
              {uploading
                ? 'Uploading…'
                : `Upload & Broadcast ${pendingCount} image${pendingCount !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
