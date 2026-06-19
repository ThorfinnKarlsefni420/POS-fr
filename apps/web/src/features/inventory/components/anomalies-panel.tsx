import { useRef, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { AlertTriangle, CheckCircle2, Upload, RefreshCw, Filter } from 'lucide-react';
import { useAnomalies, useResolveAnomaly, useBulkStoreAnomalies } from '@/hooks/use-anomalies';
import { InventoryAnomaly } from '@/lib/api';

type FilterMode = 'all' | 'open' | 'resolved';

const REASON_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  'placeholder':      { label: 'Placeholder',    color: 'oklch(0.5 0.2 27)',  bg: 'oklch(0.5 0.2 27 / 0.1)'  },
  'slash-variant':    { label: 'Slash Variant',   color: 'oklch(0.4 0.15 230)', bg: 'oklch(0.4 0.15 230 / 0.1)' },
  'assorted-no-size': { label: 'Assorted/Mix',    color: 'oklch(0.55 0.18 50)', bg: 'oklch(0.55 0.18 50 / 0.1)' },
  'multi-size':       { label: 'Multi-Size',      color: 'oklch(0.4 0.15 290)', bg: 'oklch(0.4 0.15 290 / 0.1)' },
};

interface ParsedRow {
  sourceId: string;
  name: string;
  reason: string;
  notes: string;
}

function parseAnomalyRows(raw: Record<string, string>[]): { rows: ParsedRow[]; errors: string[] } {
  const rows: ParsedRow[] = [];
  const errors: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    // Normalise header keys: lowercase + trim
    const norm: Record<string, string> = {};
    for (const k of Object.keys(r)) norm[k.toLowerCase().trim()] = r[k];

    const sourceId = (norm['source id'] ?? norm['sourceid'] ?? norm['source_id'] ?? '').trim();
    const name     = (norm['name'] ?? norm['product name'] ?? norm['description'] ?? '').trim();
    const reason   = (norm['reason'] ?? norm['type'] ?? '').trim().toLowerCase();
    const notes    = (norm['notes'] ?? norm['note'] ?? norm['details'] ?? '').trim();

    if (!sourceId || !name) {
      errors.push(`Row ${i + 2}: missing Source ID or Name — skipped`);
      continue;
    }
    rows.push({ sourceId, name, reason, notes });
  }
  return { rows, errors };
}

