import { Download } from 'lucide-react';
import { useSalesReport } from '../hooks/use-reports';
import { api } from '@/lib/api';

function kes(n: number) {
  return `KES ${n.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}

const PAYMENT_COLORS: Record<string, string> = {
  CASH: 'oklch(0.55 0.15 145)',
  CARD: 'oklch(0.55 0.15 260)',
  MPESA: 'oklch(0.55 0.18 155)',
  CREDIT: 'oklch(0.65 0.15 50)',
};

interface Props { from: string; to: string; }

export function SalesReport({ from, to }: Props) {
  const { data, isLoading } = useSalesReport(from, to);

  if (isLoading) return <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">Loading sales data…</div>;
  if (!data) return null;

  const { totalRevenue, transactionCount, avgTransaction, paymentBreakdown, topProducts, daily } = data;
  const payTotal = Object.values(paymentBreakdown).reduce((s, v) => s + v, 0);
  const maxDayRevenue = Math.max(...daily.map(d => d.revenue), 1);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Revenue', value: kes(totalRevenue) },
          { label: 'Transactions', value: transactionCount.toLocaleString() },
          { label: 'Avg / Transaction', value: kes(avgTransaction) },
        ].map(card => (
          <div key={card.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="text-xl font-black mt-1" style={{ color: 'var(--primary)' }}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Payment breakdown */}
      {payTotal > 0 && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold">Payment Breakdown</p>
          {Object.entries(paymentBreakdown).filter(([, v]) => v > 0).map(([method, amount]) => (
            <div key={method} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-medium">{method}</span>
                <span className="text-muted-foreground">{kes(amount)} · {((amount / payTotal) * 100).toFixed(1)}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(amount / payTotal) * 100}%`, background: PAYMENT_COLORS[method] ?? 'var(--primary)' }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Daily chart */}
      {daily.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm font-semibold mb-3">Daily Revenue</p>
          <div className="flex items-end gap-1 h-28 overflow-x-auto pb-5">
            {daily.map(d => {
              const barH = Math.max((d.revenue / maxDayRevenue) * 96, 2);
              return (
                <div key={d.date} className="flex flex-col items-center shrink-0 group relative">
                  <div
                    className="w-5 rounded-t cursor-default"
                    style={{ height: `${barH}px`, background: 'var(--primary)', opacity: 0.75 }}
                  />
                  <span className="absolute bottom-0 text-[8px] text-muted-foreground">{d.date.slice(5)}</span>
                  <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col items-center pointer-events-none z-10">
                    <div className="bg-popover border rounded-lg px-2 py-1 text-xs font-medium shadow-md whitespace-nowrap">
                      {d.date}<br />{kes(d.revenue)}<br />{d.transactions} txn{d.transactions !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top products */}
      {topProducts.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="p-4 border-b">
            <p className="text-sm font-semibold">Top Products</p>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b" style={{ background: 'var(--muted)' }}>
                <th className="text-left p-3 font-semibold">#</th>
                <th className="text-left p-3 font-semibold">Product</th>
                <th className="text-left p-3 font-semibold">Category</th>
                <th className="text-right p-3 font-semibold">Qty Sold</th>
                <th className="text-right p-3 font-semibold">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {topProducts.map((p, i) => (
                <tr key={i} className="hover:bg-muted/30">
                  <td className="p-3 text-muted-foreground font-mono">{i + 1}</td>
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3 text-muted-foreground">{p.category || '—'}</td>
                  <td className="p-3 text-right">{Number(p.qty).toLocaleString()}</td>
                  <td className="p-3 text-right font-bold" style={{ color: 'var(--primary)' }}>{kes(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {transactionCount === 0 && (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground rounded-xl border border-dashed">
          No sales in this period
        </div>
      )}

      {/* Export */}
      <div className="flex justify-end">
        <a
          href={api.reports.exportSalesCsvUrl(from, to)}
          download
          className="flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-semibold hover:bg-muted transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </a>
      </div>
    </div>
  );
}
