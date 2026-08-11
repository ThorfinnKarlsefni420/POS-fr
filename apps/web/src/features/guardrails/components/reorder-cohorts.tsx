import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useCohorts, useSaveCohort, useDeleteCohort } from '../hooks/use-guardrails';
import { currentWeekStart, formatDate } from '../lib/dates';
import { Input } from '@/components/ui/input';
import type { GuardrailCohort } from '@/lib/api';

const EMPTY = {
  cohortStartDate: currentWeekStart(),
  newCustomersInCohort: '',
  reorderedCount: '',
  notes: '',
};

function pct(n: number | null) {
  return n === null ? '—' : `${n.toFixed(1)}%`;
}

export function ReorderCohorts() {
  const { data: cohorts, isLoading } = useCohorts();
  const saveMutation = useSaveCohort();
  const deleteMutation = useDeleteCohort();
  const [form, setForm] = useState(EMPTY);

  const setField = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const loadCohort = (cohort: GuardrailCohort) => {
    setForm({
      cohortStartDate: cohort.cohortStartDate,
      newCustomersInCohort: String(cohort.newCustomersInCohort),
      reorderedCount: cohort.reorderedCount === null ? '' : String(cohort.reorderedCount),
      notes: cohort.notes ?? '',
    });
  };

  const handleSave = () => {
    saveMutation.mutate({
      cohortStartDate: form.cohortStartDate,
      newCustomersInCohort: Number(form.newCustomersInCohort) || 0,
      reorderedCount: form.reorderedCount === '' ? null : Number(form.reorderedCount),
      notes: form.notes || undefined,
    }, { onSuccess: () => setForm(EMPTY) });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold">Add / update a cohort</p>
        <p className="text-xs text-muted-foreground">
          Enter new customers when the week closes. Once day-60 has passed, come back and enter how many placed a second order —
          check the mobile app admin portal's Orders/Customers pages for these counts.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Cohort week starting (Mon)">
            <Input type="date" value={form.cohortStartDate} onChange={setField('cohortStartDate')} />
          </Field>
          <Field label="New Customers in Cohort">
            <Input type="number" value={form.newCustomersInCohort} onChange={setField('newCustomersInCohort')} placeholder="0" />
          </Field>
          <Field label="Reordered by Day 60 (leave blank until then)">
            <Input type="number" value={form.reorderedCount} onChange={setField('reorderedCount')} placeholder="—" />
          </Field>
        </div>
        <Field label="Notes (optional)">
          <Input type="text" value={form.notes} onChange={setField('notes')} placeholder="Any context for this cohort…" />
        </Field>

        <div className="flex justify-end gap-2">
          <button onClick={() => setForm(EMPTY)} className="text-xs font-semibold px-3 py-2 rounded-lg border hover:bg-muted transition-colors">
            Clear
          </button>
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending || !form.cohortStartDate}
            className="text-xs font-semibold px-3 py-2 rounded-lg text-white transition-colors disabled:opacity-50"
            style={{ background: 'var(--primary)' }}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save Cohort'}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Loading…</div>
      ) : !cohorts || cohorts.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground rounded-xl border border-dashed">
          No cohorts tracked yet
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b" style={{ background: 'var(--muted)' }}>
                <th className="text-left p-3 font-semibold">Cohort Start</th>
                <th className="text-left p-3 font-semibold">Day-60 Date</th>
                <th className="text-right p-3 font-semibold">New Customers</th>
                <th className="text-right p-3 font-semibold">Reordered</th>
                <th className="text-right p-3 font-semibold">Reorder Rate</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {cohorts.map((ch) => (
                <tr key={ch.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => loadCohort(ch)}>
                  <td className="p-3 font-medium">{formatDate(ch.cohortStartDate)}</td>
                  <td className="p-3">
                    {formatDate(ch.day60Date)}
                    {!ch.day60Passed && <span className="ml-1.5 text-[10px] text-muted-foreground">(pending)</span>}
                  </td>
                  <td className="p-3 text-right">{ch.newCustomersInCohort}</td>
                  <td className="p-3 text-right">{ch.reorderedCount ?? '—'}</td>
                  <td className="p-3 text-right font-bold" style={{ color: 'var(--primary)' }}>{pct(ch.reorderRatePct)}</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={(ev) => { ev.stopPropagation(); deleteMutation.mutate(ch.id); }}
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
