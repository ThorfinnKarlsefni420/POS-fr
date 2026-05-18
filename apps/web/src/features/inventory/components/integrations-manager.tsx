import { useRef, useState } from 'react';
import {
  useIntegrations, useCreateIntegration, useUpdateIntegration,
  useDeleteIntegration, useSyncIntegration, useSyncLogs,
} from '@/hooks/use-integrations';
import type { Integration, IntegrationType, FieldMapping, SyncLog } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Plus, Loader2, Trash2, RefreshCw, History, CheckCircle, AlertTriangle,
  Webhook, Globe, FileSpreadsheet, Package, ChevronRight, ChevronLeft,
  Copy, Check, ToggleLeft, ToggleRight, X,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────

const INTEGRATION_TYPES: { value: IntegrationType; label: string; icon: typeof Globe; desc: string; color: string }[] = [
  { value: 'CSV',        label: 'CSV / Excel',    icon: FileSpreadsheet, desc: 'Upload a spreadsheet to bulk-update stock and prices.',           color: 'oklch(0.5 0.15 145 / 0.15)' },
  { value: 'WEBHOOK',    label: 'Webhook',         icon: Webhook,         desc: 'Receive real-time pushes from your WMS or supplier system.',      color: 'oklch(0.5 0.15 240 / 0.15)' },
  { value: 'REST_API',   label: 'REST API',        icon: Globe,           desc: 'Poll any HTTP endpoint on demand to pull stock or pricing data.', color: 'oklch(0.75 0.15 60 / 0.2)' },
  { value: 'ODOO',       label: 'Odoo',            icon: Package,         desc: 'Connect to an Odoo ERP inventory module via JSON-RPC.',           color: 'oklch(0.5 0.18 27.3 / 0.15)' },
  { value: 'QUICKBOOKS', label: 'QuickBooks',      icon: Package,         desc: 'Pull product & quantity data from QuickBooks Online.',            color: 'oklch(0.5 0.15 145 / 0.12)' },
  { value: 'SAGE',       label: 'SAGE',            icon: Package,         desc: 'Sync inventory from SAGE Business Cloud or SAGE 300.',            color: 'oklch(0.5 0.15 240 / 0.12)' },
];

const INTERNAL_FIELDS: { value: FieldMapping['internalField']; label: string; desc: string }[] = [
  { value: 'sku',          label: 'SKU',           desc: 'Item identifier — required for matching' },
  { value: 'name',         label: 'Name',          desc: 'Product name' },
  { value: 'currentStock', label: 'Stock Qty',     desc: 'Current stock level (base units)' },
  { value: 'costPrice',    label: 'Cost Price',    desc: 'Buying / landed cost' },
  { value: 'sellingPrice', label: 'Selling Price', desc: 'Retail selling price' },
  { value: 'category',     label: 'Category',      desc: 'Product category' },
  { value: 'unit',         label: 'Unit',          desc: 'Unit label (pcs, kg…)' },
];

function statusStyle(status: SyncLog['status']) {
  if (status === 'SUCCESS') return { bg: 'oklch(0.5 0.15 145 / 0.12)', text: 'oklch(0.4 0.15 145)', label: 'Success' };
  if (status === 'PARTIAL') return { bg: 'oklch(0.75 0.15 60 / 0.15)', text: 'oklch(0.55 0.15 60)',  label: 'Partial' };
  return { bg: 'oklch(0.477 0.216 27.3 / 0.12)', text: 'var(--primary)', label: 'Failed' };
}

// ── Field Mapper ──────────────────────────────────────────────────────────────

interface FieldMapperProps {
  mappings: FieldMapping[];
  onChange: (m: FieldMapping[]) => void;
}

