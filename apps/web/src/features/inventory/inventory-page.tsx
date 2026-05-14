import { useState, useMemo } from 'react';
import { InventoryTable } from './components/inventory-table';
import { CsvUploadDialog } from './components/csv-upload-dialog';
import { ImageSyncPanel } from './components/image-sync-panel';
import { LocalImageMatcher } from './components/local-image-matcher';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AlertTriangle, Upload, Plus, ImageUp, Download, Package, TrendingUp } from 'lucide-react';
import { useProducts } from '@/hooks/use-products';
import { useAuthStore } from '@/features/auth/store/use-auth-store';

type CatSortKey = 'category' | 'items' | 'avgCost' | 'avgSelling' | 'avgMargin' | 'stockValue';

export function InventoryPage() {
  const [showRecountOnly, setShowRecountOnly] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [matcherOpen, setMatcherOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [catSortKey, setCatSortKey] = useState<CatSortKey>('category');
  const [catSortDir, setCatSortDir] = useState<'asc' | 'desc'>('asc');
  const { data: products = [] } = useProducts();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';

  const recountItems = products.filter((p) => p.currentStock < 0);

  // ── KPI stats ─────────────────────────────────────────────────────────────
  const outOfStock = products.filter((p) => p.currentStock <= 0).length;
  const lowStock = products.filter((p) => p.currentStock > 0 && p.currentStock < 10).length;
  const priced = products.filter((p) => p.sellingPrice > 0);
  const avgMargin =
    priced.length > 0
      ? priced.reduce((s, p) => s + ((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100, 0) / priced.length
      : 0;

  // ── Category chips ─────────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      const cat = p.category || 'Uncategorized';
      map.set(cat, (map.get(cat) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [products]);

  // ── Analytics: stock alerts ────────────────────────────────────────────────
  const alertItems = useMemo(
    () => products.filter((p) => p.currentStock <= 0 || p.currentStock < 2).sort((a, b) => a.currentStock - b.currentStock),
    [products],
  );

  // ── Analytics: top 10 by margin ───────────────────────────────────────────
  const top10Margin = useMemo(() => {
    return products
      .filter((p) => p.sellingPrice > 0)
      .map((p) => ({ ...p, marginPct: ((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100 }))
      .sort((a, b) => b.marginPct - a.marginPct)
      .slice(0, 10);
  }, [products]);
  const maxMarginPct = top10Margin[0]?.marginPct ?? 100;

  // ── Analytics: category summary ───────────────────────────────────────────
  const categorySummary = useMemo(() => {
    const map = new Map<string, { items: number; costSum: number; sellingSum: number; stockValue: number; marginSum: number; marginCount: number }>();
    for (const p of products) {
      const cat = p.category || 'Uncategorized';
      const d = map.get(cat) ?? { items: 0, costSum: 0, sellingSum: 0, stockValue: 0, marginSum: 0, marginCount: 0 };
      const margin = p.sellingPrice > 0 ? ((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100 : 0;
      map.set(cat, {
        items: d.items + 1,
        costSum: d.costSum + p.costPrice,
        sellingSum: d.sellingSum + p.sellingPrice,
        stockValue: d.stockValue + p.costPrice * Math.max(0, p.currentStock),
        marginSum: d.marginSum + margin,
        marginCount: d.marginCount + (p.sellingPrice > 0 ? 1 : 0),
      });
    }
    return Array.from(map.entries()).map(([category, d]) => ({
      category,
      items: d.items,
      avgCost: d.items > 0 ? d.costSum / d.items : 0,
      avgSelling: d.items > 0 ? d.sellingSum / d.items : 0,
      avgMargin: d.marginCount > 0 ? d.marginSum / d.marginCount : 0,
      stockValue: d.stockValue,
    }));
  }, [products]);

  const sortedCatSummary = useMemo(() => {
    return [...categorySummary].sort((a, b) => {
      const dir = catSortDir === 'asc' ? 1 : -1;
      if (catSortKey === 'category') return dir * a.category.localeCompare(b.category);
      return dir * ((a[catSortKey] as number) - (b[catSortKey] as number));
    });
  }, [categorySummary, catSortKey, catSortDir]);

  const toggleSort = (key: CatSortKey) => {
    if (catSortKey === key) setCatSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setCatSortKey(key); setCatSortDir('desc'); }
  };

  // ── Analytics: price outliers ─────────────────────────────────────────────
  const outliers = useMemo(
    () =>
      products
        .filter((p) => p.sellingPrice > 0)
        .map((p) => ({ ...p, marginPct: ((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100 }))
        .filter((p) => p.marginPct < 5 || p.marginPct > 60)
        .sort((a, b) => a.marginPct - b.marginPct),
    [products],
  );

  // ── CSV export ────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const rows = [
      ['Name', 'SKU', 'Category', 'Unit', 'Buying Price (KES)', 'Selling Price (KES)', 'Margin %', 'Stock'],
      ...products.map((p) => {
        const margin = p.sellingPrice > 0 ? ((p.sellingPrice - p.costPrice) / p.sellingPrice * 100).toFixed(1) : '0';
        return [p.name, p.sku, p.category, p.unit, p.costPrice, p.sellingPrice, margin, p.currentStock];
      }),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `inventory-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  const STAT_CARDS = [
    { label: 'Total Items', value: products.length.toLocaleString(), sub: 'in inventory', color: 'oklch(0.4 0.15 230)' },
    { label: 'Out of Stock', value: outOfStock.toLocaleString(), sub: 'need restocking', color: 'var(--primary)' },
    { label: 'Low Stock', value: lowStock.toLocaleString(), sub: 'below 10 units', color: 'oklch(0.55 0.15 60)' },
    { label: 'Avg Margin', value: `${avgMargin.toFixed(1)}%`, sub: 'profit margin', color: 'oklch(0.4 0.15 145)' },
  ];

  return (
    <div className="flex flex-col h-full p-6 gap-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold">Inventory</h1>
          <p className="text-sm text-muted-foreground">Manage products and stock levels</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isAdmin && (
            <>
              <button
                onClick={() => setAddOpen(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-colors"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Item
              </button>
              <button
                onClick={() => setMatcherOpen(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold hover:bg-muted transition-colors bg-card"
              >
                <ImageUp className="h-3.5 w-3.5" />
                Match Images
              </button>
              <button
                onClick={() => setCsvOpen(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold hover:bg-muted transition-colors bg-card"
              >
                <Upload className="h-3.5 w-3.5" />
                Import CSV
              </button>
            </>
          )}
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold hover:bg-muted transition-colors bg-card"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
          {recountItems.length > 0 && (
            <button
              onClick={() => setShowRecountOnly((v) => !v)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${
                showRecountOnly
                  ? 'bg-red-500/10 border-red-500/40 text-red-600'
                  : 'bg-card border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {recountItems.length} Requires Recount
            </button>
          )}
        </div>
      </div>

      {isAdmin && <ImageSyncPanel />}

      {/* ── Recount alert banner ── */}
      {recountItems.length > 0 && showRecountOnly && (
        <div className="shrink-0 rounded-xl border border-red-500/30 bg-red-500/8 p-4">
          <p className="text-xs font-bold text-red-600 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Items with negative stock — physical recount required
          </p>
          <div className="flex flex-wrap gap-2">
            {recountItems.map((item) => (
              <span key={item.id} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-500/10 text-red-700">
                {item.name} ({item.currentStock})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
        {STAT_CARDS.map((card) => (
          <div key={card.label} className="rounded-xl border bg-card p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{card.label}</span>
            <span className="text-2xl font-black leading-none" style={{ color: card.color }}>{card.value}</span>
            <span className="text-xs text-muted-foreground">{card.sub}</span>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="products" className="flex-1 min-h-0 overflow-hidden">
        <TabsList className="shrink-0">
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Products tab */}
        <TabsContent value="products" className="flex flex-col min-h-0 overflow-hidden">
          {/* Category filter chips */}
          <div className="flex gap-2 overflow-x-auto py-2 shrink-0">
            {([['All', products.length], ...categories] as [string, number][]).map(([cat, count]) => {
              const active = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
                  style={
                    active
                      ? { background: 'var(--primary)', color: 'var(--primary-foreground)', borderColor: 'var(--primary)' }
                      : { background: 'var(--card)', borderColor: 'var(--border)' }
                  }
                >
                  {cat}
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={
                      active
                        ? { background: 'oklch(1 0 0 / 0.2)', color: 'var(--primary-foreground)' }
                        : { background: 'var(--muted)', color: 'var(--muted-foreground)' }
                    }
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <InventoryTable
              recountFilter={showRecountOnly}
              addOpen={addOpen}
              onAddClose={() => setAddOpen(false)}
              categoryFilter={categoryFilter === 'All' ? '' : categoryFilter}
            />
          </div>
        </TabsContent>

        {/* Analytics tab */}
        <TabsContent value="analytics" className="overflow-auto pb-4">
          <div className="space-y-6 pt-3">

            {/* Stock Alerts */}
            <section>
              <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                <span
                  className="h-5 w-5 rounded-md flex items-center justify-center text-[11px] font-black"
                  style={{ background: 'oklch(0.477 0.216 27.3 / 0.12)', color: 'var(--primary)' }}
                >
                  !
                </span>
                Stock Alerts
                {alertItems.length > 0 && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: 'oklch(0.477 0.216 27.3 / 0.12)', color: 'var(--primary)' }}
                  >
                    {alertItems.length} items
                  </span>
                )}
              </h2>
              {alertItems.length === 0 ? (
                <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
                  All items are well-stocked
                </div>
              ) : (
                <div className="rounded-xl border bg-card overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                        <th className="text-left p-3 font-semibold text-muted-foreground uppercase tracking-wide">Item</th>
                        <th className="text-left p-3 font-semibold text-muted-foreground uppercase tracking-wide">Category</th>
                        <th className="text-left p-3 font-semibold text-muted-foreground uppercase tracking-wide">Unit</th>
                        <th className="text-center p-3 font-semibold text-muted-foreground uppercase tracking-wide">Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {alertItems.map((p) => (
                        <tr key={p.id} className="hover:bg-muted/30">
                          <td className="p-3 font-semibold">{p.name}</td>
                          <td className="p-3 text-muted-foreground">{p.category}</td>
                          <td className="p-3 text-muted-foreground">{p.unit}</td>
                          <td className="p-3 text-center">
                            <span
                              className="px-2 py-0.5 rounded-full font-bold"
                              style={
                                p.currentStock <= 0
                                  ? { background: 'oklch(0.477 0.216 27.3 / 0.12)', color: 'var(--primary)' }
                                  : { background: 'oklch(0.75 0.15 60 / 0.15)', color: 'oklch(0.55 0.15 60)' }
                              }
                            >
                              {p.currentStock <= 0 ? 'Out' : p.currentStock}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Top 10 by margin */}
            <section>
              <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" style={{ color: 'oklch(0.4 0.15 145)' }} />
                Top 10 Most Profitable Items
              </h2>
              <div className="rounded-xl border bg-card p-4 space-y-3">
                {top10Margin.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No items with pricing data</p>
                ) : (
                  top10Margin.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-muted-foreground w-5 text-right shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground">{p.category}</p>
                      </div>
                      <div className="w-36 flex items-center gap-2 shrink-0">
                        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--muted)' }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(p.marginPct / maxMarginPct) * 100}%`,
                              background: 'oklch(0.5 0.15 145)',
                            }}
                          />
                        </div>
                        <span className="text-xs font-bold w-10 text-right" style={{ color: 'oklch(0.4 0.15 145)' }}>
                          {p.marginPct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Category summary */}
            <section>
              <h2 className="text-sm font-bold mb-1 flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                Summary by Category
              </h2>
              <p className="text-xs text-muted-foreground mb-3">Click any column header to sort</p>
              <div className="rounded-xl border bg-card overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                      {(
                        [
                          ['category', 'Category'],
                          ['items', 'Items'],
                          ['avgCost', 'Avg Cost'],
                          ['avgSelling', 'Avg Selling'],
                          ['avgMargin', 'Avg Margin'],
                          ['stockValue', 'Stock Value'],
                        ] as [CatSortKey, string][]
                      ).map(([key, label]) => (
                        <th
                          key={key}
                          className="text-left p-3 font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground select-none"
                          onClick={() => toggleSort(key)}
                        >
                          {label}
                          {catSortKey === key && (
                            <span className="ml-1 opacity-60">{catSortDir === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sortedCatSummary.map((row) => (
                      <tr key={row.category} className="hover:bg-muted/30">
                        <td className="p-3 font-semibold">{row.category}</td>
                        <td className="p-3 text-muted-foreground">{row.items}</td>
                        <td className="p-3 text-muted-foreground">
                          {row.avgCost > 0 ? row.avgCost.toLocaleString('en-KE', { maximumFractionDigits: 0 }) : '—'}
                        </td>
                        <td className="p-3 font-semibold" style={{ color: 'var(--primary)' }}>
                          {row.avgSelling > 0 ? row.avgSelling.toLocaleString('en-KE', { maximumFractionDigits: 0 }) : '—'}
                        </td>
                        <td className="p-3">
                          <span
                            className="px-2 py-0.5 rounded-full font-semibold"
                            style={
                              row.avgMargin < 5
                                ? { background: 'oklch(0.477 0.216 27.3 / 0.12)', color: 'var(--primary)' }
                                : row.avgMargin < 15
                                  ? { background: 'oklch(0.75 0.15 60 / 0.15)', color: 'oklch(0.55 0.15 60)' }
                                  : { background: 'oklch(0.5 0.15 145 / 0.12)', color: 'oklch(0.4 0.15 145)' }
                            }
                          >
                            {row.avgMargin.toFixed(1)}%
                          </span>
                        </td>
                        <td className="p-3 text-muted-foreground font-mono text-[10px]">
                          {row.stockValue > 0
                            ? `KES ${row.stockValue.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Price outliers */}
            <section>
              <h2 className="text-sm font-bold mb-1 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" style={{ color: 'oklch(0.55 0.15 60)' }} />
                Items to Review
              </h2>
              <p className="text-xs text-muted-foreground mb-3">Margin below 5% (possible pricing error) or above 60% (unusually high)</p>
              {outliers.length === 0 ? (
                <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
                  No pricing anomalies found
                </div>
              ) : (
                <div className="rounded-xl border bg-card overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                        <th className="text-left p-3 font-semibold text-muted-foreground uppercase tracking-wide">Item</th>
                        <th className="text-left p-3 font-semibold text-muted-foreground uppercase tracking-wide">Category</th>
                        <th className="text-right p-3 font-semibold text-muted-foreground uppercase tracking-wide">Cost</th>
                        <th className="text-right p-3 font-semibold text-muted-foreground uppercase tracking-wide">Selling</th>
                        <th className="text-center p-3 font-semibold text-muted-foreground uppercase tracking-wide">Margin</th>
                        <th className="text-left p-3 font-semibold text-muted-foreground uppercase tracking-wide">Flag</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {outliers.map((p) => (
                        <tr key={p.id} className="hover:bg-muted/30">
                          <td className="p-3 font-semibold">{p.name}</td>
                          <td className="p-3 text-muted-foreground">{p.category}</td>
                          <td className="p-3 text-right text-muted-foreground">{p.costPrice.toLocaleString()}</td>
                          <td className="p-3 text-right font-bold" style={{ color: 'var(--primary)' }}>
                            {p.sellingPrice.toLocaleString()}
                          </td>
                          <td className="p-3 text-center">
                            <span
                              className="px-2 py-0.5 rounded-full font-bold"
                              style={
                                p.marginPct < 5
                                  ? { background: 'oklch(0.477 0.216 27.3 / 0.12)', color: 'var(--primary)' }
                                  : { background: 'oklch(0.75 0.18 70 / 0.15)', color: 'oklch(0.45 0.15 70)' }
                              }
                            >
                              {p.marginPct.toFixed(1)}%
                            </span>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {p.marginPct < 5 ? 'Too low' : 'Unusually high'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

          </div>
        </TabsContent>
      </Tabs>

      {isAdmin && <CsvUploadDialog open={csvOpen} onClose={() => setCsvOpen(false)} />}
      {isAdmin && <LocalImageMatcher open={matcherOpen} onClose={() => setMatcherOpen(false)} />}
    </div>
  );
}