export function AnomaliesPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<FilterMode>('open');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ created: number; errors: string[] } | null>(null);

  const resolvedParam = filter === 'all' ? undefined : filter === 'open' ? false : true;
  const { data: anomalies = [], isLoading } = useAnomalies(resolvedParam);
  const { mutateAsync: resolve, isPending: resolving } = useResolveAnomaly();
  const { mutateAsync: bulkStore } = useBulkStoreAnomalies();

  async function handleFile(file: File) {
    setUploadResult(null);
    setUploading(true);
    try {
      let rawRows: Record<string, string>[] = [];

      if (file.name.match(/\.xlsx?$/i)) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rawRows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
      } else {
        await new Promise<void>((resolve, reject) => {
          Papa.parse<Record<string, string>>(file, {
            header: true,
            skipEmptyLines: true,
            complete: (res) => { rawRows = res.data; resolve(); },
            error: reject,
          });
        });
      }

      const { rows, errors } = parseAnomalyRows(rawRows);
      if (rows.length > 0) {
        const res = await bulkStore(rows);
        setUploadResult({ created: res.created, errors });
      } else {
        setUploadResult({ created: 0, errors: errors.length ? errors : ['No valid rows found in file'] });
      }
    } catch (e) {
      setUploadResult({ created: 0, errors: [String(e)] });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const grouped = anomalies.reduce<Record<string, InventoryAnomaly[]>>((acc, a) => {
    (acc[a.reason] = acc[a.reason] ?? []).push(a);
    return acc;
  }, {});

  const counts: Record<FilterMode, number> = {
    all: 0, open: 0, resolved: 0,
  };
  for (const a of anomalies) {
    counts.all++;
    if (a.resolved) counts.resolved++; else counts.open++;
  }

  return (
    <div className="space-y-4 pt-3 pb-6">

      {/* ── Header bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-bold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" style={{ color: 'oklch(0.55 0.18 50)' }} />
            Inventory Anomalies
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Items flagged during import that need human review before resolving.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-muted transition-colors bg-card disabled:opacity-50"
          >
            {uploading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {uploading ? 'Importing…' : 'Import CSV / XLS'}
          </button>
        </div>
      </div>

      {/* ── Upload result ── */}
      {uploadResult && (
        <div className={`rounded-xl border p-3 text-xs space-y-1 ${uploadResult.created > 0 ? 'bg-green-500/5 border-green-500/30' : 'bg-orange-500/5 border-orange-500/30'}`}>
          {uploadResult.created > 0 && (
            <p className="font-semibold text-green-700 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {uploadResult.created} anomalies stored
            </p>
          )}
          {uploadResult.errors.map((e, i) => (
            <p key={i} className="text-orange-700">{e}</p>
          ))}
        </div>
      )}

      {/* ── Filter pills ── */}
      <div className="flex items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {(['open', 'all', 'resolved'] as FilterMode[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1 rounded-full text-xs font-semibold border transition-all capitalize"
            style={filter === f
              ? { background: 'var(--primary)', color: 'var(--primary-foreground)', borderColor: 'var(--primary)' }
              : { background: 'var(--card)', borderColor: 'var(--border)' }}
          >
            {f === 'open' ? 'Open' : f === 'resolved' ? 'Resolved' : 'All'} ({f === 'open' ? counts.open : f === 'resolved' ? counts.resolved : anomalies.length})
          </button>
        ))}
      </div>

      {/* ── Table ── */}
      {isLoading ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : anomalies.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500/60" />
          <p className="text-sm font-semibold text-muted-foreground">
            {filter === 'open' ? 'No open anomalies' : filter === 'resolved' ? 'Nothing resolved yet' : 'No anomalies found'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Import a CSV or XLS file above to populate this list.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([reason, items]) => {
            const meta = REASON_LABEL[reason] ?? { label: reason, color: 'var(--foreground)', bg: 'var(--muted)' };
            return (
              <div key={reason} className="rounded-xl border bg-card overflow-hidden">
                <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ background: meta.bg }}>
                  <span className="text-xs font-bold" style={{ color: meta.color }}>{meta.label}</span>
                  <span className="text-xs font-semibold text-muted-foreground">{items.length} item{items.length !== 1 ? 's' : ''}</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                      <th className="text-left p-3 font-semibold text-muted-foreground uppercase tracking-wide">Source ID</th>
                      <th className="text-left p-3 font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                      <th className="text-left p-3 font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Notes</th>
                      <th className="text-center p-3 font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((a) => (
                      <tr key={a.id} className={`hover:bg-muted/30 transition-colors ${a.resolved ? 'opacity-50' : ''}`}>
                        <td className="p-3 font-mono text-[10px] text-muted-foreground">{a.sourceId}</td>
                        <td className="p-3 font-semibold max-w-[200px] truncate">{a.name}</td>
                        <td className="p-3 text-muted-foreground hidden sm:table-cell max-w-[300px]">
                          <span className="line-clamp-2">{a.notes}</span>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            disabled={resolving}
                            onClick={() => resolve({ id: a.id, resolved: !a.resolved })}
                            className="px-2.5 py-1 rounded-full text-[10px] font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                            style={a.resolved
                              ? { background: 'oklch(0.5 0.15 145 / 0.12)', color: 'oklch(0.4 0.15 145)' }
                              : { background: 'oklch(0.477 0.216 27.3 / 0.1)', color: 'var(--primary)' }}
                          >
                            {a.resolved ? '✓ Resolved' : 'Open'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
