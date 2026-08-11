import { useState } from 'react';
import { Wand2, Trash2, Loader2 } from 'lucide-react';
import { useWeeklyEntries, useSaveWeeklyEntry, useDeleteWeeklyEntry } from '../hooks/use-guardrails';
import { currentWeekStart, formatDate } from '../lib/dates';
import { api, GuardrailWeeklyEntry } from '@/lib/api';
import { Input } from '@/components/ui/input';

const EMPTY = {
  weekStart: currentWeekStart(),
  revenue: '',
  cogs: '',
  avgInventoryValue: '',
  deliverySubsidyCost: '',
  marketingSpend: '',
  firstOrderRevenue: '',
  newCustomers: '',
  notes: '',
};

function kes(n: number | null) {
  if (n === null) return '—';
  return `KES ${n.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}

function pct(n: number | null) {
  return n === null ? '—' : `${n.toFixed(1)}%`;
}

export function WeeklyTracker() {
  const { data: entries, isLoading } = useWeeklyEntries();
  const saveMutation = useSaveWeeklyEntry();
  const deleteMutation = useDeleteWeeklyEntry();
  const [form, setForm] = useState(EMPTY);
  const [prefilling, setPrefilling] = useState(false);

  const setField = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const loadEntry = (entry: GuardrailWeeklyEntry) => {
    setForm({
      weekStart: entry.weekStart,
      revenue: String(entry.revenue),
      cogs: String(entry.cogs),
      avgInventoryValue: String(entry.avgInventoryValue),
      deliverySubsidyCost: String(entry.deliverySubsidyCost),
      marketingSpend: String(entry.marketingSpend),
      firstOrderRevenue: String(entry.firstOrderRevenue),
      newCustomers: String(entry.newCustomers),
      notes: entry.notes ?? '',
    });
  };

  const handlePrefill = async () => {
    setPrefilling(true);
    try {
      const { revenue, cogs } = await api.guardrails.prefillWeekly(form.weekStart);
      setForm((f) => ({ ...f, revenue: String(revenue), cogs: String(cogs) }));
    } finally {
      setPrefilling(false);
    }
  };

  const handleSave = () => {
    saveMutation.mutate({
      weekStart: form.weekStart,
      revenue: Number(form.revenue) || 0,
      cogs: Number(form.cogs) || 0,
      avgInventoryValue: Number(form.avgInventoryValue) || 0,
      deliverySubsidyCost: Number(form.deliverySubsidyCost) || 0,
      marketingSpend: Number(form.marketingSpend) || 0,
      firstOrderRevenue: Number(form.firstOrderRevenue) || 0,
      newCustomers: Number(form.newCustomers) || 0,
      notes: form.notes || undefined,
    }, { onSuccess: () => setForm(EMPTY) });
  };

  return (
    <div className="space-y-6">
      {/* Entry form */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Add / update a week</p>
          <button
            onClick={handlePrefill}
            disabled={prefilling}
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border hover:bg-muted transition-colors disabled:opacity-50"
          >
            {prefilling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            Prefill Revenue/COGS from POS
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Week starting (Mon)">
            <Input type="date" value={form.weekStart} onChange={setField('weekStart')} />
          </Field>
          <Field label="Revenue (KES)">
            <Input type="number" value={form.revenue} onChange={setField('revenue')} placeholder="0" />
          </Field>
          <Field label="COGS (KES)">
            <Input type="number" value={form.cogs} onChange={setField('cogs')} placeholder="0" />
          </Field>
          <Field label="Avg Inventory Value (KES)">
            <Input type="number" value={form.avgInventoryValue} onChange={setField('avgInventoryValue')} placeholder="0" />
          </Field>
          <Field label="Delivery Subsidy Cost (KES)">
            <Input type="number" value={form.deliverySubsidyCost} onChange={setField('deliverySubsidyCost')} placeholder="0" />
          </Field>
          <Field label="Marketing Spend (KES)">
            <Input type="number" value={form.marketingSpend} onChange={setField('marketingSpend')} placeholder="0" />
          </Field>
          <Field label="First-Order Revenue (KES)">
            <Input type="number" value={form.firstOrderRevenue} onChange={setField('firstOrderRevenue')} placeholder="0" />
          </Field>
          <Field label="New Customers Acquired">
            <Input type="number" value={form.newCustomers} onChange={setField('newCustomers')} placeholder="0" />
          </Field>
        </div>
        <Field label="Notes (optional)">
          <Input type="text" value={form.notes} onChange={setField('notes')} placeholder="Any context for this week…" />
        </Field>

        <div className="flex justify-end gap-2">
          <button onClick={() => setForm(EMPTY)} className="text-xs font-semibold px-3 py-2 rounded-lg border hover:bg-muted transition-colors">
            Clear
          </button>
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending || !form.weekStart}
            className="text-xs font-semibold px-3 py-2 rounded-lg text-white transition-colors disabled:opacity-50"
            style={{ background: 'var(--primary)' }}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save Week'}
          </button>
        </div>
      </div>

      {/* Entries table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Loading…</div>
      ) : !entries || entries.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground rounded-xl border border-dashed">
          No weeks tracked yet
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b" style={{ background: 'var(--muted)' }}>
                <th className="text-left p-3 font-semibold">Week</th>
                <th className="text-right p-3 font-semibold">Revenue</th>
                <th className="text-right p-3 font-semibold">Margin</th>
                <th className="text-right p-3 font-semibold">Inv. Days</th>
                <th className="text-right p-3 font-semibold">Subsidy %</th>
                <th className="text-right p-3 font-semibold">Marketing %</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => loadEntry(e)}>
                  <td className="p-3 font-medium">{formatDate(e.weekStart)}</td>
                  <td className="p-3 text-right">{kes(e.revenue)}</td>
                  <td className="p-3 text-right font-bold" style={{ color: 'var(--primary)' }}>{pct(e.marginPct)}</td>
                  <td className="p-3 text-right">{e.inventoryDays === null ? '—' : e.inventoryDays.toFixed(1)}</td>
                  <td className="p-3 text-right">{pct(e.subsidyPct)}</td>
                  <td className="p-3 text-right">{pct(e.marketingPct)}</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={(ev) => { ev.stopPropagation(); deleteMutation.mutate(e.id); }}
                      className="p-1 rounded hover:bg-destructive/10 text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
