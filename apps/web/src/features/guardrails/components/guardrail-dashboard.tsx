import { useGuardrailDashboard } from '../hooks/use-guardrails';
import { formatDate } from '../lib/dates';
import type { GuardrailStatus } from '@/lib/api';

const STATUS_STYLE: Record<GuardrailStatus, { label: string; bg: string; fg: string }> = {
  on_target: { label: 'On Target', bg: 'oklch(0.65 0.15 145 / 0.12)', fg: 'oklch(0.5 0.15 145)' },
  watch: { label: 'Watch', bg: 'oklch(0.75 0.15 80 / 0.15)', fg: 'oklch(0.55 0.15 80)' },
  off_target: { label: 'Off Target', bg: 'oklch(0.6 0.2 27 / 0.12)', fg: 'oklch(0.5 0.2 27)' },
  pending: { label: 'Pending', bg: 'var(--muted)', fg: 'var(--muted-foreground)' },
};

function fmtValue(v: number | null, suffix: string) {
  if (v === null) return '—';
  return `${v.toLocaleString('en-KE', { maximumFractionDigits: 1 })}${suffix}`;
}

export function GuardrailDashboard() {
  const { data, isLoading } = useGuardrailDashboard();

  if (isLoading) return <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">Loading guardrails…</div>;
  if (!data) return null;

  const { latestWeek, latestCohort, guardrails } = data;
  const suffix: Record<string, string> = {
    margin: '%', inventoryDays: ' days', subsidy: '%', marketing: '%', reorder: '%',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>Latest completed week: <strong className="text-foreground">{latestWeek ? formatDate(latestWeek.weekStart) : 'No data yet'}</strong></span>
        <span>Latest completed cohort: <strong className="text-foreground">{latestCohort ? formatDate(latestCohort.cohortStartDate) : 'No data yet'}</strong></span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {guardrails.map((g) => {
          const style = STATUS_STYLE[g.status];
          return (
            <div key={g.key} className="rounded-xl border bg-card p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-muted-foreground leading-tight">{g.label}</p>
                <span
                  className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={{ background: style.bg, color: style.fg }}
                >
                  {style.label}
                </span>
              </div>
              <p className="text-2xl font-black" style={{ color: 'var(--primary)' }}>
                {fmtValue(g.latest, suffix[g.key])}
              </p>
              <div className="text-[11px] text-muted-foreground space-y-0.5">
                <p>Target: {g.target}</p>
                <p>4-wk avg: {fmtValue(g.rollingAvg, suffix[g.key])}</p>
              </div>
            </div>
          );
        })}
      </div>

      {!latestWeek && (
        <div className="flex items-center justify-center h-24 text-sm text-muted-foreground rounded-xl border border-dashed">
          Add a row in the Weekly Tracker tab to see guardrails here.
        </div>
      )}
    </div>
  );
}
