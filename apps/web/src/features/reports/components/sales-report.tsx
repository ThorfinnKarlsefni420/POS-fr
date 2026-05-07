import { FileText, Download } from 'lucide-react';
import { useSalesReport } from '../hooks/use-reports';
import { useAuthStore } from '@/features/auth/store/use-auth-store';
import { api } from '@/lib/api';

function kes(n: number) {
  return `KES ${n.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}

const PAYMENT_COLORS: Record<string, string> = {
  CASH: 'oklch(0.55 0.15 145)',
};

interface Props { from: string; to: string; }

export function SalesReport({ from, to }: Props) {
  const { data, isLoading } = useSalesReport(from, to);
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';

  const handleExportCsv = () => {
    api.reports.exportCsv(`/reports/sales/export?from=${from}&to=${to}`, `sales-${from}-${to}.csv`);
  };

  const handleExportPDF = () => {
    if (!data) return;
    const { totalRevenue, transactionCount, avgTransaction, topProducts, daily } = data;
    const rows = topProducts.map((p, i) => `
      <tr>
        <td>${i + 1}</td><td>${p.name}</td><td>${p.category || '—'}</td>
        <td style="text-align:right">${Number(p.qty).toLocaleString()}</td>
        <td style="text-align:right;font-weight:bold">${kes(p.revenue)}</td>
      </tr>`).join('');
    const dailyRows = daily.map(d => `
      <tr><td>${d.date}</td><td style="text-align:right">${kes(d.revenue)}</td><td style="text-align:right">${d.transactions}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><title>Sales Report ${from} to ${to}</title>
    <style>
      body{font-family:sans-serif;font-size:12px;color:#111;padding:32px}
      h1{font-size:20px;margin:0 0 4px}
      .sub{color:#666;margin-bottom:24px}
      .cards{display:flex;gap:16px;margin-bottom:24px}
      .card{flex:1;border:1px solid #e5e5e5;border-radius:8px;padding:12px}
      .card-label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.05em}
      .card-value{font-size:22px;font-weight:900;color:#ea580c;margin-top:2px}
      table{width:100%;border-collapse:collapse;margin-bottom:24px}
      th{background:#f5f5f5;padding:8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
      td{padding:7px 8px;border-bottom:1px solid #f0f0f0}
      h2{font-size:13px;font-weight:700;margin:0 0 8px;text-transform:uppercase;letter-spacing:.05em;color:#555}
      @media print{body{padding:0}}
    </style></head><body>
    <h1>Sales Report</h1>
    <p class="sub">${from} &rarr; ${to}</p>
    <div class="cards">
      <div class="card"><div class="card-label">Total Revenue</div><div class="card-value">${kes(totalRevenue)}</div></div>
      <div class="card"><div class="card-label">Transactions</div><div class="card-value">${transactionCount}</div></div>
      <div class="card"><div class="card-label">Avg / Transaction</div><div class="card-value">${kes(avgTransaction)}</div></div>
    </div>
    ${topProducts.length > 0 ? `<h2>Top Products</h2>
    <table><thead><tr><th>#</th><th>Product</th><th>Category</th><th style="text-align:right">Qty</th><th style="text-align:right">Revenue</th></tr></thead>
    <tbody>${rows}</tbody></table>` : ''}
    ${daily.length > 0 ? `<h2>Daily Breakdown</h2>
    <table><thead><tr><th>Date</th><th style="text-align:right">Revenue</th><th style="text-align:right">Transactions</th></tr></thead>
    <tbody>${dailyRows}</tbody></table>` : ''}
    <script>window.onload=()=>{window.print()}</script>
    </body></html>`;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

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
        {isAdmin ? (
          <button
            onClick={handleExportCsv}
            disabled={!data || transactionCount === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        ) : (
          <button
            onClick={handleExportPDF}
            disabled={!data || transactionCount === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-50"
          >
            <FileText className="h-3.5 w-3.5" />
            Export PDF
          </button>
        )}
      </div>
    </div>
  );
}
