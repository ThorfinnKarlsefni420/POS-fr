import { useShiftsReport } from '../hooks/use-reports';

function kes(n: number) {
  return `KES ${n.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}

function duration(start: string, end: string | null) {
  if (!end) return <span className="text-amber-600 font-semibold text-xs">In progress</span>;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return <span>{h}h {m}m</span>;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-KE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface Props { from: string; to: string; }

export function ShiftReport({ from, to }: Props) {
  const { data, isLoading } = useShiftsReport(from, to);

  if (isLoading) return <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">Loading shift data…</div>;
  if (!data) return null;

  const { shifts } = data;

  if (shifts.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground rounded-xl border border-dashed">
        No shifts in this period
      </div>
    );
  }

  const totalSales = shifts.reduce((s, sh) => s + sh.totalSales, 0);
  const totalShifts = shifts.filter(sh => sh.endTime).length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Completed Shifts', value: totalShifts },
          { label: 'Total Revenue', value: kes(totalSales) },
          { label: 'Avg Revenue / Shift', value: totalShifts > 0 ? kes(totalSales / totalShifts) : '—' },
        ].map(card => (
          <div key={card.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="text-xl font-black mt-1" style={{ color: 'var(--primary)' }}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Shifts table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b" style={{ background: 'var(--muted)' }}>
              <th className="text-left p-3 font-semibold">Cashier</th>
              <th className="text-left p-3 font-semibold">Start</th>
              <th className="text-left p-3 font-semibold">Duration</th>
              <th className="text-right p-3 font-semibold">Txns</th>
              <th className="text-right p-3 font-semibold">Total Sales</th>
              <th className="text-right p-3 font-semibold">Expected Cash</th>
              <th className="text-right p-3 font-semibold">Actual Cash</th>
              <th className="text-right p-3 font-semibold">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shifts.map(sh => {
              const varColor = sh.variance === null ? '' : sh.variance >= 0 ? 'oklch(0.5 0.15 145)' : 'oklch(0.55 0.2 25)';
              return (
                <tr key={sh.id} className="hover:bg-muted/30">
                  <td className="p-3 font-medium">{sh.user}</td>
                  <td className="p-3 text-muted-foreground">{fmtDate(sh.startTime)}</td>
                  <td className="p-3 text-muted-foreground">{duration(sh.startTime, sh.endTime)}</td>
                  <td className="p-3 text-right">{sh.transactionCount}</td>
                  <td className="p-3 text-right font-semibold">{kes(sh.totalSales)}</td>
                  <td className="p-3 text-right text-muted-foreground">{kes(sh.expectedCash)}</td>
                  <td className="p-3 text-right">{sh.actualCash !== null ? kes(sh.actualCash) : '—'}</td>
                  <td className="p-3 text-right font-bold" style={{ color: varColor }}>
                    {sh.variance !== null ? `${sh.variance >= 0 ? '+' : ''}${kes(sh.variance)}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cash detail cards for closed shifts with variance */}
      {shifts.filter(sh => sh.variance !== null && sh.variance !== 0).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cash Discrepancies</p>
          {shifts.filter(sh => sh.variance !== null && sh.variance !== 0).map(sh => (
            <div key={sh.id} className="rounded-xl border p-4 text-xs space-y-2" style={{ borderColor: (sh.variance ?? 0) < 0 ? 'oklch(0.55 0.2 25 / 0.4)' : 'oklch(0.5 0.15 145 / 0.4)' }}>
              <div className="flex justify-between items-center">
                <span className="font-semibold">{sh.user} · {fmtDate(sh.startTime)}</span>
                <span className="font-black" style={{ color: (sh.variance ?? 0) < 0 ? 'oklch(0.55 0.2 25)' : 'oklch(0.5 0.15 145)' }}>
                  {(sh.variance ?? 0) >= 0 ? '+' : ''}{kes(sh.variance ?? 0)}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-muted-foreground">
                <div><p>Starting</p><p className="font-medium text-foreground">{kes(sh.startingCash)}</p></div>
                <div><p>Cash Sales</p><p className="font-medium text-foreground">{kes(sh.cashSales)}</p></div>
                <div><p>Pay-ins</p><p className="font-medium text-foreground">{kes(sh.payIns)}</p></div>
                <div><p>Pay-outs</p><p className="font-medium text-foreground">{kes(sh.payOuts)}</p></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