function FieldMapper({ mappings, onChange }: FieldMapperProps) {
  const [newExternal, setNewExternal] = useState('');

  const addRow = () => {
    const field = newExternal.trim();
    if (!field || mappings.some((m) => m.externalField === field)) return;
    onChange([...mappings, { externalField: field, internalField: 'sku', stockMode: 'SET' }]);
    setNewExternal('');
  };

  const update = (idx: number, patch: Partial<FieldMapping>) => {
    const next = mappings.map((m, i) => (i === idx ? { ...m, ...patch } : m));
    onChange(next);
  };

  const remove = (idx: number) => onChange(mappings.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--muted)' }} className="border-b">
              <th className="p-2.5 text-left font-semibold text-muted-foreground">External field name</th>
              <th className="p-2.5 text-left font-semibold text-muted-foreground">Maps to</th>
              <th className="p-2.5 text-left font-semibold text-muted-foreground">Mode</th>
              <th className="p-2.5" />
            </tr>
          </thead>
          <tbody>
            {mappings.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-muted-foreground text-xs">
                  Add at least one field mapping below. Start with <strong>SKU</strong>.
                </td>
              </tr>
            )}
            {mappings.map((m, i) => (
              <tr key={i} className="border-b border-border/40 hover:bg-muted/20">
                <td className="p-2 font-mono text-xs">{m.externalField}</td>
                <td className="p-2">
                  <select
                    value={m.internalField}
                    onChange={(e) => update(i, { internalField: e.target.value as FieldMapping['internalField'] })}
                    className="h-7 rounded border border-input bg-background px-2 text-xs w-full"
                  >
                    {INTERNAL_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </td>
                <td className="p-2">
                  {m.internalField === 'currentStock' ? (
                    <select
                      value={m.stockMode ?? 'SET'}
                      onChange={(e) => update(i, { stockMode: e.target.value as 'SET' | 'ADD' })}
                      className="h-7 rounded border border-input bg-background px-2 text-xs w-20"
                    >
                      <option value="SET">Set</option>
                      <option value="ADD">Add</option>
                    </select>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="p-2">
                  <button onClick={() => remove(i)} className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted">
                    <X className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="External column / field name (e.g. ProductCode)"
          value={newExternal}
          onChange={(e) => setNewExternal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addRow()}
          className="text-xs h-8"
        />
        <button
          onClick={addRow}
          disabled={!newExternal.trim()}
          className="h-8 px-3 rounded-lg border text-xs font-semibold hover:bg-muted disabled:opacity-40 flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>

      <div className="rounded-lg bg-muted/30 border p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground">How to add fields</p>
        <p>Type the exact column header or JSON key from your external data, then choose what it maps to. <strong>SKU is required</strong> — it's used to match items in your inventory.</p>
        <p>For stock: <strong>Set</strong> replaces the current qty; <strong>Add</strong> increments it.</p>
      </div>
    </div>
  );
}

// ── Setup Wizard ──────────────────────────────────────────────────────────────

interface WizardProps {
  onClose: () => void;
}

function SetupWizard({ onClose }: WizardProps) {
  const create = useCreateIntegration();
  const [step, setStep] = useState(0);
  const [type, setType] = useState<IntegrationType | null>(null);
  const [name, setName] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [mappings, setMappings] = useState<FieldMapping[]>([]);

  const setCred = (key: string, val: string) => setCredentials((c) => ({ ...c, [key]: val }));

  const canAdvance = [
    type !== null && name.trim() !== '',
    true, // credentials step — optional for CSV/WEBHOOK
    mappings.some((m) => m.internalField === 'sku'),
  ][step];

  const save = async () => {
    try {
      await create.mutateAsync({
        name: name.trim(),
        type: type!,
        credentials,
        fieldMappings: mappings,
        isActive: true,
      });
      onClose();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {['Type & Name', 'Connection', 'Field Mapping'].map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                i < step ? 'bg-primary text-primary-foreground' : i === step ? 'border-2 border-primary text-primary' : 'border-2 border-muted text-muted-foreground'
              }`}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={`text-xs font-semibold ${i === step ? '' : 'text-muted-foreground'}`}>{label}</span>
            {i < 2 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          </div>
        ))}
      </div>

      {/* Step 0: Type + Name */}
      {step === 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {INTEGRATION_TYPES.map((t) => {
              const Icon = t.icon;
              const selected = type === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => { setType(t.value); if (!name) setName(t.label); }}
                  className={`p-3 rounded-xl border text-left transition-all space-y-1 ${selected ? 'border-primary bg-primary/8' : 'hover:bg-muted'}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: t.color }}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className={`text-xs font-bold ${selected ? 'text-primary' : ''}`}>{t.label}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{t.desc}</p>
                </button>
              );
            })}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Integration name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Morning Stock Import" className="text-sm" />
          </div>
        </div>
      )}

      {/* Step 1: Connection config */}
      {step === 1 && type && (
        <div className="space-y-4">
          {(type === 'CSV') && (
            <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground space-y-2">
              <FileSpreadsheet className="h-8 w-8 mx-auto opacity-30" />
              <p className="text-sm font-semibold">No connection needed for CSV</p>
              <p className="text-xs">You'll upload a CSV file each time you want to sync.</p>
            </div>
          )}

          {type === 'WEBHOOK' && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/30 border p-3 text-xs space-y-1.5">
                <p className="font-semibold">Webhook URL</p>
                <p className="text-muted-foreground">After saving, a secret URL will be generated. Configure your WMS or ERP to POST to it.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Payload envelope key (optional)</Label>
                <Input
                  value={credentials.envelopeKey ?? ''}
                  onChange={(e) => setCred('envelopeKey', e.target.value)}
                  placeholder="e.g. items — leave blank if payload is an array"
                  className="text-sm"
                />
                <p className="text-[10px] text-muted-foreground">If your system sends <code>{`{ "items": [...] }`}</code>, enter <code>items</code> here.</p>
              </div>
            </div>
          )}

          {['REST_API', 'ODOO', 'QUICKBOOKS', 'SAGE'].includes(type) && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">API URL <span className="text-destructive">*</span></Label>
                <Input value={credentials.url ?? ''} onChange={(e) => setCred('url', e.target.value)} placeholder="https://erp.company.com/api/products" className="text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Auth header name</Label>
                  <Input value={credentials.authHeader ?? ''} onChange={(e) => setCred('authHeader', e.target.value)} placeholder="Authorization" className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Auth header value</Label>
                  <Input type="password" value={credentials.authValue ?? ''} onChange={(e) => setCred('authValue', e.target.value)} placeholder="Bearer token…" className="text-sm" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Response path</Label>
                <Input value={credentials.responsePath ?? ''} onChange={(e) => setCred('responsePath', e.target.value)} placeholder="e.g. data.items — leave blank if response is an array" className="text-sm" />
                <p className="text-[10px] text-muted-foreground">Dot-path to navigate to the array of rows in the JSON response.</p>
              </div>
              {type === 'ODOO' && (
                <div className="rounded-lg bg-muted/30 border p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground">Odoo tip</p>
                  <p>Use Odoo's REST API (v16+) or the JSON-RPC endpoint. Set the URL to your <code>/web/dataset/call_kw</code> or a custom export URL, and pass the API key as <code>X-Openerp-Session-Id</code>.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Field mapping */}
      {step === 2 && (
        <div>
          <p className="text-xs text-muted-foreground mb-3">
            Map each external column/field to an internal field. <strong>SKU is required</strong> for matching.
          </p>
          <FieldMapper mappings={mappings} onChange={setMappings} />
        </div>
      )}

      {/* Nav buttons */}
      <div className="flex gap-3 pt-2 border-t">
        <button onClick={step === 0 ? onClose : () => setStep((s) => s - 1)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold hover:bg-muted">
          {step === 0 ? 'Cancel' : <><ChevronLeft className="h-3.5 w-3.5" />Back</>}
        </button>
        <div className="flex-1" />
        {step < 2 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canAdvance}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-sm disabled:opacity-40"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            onClick={save}
            disabled={create.isPending || !canAdvance}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-sm disabled:opacity-40"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Integration
          </button>
        )}
      </div>
    </div>
  );
}

// ── CSV Sync Dialog ───────────────────────────────────────────────────────────

interface CsvSyncProps {
  integration: Integration;
  onClose: () => void;
}

function CsvSyncDialog({ integration, onClose }: CsvSyncProps) {
  const syncMutation = useSyncIntegration();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [result, setResult] = useState<{ rowsSucceeded: number; rowsFailed: number; errors: string[] } | null>(null);
  const [error, setError] = useState('');

  const parseCsv = (text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return null;
    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1, 4).map((line) => {
      const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
      return row;
    });
    return { headers, rows };
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setResult(null);
    const text = await file.text();
    const parsed = parseCsv(text);
    if (!parsed) { setError('Could not parse CSV — ensure the file has a header row.'); return; }
    setPreview(parsed);
  };

  const handleSync = async () => {
    if (!fileRef.current?.files?.[0]) return;
    const text = await fileRef.current.files[0].text();
    try {
      const res = await syncMutation.mutateAsync({ id: integration.id, payload: { csvText: text } });
      setResult(res.result);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      {!result && (
        <>
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors"
          >
            <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-semibold">Click to choose a CSV file</p>
            <p className="text-xs text-muted-foreground mt-1">First row must be headers</p>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />

          {error && <p className="text-xs text-destructive">{error}</p>}

          {preview && (
            <div className="space-y-2">
              <p className="text-xs font-semibold">Preview (first 3 rows)</p>
              <div className="border rounded-lg overflow-auto max-h-48">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--muted)' }} className="border-b">
                      {preview.headers.map((h) => (
                        <th key={h} className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, i) => (
                      <tr key={i} className="border-b border-border/40">
                        {preview.headers.map((h) => (
                          <td key={h} className="p-2 whitespace-nowrap">{row[h]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mapping alignment check */}
              <div className="space-y-1">
                <p className="text-xs font-semibold">Field mapping check</p>
                {integration.fieldMappings.map((m, i) => {
                  const found = preview.headers.includes(m.externalField);
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {found
                        ? <CheckCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />
                        : <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                      <span className={found ? '' : 'text-muted-foreground'}>
                        <strong>{m.externalField}</strong> → {m.internalField}
                        {!found && ' (not found in CSV)'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Processed', val: result.rowsSucceeded + result.rowsFailed, color: 'var(--foreground)' },
              { label: 'Updated', val: result.rowsSucceeded, color: 'oklch(0.4 0.15 145)' },
              { label: 'Failed', val: result.rowsFailed, color: result.rowsFailed > 0 ? 'var(--primary)' : 'var(--muted-foreground)' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border bg-card p-3 text-center">
                <p className="text-2xl font-black" style={{ color: stat.color }}>{stat.val}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
          {result.errors.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1 max-h-32 overflow-y-auto">
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-amber-800">{e}</p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-2 border-t">
        <button onClick={onClose} className="flex-1 py-2 rounded-lg border font-semibold text-sm hover:bg-muted">
          {result ? 'Close' : 'Cancel'}
        </button>
        {!result && (
          <button
            onClick={handleSync}
            disabled={!preview || syncMutation.isPending}
            className="flex-1 py-2 rounded-lg font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            {syncMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Sync Now
          </button>
        )}
      </div>
    </div>
  );
}

// ── Sync Logs Panel ───────────────────────────────────────────────────────────

function SyncLogsPanel({ integrationId }: { integrationId: string }) {
  const { data: logs = [], isLoading } = useSyncLogs(integrationId);

  if (isLoading) return <div className="py-4 text-center text-sm text-muted-foreground">Loading…</div>;
  if (logs.length === 0) return <div className="py-4 text-center text-sm text-muted-foreground">No sync history yet.</div>;

  return (
    <div className="border rounded-xl overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: 'var(--muted)' }} className="border-b">
            <th className="p-3 text-left font-semibold text-muted-foreground">Date</th>
            <th className="p-3 text-left font-semibold text-muted-foreground">Status</th>
            <th className="p-3 text-right font-semibold text-muted-foreground">Processed</th>
            <th className="p-3 text-right font-semibold text-muted-foreground">Updated</th>
            <th className="p-3 text-right font-semibold text-muted-foreground">Failed</th>
            <th className="p-3 text-left font-semibold text-muted-foreground">Notes</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => {
            const s = statusStyle(log.status);
            return (
              <tr key={log.id} className="border-b border-border/40 hover:bg-muted/20">
                <td className="p-3 text-muted-foreground whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="p-3">
                  <span className="px-2 py-0.5 rounded-full font-bold text-[10px]" style={{ background: s.bg, color: s.text }}>
                    {s.label}
                  </span>
                </td>
                <td className="p-3 text-right font-mono">{log.rowsProcessed}</td>
                <td className="p-3 text-right font-mono" style={{ color: 'oklch(0.4 0.15 145)' }}>{log.rowsSucceeded}</td>
                <td className="p-3 text-right font-mono" style={{ color: log.rowsFailed > 0 ? 'var(--primary)' : undefined }}>{log.rowsFailed}</td>
                <td className="p-3 text-muted-foreground max-w-xs truncate">{log.errorMessage ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Webhook URL display ───────────────────────────────────────────────────────

function WebhookUrl({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin.replace(':5173', ':3001')}/api/integrations/webhook/${secret}`;

  const copy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2 bg-muted/40 border rounded-lg px-3 py-2">
      <code className="text-[10px] flex-1 truncate">{url}</code>
      <button onClick={copy} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
        {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ── Integration Card ──────────────────────────────────────────────────────────

interface CardProps {
  integration: Integration;
}

function IntegrationCard({ integration }: CardProps) {
  const updateMutation = useUpdateIntegration();
  const deleteMutation = useDeleteIntegration();
  const syncMutation = useSyncIntegration();
  const [showLogs, setShowLogs] = useState(false);
  const [showCsvSync, setShowCsvSync] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const typeInfo = INTEGRATION_TYPES.find((t) => t.value === integration.type)!;
  const Icon = typeInfo?.icon ?? Package;

  const triggerRestSync = async () => {
    try {
      await syncMutation.mutateAsync({ id: integration.id, payload: {} });
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <>
      <div className="rounded-xl border bg-card p-4 space-y-3 hover:shadow-sm transition-shadow">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: typeInfo?.color ?? 'var(--muted)' }}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm truncate">{integration.name}</p>
              <p className="text-[10px] text-muted-foreground">{typeInfo?.label ?? integration.type}</p>
            </div>
          </div>
          <button
            onClick={() => updateMutation.mutate({ id: integration.id, data: { isActive: !integration.isActive } })}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            title={integration.isActive ? 'Deactivate' : 'Activate'}
          >
            {integration.isActive
              ? <ToggleRight className="h-5 w-5 text-green-600" />
              : <ToggleLeft className="h-5 w-5" />}
          </button>
        </div>

        {integration.type === 'WEBHOOK' && integration.webhookSecret && (
          <WebhookUrl secret={integration.webhookSecret} />
        )}

        {integration.type !== 'WEBHOOK' && integration.credentials.url && (
          <p className="text-[10px] text-muted-foreground truncate font-mono">{integration.credentials.url}</p>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs border-t pt-2">
          <div>
            <p className="text-muted-foreground">Last sync</p>
            <p className="font-semibold">
              {integration.lastSyncAt
                ? new Date(integration.lastSyncAt).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                : 'Never'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Field mappings</p>
            <p className="font-semibold">{integration.fieldMappings.length} fields</p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {integration.type === 'CSV' && (
            <button
              onClick={() => setShowCsvSync(true)}
              disabled={syncMutation.isPending}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold flex-1"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              {syncMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Upload & Sync
            </button>
          )}
          {['REST_API', 'ODOO', 'QUICKBOOKS', 'SAGE'].includes(integration.type) && (
            <button
              onClick={triggerRestSync}
              disabled={syncMutation.isPending}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold flex-1"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              {syncMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Sync Now
            </button>
          )}
          {integration.type === 'WEBHOOK' && (
            <div className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-center bg-muted/50 text-muted-foreground">
              Receives pushes automatically
            </div>
          )}
          <button
            onClick={() => setShowLogs(!showLogs)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${showLogs ? 'bg-primary/10 border-primary text-primary' : 'hover:bg-muted'}`}
          >
            <History className="h-3 w-3" />
            Logs
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {showLogs && (
          <div className="border-t pt-3">
            <SyncLogsPanel integrationId={integration.id} />
          </div>
        )}
      </div>

      {/* CSV sync dialog */}
      <Dialog open={showCsvSync} onOpenChange={setShowCsvSync}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-black">Upload CSV — {integration.name}</DialogTitle>
          </DialogHeader>
          <CsvSyncDialog integration={integration} onClose={() => setShowCsvSync(false)} />
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle className="font-black">Delete Integration</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete <strong>{integration.name}</strong>? This will remove all sync logs. This action cannot be undone.</p>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 rounded-lg border font-semibold text-sm hover:bg-muted">Cancel</button>
            <button
              onClick={async () => { await deleteMutation.mutateAsync(integration.id); setConfirmDelete(false); }}
              disabled={deleteMutation.isPending}
              className="flex-1 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── IntegrationsManager (top-level export) ────────────────────────────────────

export function IntegrationsManager() {
  const { data: integrations = [], isLoading } = useIntegrations();
  const [wizardOpen, setWizardOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading integrations…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-black text-lg">Warehouse Integrations</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Connect external WMS, ERP, or supplier systems to sync stock levels and pricing automatically.
          </p>
        </div>
        <button
          onClick={() => setWizardOpen(true)}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Integration
        </button>
      </div>

      {integrations.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center space-y-3 text-muted-foreground">
          <Globe className="h-10 w-10 mx-auto opacity-20" />
          <p className="text-sm font-semibold">No integrations yet</p>
          <p className="text-xs">Add a CSV import, webhook, or REST API connector to sync stock from your warehouse or supplier.</p>
          <button
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center gap-1.5 mt-2 px-4 py-2 rounded-lg text-xs font-bold"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            <Plus className="h-3.5 w-3.5" /> Add First Integration
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {integrations.map((integration) => (
            <IntegrationCard key={integration.id} integration={integration} />
          ))}
        </div>
      )}

      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-black">New Integration</DialogTitle>
          </DialogHeader>
          <SetupWizard onClose={() => setWizardOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
