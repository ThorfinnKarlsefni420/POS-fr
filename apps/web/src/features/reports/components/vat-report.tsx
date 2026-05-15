import { AlertTriangle, CheckCircle } from 'lucide-react';
import { useVatReport } from '../hooks/use-reports';

function kes(n: number) {
  return `KES ${n.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}

function fmt(n: number) {
  return `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Props { from: string; to: string }

export function VatReport({ from, to }: Props) {
  const { data, isLoading } = useVatReport(from, to);

  if (isLoading) return <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">Loading VAT data…</div>;
  if (!data) return null;

  const {
    transactionCount, totalOutputVat, totalTaxableSales,
    totalZeroRated, totalExempt, netVatPayable, pendingEtims,
    byCategory, byMonth,
  } = data;

  const totalSales = totalTaxableSales + totalZeroRated + totalExempt;
  const taxableNet = totalTaxableSales - totalOutputVat;

  return (
    <div className="space-y-6">

      {/* eTIMS pending alert */}
      {pendingEtims > 0 && (
        <div className="flex items-start gap-3 rounded-xl border p-4" style={{ borderColor: 'oklch(0.65 0.15 50 / 0.4)', background: 'oklch(0.65 0.15 50 / 0.06)' }}>
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'oklch(0.55 0.18 50)' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'oklch(0.45 0.15 50)' }}>
              {pendingEtims} transaction{pendingEtims !== 1 ? 's' : ''} not yet submitted to eTIMS
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Submit before the 20th of next month to avoid KRA penalties.
            </p>
          </div>
        </div>
      )}
      {pendingEtims === 0 && transactionCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border p-4" style={{ borderColor: 'oklch(0.5 0.15 145 / 0.4)', background: 'oklch(0.5 0.15 145 / 0.06)' }}>
          <CheckCircle className="h-4 w-4 shrink-0" style={{ color: 'oklch(0.45 0.14 145)' }} />
          <p className="text-sm font-semibold" style={{ color: 'oklch(0.4 0.13 145)' }}>All transactions submitted to eTIMS</p>
        </div>
      )}

      {/* VAT return summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Output VAT (16%)', value: fmt(totalOutputVat), sub: `on ${kes(totalTaxableSales)} taxable sales` },
          { label: 'Zero-Rated Sales', value: kes(totalZeroRated), sub: '[Z] — 0% VAT' },
          { label: 'Exempt Sales', value: kes(totalExempt), sub: '[E] — 0% VAT' },
          { label: 'Net VAT Payable', value: fmt(netVatPayable), sub: 'due by 20th next month', highlight: true },
        ].map(card => (
          <div key={card.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="text-xl font-black mt-1" style={{ color: card.highlight ? 'oklch(0.55 0.2 25)' : 'var(--primary)' }}>
              {card.value}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* KRA VAT return breakdown */}
      <div className="rounded-xl border bg-card">
        <div className="p-4 border-b">
          <p className="text-sm font-semibold">VAT Return Summary</p>
          <p className="text-xs text-muted-foreground mt-0.5">Format: iTax VAT3 return — {transactionCount} transactions</p>
        </div>
        <div className="p-4 space-y-2 text-xs">
          <div className="flex justify-between py-1.5 border-b">
            <span className="text-muted-foreground">Total Sales (all classes)</span>
            <span className="font-semibold">{fmt(totalSales)}</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-muted-foreground">(A) Standard-Rated — Taxable Sales (incl. VAT)</span>
            <span className="font-semibold">{fmt(totalTaxableSales)}</span>
          </div>
          <div className="flex justify-between py-1.5 pl-4">
            <span className="text-muted-foreground">Net Taxable (excl. VAT)</span>
            <span>{fmt(taxableNet)}</span>
          </div>
          <div className="flex justify-between py-1.5 pl-4 font-semibold" style={{ color: 'oklch(0.55 0.2 25)' }}>
            <span>Output VAT 16%</span>
            <span>{fmt(totalOutputVat)}</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-muted-foreground">(B) Zero-Rated Sales</span>
            <span className="font-semibold">{fmt(totalZeroRated)}</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-muted-foreground">(C) Exempt Sales</span>
            <span className="font-semibold">{fmt(totalExempt)}</span>
          </div>
          <div className="flex justify-between py-2 border-t mt-1 font-black text-sm" style={{ color: 'oklch(0.55 0.2 25)' }}>
            <span>Net VAT Payable to KRA</span>
            <span>{fmt(netVatPayable)}</span>
          </div>
          <p className="text-[10px] text-muted-foreground pt-1">
            Note: Input VAT claimable on Zero-Rated supplier invoices will reduce net payable once supplier invoice tracking is enabled.
          </p>
        </div>
      </div>

      {/* Monthly breakdown */}
      {byMonth.length > 1 && (
        <div className="rounded-xl border bg-card">
          <div className="p-4 border-b">
            <p className="text-sm font-semibold">Monthly Breakdown</p>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b" style={{ background: 'var(--muted)' }}>
                <th className="text-left p-3 font-semibold">Month</th>
                <th className="text-right p-3 font-semibold">Transactions</th>
                <th className="text-right p-3 font-semibold">Taxable Sales</th>
                <th className="text-right p-3 font-semibold">Output VAT</th>
                <th className="text-right p-3 font-semibold">Zero-Rated</th>
                <th className="text-right p-3 font-semibold">Exempt</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {byMonth.map(m => (
                <tr key={m.month} className="hover:bg-muted/30">
                  <td className="p-3 font-medium">{m.month}</td>
                  <td className="p-3 text-right text-muted-foreground">{m.txCount}</td>
                  <td className="p-3 text-right">{kes(m.taxableSales)}</td>
                  <td className="p-3 text-right font-semibold" style={{ color: 'oklch(0.55 0.2 25)' }}>{fmt(m.outputVat)}</td>
                  <td className="p-3 text-right text-muted-foreground">{kes(m.zeroRated)}</td>
                  <td className="p-3 text-right text-muted-foreground">{kes(m.exempt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-category VAT */}
      {byCategory.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="p-4 border-b">
            <p className="text-sm font-semibold">By Category</p>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b" style={{ background: 'var(--muted)' }}>
                <th className="text-left p-3 font-semibold">Category</th>
                <th className="text-right p-3 font-semibold">Taxable [V]</th>
                <th className="text-right p-3 font-semibold">VAT</th>
                <th className="text-right p-3 font-semibold">Zero [Z]</th>
                <th className="text-right p-3 font-semibold">Exempt [E]</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {byCategory.map(cat => (
                <tr key={cat.category} className="hover:bg-muted/30">
                  <td className="p-3 font-medium">{cat.category}</td>
                  <td className="p-3 text-right text-muted-foreground">{cat.taxable > 0 ? kes(cat.taxable) : '—'}</td>
                  <td className="p-3 text-right font-semibold" style={{ color: cat.vat > 0 ? 'oklch(0.55 0.2 25)' : undefined }}>
                    {cat.vat > 0 ? fmt(cat.vat) : '—'}
                  </td>
                  <td className="p-3 text-right text-muted-foreground">{cat.zero > 0 ? kes(cat.zero) : '—'}</td>
                  <td className="p-3 text-right text-muted-foreground">{cat.exempt > 0 ? kes(cat.exempt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
