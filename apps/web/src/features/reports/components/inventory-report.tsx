import { AlertTriangle } from 'lucide-react';
import { useInventoryReport } from '../hooks/use-reports';

function kes(n: number) {
  return `KES ${n.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}

const REASON_LABELS: Record<string, string> = {
  DAMAGED: 'Damaged',
  STOLEN: 'Stolen',
  EXPIRED: 'Expired',
  PROMO: 'Promo',
  RESTOCK: 'Restock',
  RECOUNT: 'Recount',
};

export function InventoryReport() {
  const { data, isLoading } = useInventoryReport();

  if (isLoading) return <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">Loading inventory data…</div>;
  if (!data) return null;

  const { totalProducts, totalCostValue, totalRetailValue, lowStockCount, outOfStockCount, byCategory, lowStock, outOfStock, recentAdjustments } = data;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Products', value: totalProducts.toLocaleString() },
          { label: 'Cost Value', value: kes(totalCostValue) },
          { label: 'Retail Value', value: kes(totalRetailValue) },
          { label: 'Out of Stock', value: outOfStockCount.toLocaleString(), warn: outOfStockCount > 0 },
        ].map(card => (
          <div key={card.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="text-xl font-black mt-1" style={{ color: card.warn ? 'oklch(0.55 0.2 25)' : 'var(--primary)' }}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* By category */}
      {byCategory.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="p-4 border-b">
            <p className="text-sm font-semibold">By Category</p>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b" style={{ background: 'var(--muted)' }}>
                <th className="text-left p-3 font-semibold">Category</th>
                <th className="text-right p-3 font-semibold">Products</th>
                <th className="text-right p-3 font-semibold">Cost Value</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {byCategory.map(cat => (
                <tr key={cat.category} className="hover:bg-muted/30">
                  <td className="p-3 font-medium">{cat.category}</td>
                  <td className="p-3 text-right text-muted-foreground">{cat.count}</td>
                  <td className="p-3 text-right font-semibold" style={{ color: 'var(--primary)' }}>{kes(cat.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Low stock */}
      {lowStock.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="p-4 border-b flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-semibold">Low Stock <span className="text-muted-foreground font-normal">({lowStockCount} items)</span></p>
          </div>
          <div className="p-4 flex flex-wrap gap-2">
            {lowStock.map(item => (
              <div key={item.id} className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium" style={{ borderColor: 'oklch(0.65 0.15 50 / 0.4)', background: 'oklch(0.65 0.15 50 / 0.06)' }}>
                <span>{item.name}</span>
                <span className="font-bold" style={{ color: 'oklch(0.55 0.18 50)' }}>{item.currentStock} {item.unit || 'units'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Out of stock */}
      {outOfStock.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="p-4 border-b flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" style={{ color: 'oklch(0.55 0.2 25)' }} />
            <p className="text-sm font-semibold">Out of Stock <span className="text-muted-foreground font-normal">({outOfStockCount} items)</span></p>
          </div>
          <div className="p-4 flex flex-wrap gap-2">
            {outOfStock.map(item => (
              <span key={item.id} className="px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: 'oklch(0.55 0.2 25 / 0.08)', color: 'oklch(0.45 0.18 25)' }}>
                {item.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recent adjustments */}
      {recentAdjustments.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="p-4 border-b">
            <p className="text-sm font-semibold">Recent Adjustments</p>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b" style={{ background: 'var(--muted)' }}>
                <th className="text-left p-3 font-semibold">Product</th>
                <th className="text-left p-3 font-semibold">Reason</th>
                <th className="text-right p-3 font-semibold">Qty</th>
                <th className="text-left p-3 font-semibold">Note</th>
                <th className="text-left p-3 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recentAdjustments.map((a, i) => (
                <tr key={i} className="hover:bg-muted/30">
                  <td className="p-3 font-medium">{a.itemName}</td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded-full font-medium text-[10px]" style={{ background: 'var(--muted)' }}>{REASON_LABELS[a.reasonCode] ?? a.reasonCode}</span></td>
                  <td className="p-3 text-right font-bold" style={{ color: a.quantity >= 0 ? 'oklch(0.5 0.15 145)' : 'oklch(0.55 0.2 25)' }}>
                    {a.quantity >= 0 ? '+' : ''}{a.quantity}
                  </td>
                  <td className="p-3 text-muted-foreground">{a.note || '—'}</td>
                  <td className="p-3 text-muted-foreground">{new Date(a.createdAt).toLocaleDateString('en-KE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
