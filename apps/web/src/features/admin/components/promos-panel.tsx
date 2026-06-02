import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiPromo, ApiPromoInput, PromoType, PromoScope } from '@/lib/api';
import { useProducts } from '@/hooks/use-products';
import { Plus, Trash2, ToggleLeft, ToggleRight, Tag } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const TYPE_LABELS: Record<PromoType, string> = {
  PERCENT_OFF: '% Off',
  FIXED_OFF: 'Fixed KES Off',
  BOGO: 'Buy X Get Y Free',
};

const SCOPE_LABELS: Record<PromoScope, string> = {
  ALL: 'All Items',
  CATEGORY: 'Category',
  ITEM: 'Specific Item',
};

const EMPTY_FORM: ApiPromoInput & { _categoryName: string; _itemId: string } = {
  name: '',
  type: 'PERCENT_OFF',
  value: 10,
  scope: 'ALL',
  categoryName: undefined,
  itemId: undefined,
  minQty: 1,
  minAmount: 0,
  buyQty: 2,
  getQty: 1,
  startDate: undefined,
  endDate: undefined,
  _categoryName: '',
  _itemId: '',
};

export function PromosPanel() {
  const qc = useQueryClient();
  const { data: products = [] } = useProducts();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))].sort();

  const { data: promos = [], isLoading } = useQuery({
    queryKey: ['promos'],
    queryFn: () => api.promos.list(),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const payload: ApiPromoInput = {
        name: form.name,
        type: form.type,
        value: form.value,
        scope: form.scope,
        ...(form.scope === 'CATEGORY' && { categoryName: form._categoryName }),
        ...(form.scope === 'ITEM' && { itemId: form._itemId }),
        minQty: form.minQty,
        minAmount: form.minAmount,
        ...(form.type === 'BOGO' && { buyQty: form.buyQty, getQty: form.getQty }),
        ...(form.startDate && { startDate: form.startDate }),
        ...(form.endDate && { endDate: form.endDate }),
      };
      return api.promos.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promos'] });
      setShowCreate(false);
      setForm({ ...EMPTY_FORM });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.promos.update(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promos'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.promos.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promos'] }),
  });

  const f = (key: keyof typeof form, val: unknown) => setForm((p) => ({ ...p, [key]: val }));

  const promoSummary = (p: ApiPromo) => {
    if (p.type === 'PERCENT_OFF') return `${(Number(p.value) * 100).toFixed(0)}% off`;
    if (p.type === 'FIXED_OFF') return `KES ${Number(p.value).toLocaleString()} off`;
    return `Buy ${p.buyQty} Get ${p.getQty} Free`;
  };

  const scopeSummary = (p: ApiPromo) => {
    if (p.scope === 'CATEGORY') return `Category: ${p.categoryName}`;
    if (p.scope === 'ITEM') return `Item: ${p.item?.name ?? p.itemId}`;
    return 'All items';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-base flex items-center gap-2">
            <Tag className="h-4 w-4" style={{ color: 'var(--primary)' }} />
            Promotions
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Active promos are shown to cashiers at checkout</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          <Plus className="h-3.5 w-3.5" />
          New Promo
        </button>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}

      {!isLoading && promos.length === 0 && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          No promotions yet. Create one to get started.
        </div>
      )}

      <div className="space-y-2">
        {promos.map((p) => {
          const now = new Date();
          const started = !p.startDate || new Date(p.startDate) <= now;
          const notExpired = !p.endDate || new Date(p.endDate) >= now;
          const effectivelyActive = p.isActive && started && notExpired;

          return (
            <div
              key={p.id}
              className="rounded-xl border bg-card p-4 flex items-center justify-between gap-4"
              style={!effectivelyActive ? { opacity: 0.6 } : {}}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-sm">{p.name}</p>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'oklch(0.477 0.216 27.3 / 0.1)', color: 'var(--primary)' }}
                  >
                    {promoSummary(p)}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {TYPE_LABELS[p.type]}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{scopeSummary(p)}</p>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                  {Number(p.minQty) > 1 && <span>Min qty: {p.minQty}</span>}
                  {Number(p.minAmount) > 0 && <span>Min cart: KES {Number(p.minAmount).toLocaleString()}</span>}
                  {p.startDate && <span>From: {new Date(p.startDate).toLocaleDateString('en-KE', { dateStyle: 'short' })}</span>}
                  {p.endDate && <span>Until: {new Date(p.endDate).toLocaleDateString('en-KE', { dateStyle: 'short' })}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => toggleMutation.mutate({ id: p.id, isActive: !p.isActive })}
                  title={p.isActive ? 'Deactivate' : 'Activate'}
                >
                  {p.isActive
                    ? <ToggleRight className="h-6 w-6" style={{ color: 'var(--primary)' }} />
                    : <ToggleLeft className="h-6 w-6 text-muted-foreground" />}
                </button>
                <button
                  onClick={() => { if (confirm(`Delete promo "${p.name}"?`)) deleteMutation.mutate(p.id); }}
                  className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-600 hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={showCreate} onOpenChange={(v) => { if (!v) { setShowCreate(false); setForm({ ...EMPTY_FORM }); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black">New Promotion</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Name *</p>
              <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="e.g. Weekend Dairy Sale" value={form.name} onChange={(e) => f('name', e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Type</p>
                <select className="w-full rounded-xl border px-3 py-2 text-sm appearance-none" value={form.type} onChange={(e) => f('type', e.target.value)}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">
                  {form.type === 'PERCENT_OFF' ? 'Discount (0–1, e.g. 0.15 = 15%)' : form.type === 'FIXED_OFF' ? 'KES Amount Off' : 'N/A'}
                </p>
                {form.type !== 'BOGO' ? (
                  <input type="number" min="0" step="0.01" className="w-full rounded-xl border px-3 py-2 text-sm" value={form.value} onChange={(e) => f('value', Number(e.target.value))} />
                ) : (
                  <div className="flex items-center gap-1">
                    <input type="number" min="1" className="w-full rounded-xl border px-2 py-2 text-sm" placeholder="Buy" value={form.buyQty} onChange={(e) => f('buyQty', Number(e.target.value))} />
                    <span className="text-xs text-muted-foreground shrink-0">get</span>
                    <input type="number" min="1" className="w-full rounded-xl border px-2 py-2 text-sm" placeholder="Free" value={form.getQty} onChange={(e) => f('getQty', Number(e.target.value))} />
                  </div>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Applies To</p>
              <div className="flex gap-1.5">
                {(['ALL', 'CATEGORY', 'ITEM'] as PromoScope[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => f('scope', s)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                    style={form.scope === s ? { background: 'var(--primary)', color: 'var(--primary-foreground)', borderColor: 'var(--primary)' } : {}}
                  >
                    {SCOPE_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {form.scope === 'CATEGORY' && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Category</p>
                <select className="w-full rounded-xl border px-3 py-2 text-sm appearance-none" value={form._categoryName} onChange={(e) => f('_categoryName', e.target.value)}>
                  <option value="">Select category…</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}

            {form.scope === 'ITEM' && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Item</p>
                <select className="w-full rounded-xl border px-3 py-2 text-sm appearance-none" value={form._itemId} onChange={(e) => f('_itemId', e.target.value)}>
                  <option value="">Select item…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Min Qty</p>
                <input type="number" min="1" className="w-full rounded-xl border px-3 py-2 text-sm" value={form.minQty} onChange={(e) => f('minQty', Number(e.target.value))} />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Min Cart (KES)</p>
                <input type="number" min="0" className="w-full rounded-xl border px-3 py-2 text-sm" value={form.minAmount} onChange={(e) => f('minAmount', Number(e.target.value))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Start Date</p>
                <input type="date" className="w-full rounded-xl border px-3 py-2 text-sm" value={form.startDate ?? ''} onChange={(e) => f('startDate', e.target.value || undefined)} />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">End Date</p>
                <input type="date" className="w-full rounded-xl border px-3 py-2 text-sm" value={form.endDate ?? ''} onChange={(e) => f('endDate', e.target.value || undefined)} />
              </div>
            </div>

            <button
              onClick={() => createMutation.mutate()}
              disabled={!form.name.trim() || createMutation.isPending || (form.scope === 'CATEGORY' && !form._categoryName) || (form.scope === 'ITEM' && !form._itemId)}
              className="w-full py-2.5 rounded-xl font-bold text-sm disabled:opacity-60"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              {createMutation.isPending ? 'Creating…' : 'Create Promotion'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
