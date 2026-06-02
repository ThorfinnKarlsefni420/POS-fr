import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { PackagingTier } from '@/types/pos';
import { Input } from '@/components/ui/input';
import { Pencil, Trash2, Check, X, Loader2, Plus, ChevronRight, PackageOpen } from 'lucide-react';

// Source of truth: absolute qty in base (same as DB). Sorted asc by qtyInBase.
interface TierDraft {
  id?: string;
  name: string;
  qtyInBase: number;
  costPrice: number;
  sellingPrice: number | null;
  barcode: string;
}

function draftsFromTiers(tiers: PackagingTier[]): TierDraft[] {
  return [...tiers]
    .sort((a, b) => Number(a.quantityInBase) - Number(b.quantityInBase))
    .map((t) => ({
      id: t.id,
      name: t.name,
      qtyInBase: Number(t.quantityInBase),
      costPrice: Number(t.costPrice),
      sellingPrice: t.sellingPriceOverride != null ? Number(t.sellingPriceOverride) : null,
      barcode: t.barcode ?? '',
    }));
}

// How many of the previous tier fit in this tier (for display only)
function relativeQty(drafts: TierDraft[], idx: number): number {
  if (idx === 0) return 1;
  const prev = drafts[idx - 1].qtyInBase;
  return prev > 0 ? Math.round((drafts[idx].qtyInBase / prev) * 1000) / 1000 : drafts[idx].qtyInBase;
}

const PRESET_NAMES = ['Piece', 'Pack', 'Dozen', 'Outer', 'Carton', 'Case', 'Bale', 'Box'];

interface Props {
  itemId: string;
  itemUnit: string;
  baseSellingPrice: number;
  tiers: PackagingTier[];
  onRefresh: () => void;
}

export function PackagingTierEditor({ itemId, itemUnit, baseSellingPrice, tiers, onRefresh }: Props) {
  const [drafts, setDrafts] = useState<TierDraft[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<TierDraft | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // New tier form
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newCost, setNewCost] = useState('');
  const [newSell, setNewSell] = useState('');
  const [newBarcode, setNewBarcode] = useState('');

  useEffect(() => {
    setDrafts(draftsFromTiers(tiers));
    setDirty(false);
    setEditingIdx(null);
    setEditForm(null);
    setAddingNew(false);
    resetAddForm();
  }, [tiers]);

  const resetAddForm = () => {
    setNewName(''); setNewQty(''); setNewCost(''); setNewSell(''); setNewBarcode('');
  };

  const baseUnitName = drafts[0]?.name || itemUnit || 'unit';

  const openEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditForm({ ...drafts[idx] });
  };

  const cancelEdit = () => { setEditingIdx(null); setEditForm(null); };

  const commitEdit = () => {
    if (editForm === null || editingIdx === null) return;
    const qty = editForm.qtyInBase;
    if (!(qty > 0)) return;
    setDrafts((prev) => {
      const next = prev.map((d, i) => (i === editingIdx ? { ...editForm, qtyInBase: qty } : d));
      return [...next].sort((a, b) => a.qtyInBase - b.qtyInBase);
    });
    setDirty(true);
    setEditingIdx(null);
    setEditForm(null);
  };

  const removeDraft = (idx: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
    if (editingIdx === idx) cancelEdit();
  };

  const addDraft = () => {
    const qty = Number(newQty);
    if (!newName.trim() || !(qty > 0)) return;
    const isDuplicate = drafts.some((d) => d.qtyInBase === qty);
    if (isDuplicate) { alert(`A tier with ${qty} ${baseUnitName}(s) already exists.`); return; }
    const draft: TierDraft = {
      name: newName.trim(),
      qtyInBase: qty,
      costPrice: Number(newCost) || 0,
      sellingPrice: newSell !== '' ? Number(newSell) : null,
      barcode: newBarcode,
    };
    setDrafts((prev) => [...prev, draft].sort((a, b) => a.qtyInBase - b.qtyInBase));
    setDirty(true);
    setAddingNew(false);
    resetAddForm();
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.products.replaceTiers(
        itemId,
        drafts.map((d) => ({
          name: d.name,
          qtyInBase: d.qtyInBase,
          costPrice: d.costPrice,
          sellingPrice: d.sellingPrice,
          barcode: d.barcode || null,
        })),
      );
      setDirty(false);
      onRefresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const autoSell = (qtyInBase: number) =>
    baseSellingPrice > 0 ? baseSellingPrice * qtyInBase : null;

  return (
    <div className="space-y-3">

      {/* Chain visualization */}
      {drafts.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap px-3 py-2 rounded-lg bg-muted/40 border text-xs">
          {drafts.map((d, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="font-bold px-2 py-0.5 rounded-full"
                style={i === 0
                  ? { background: 'oklch(0.477 0.216 27.3 / 0.12)', color: 'var(--primary)' }
                  : { background: 'var(--muted)', color: 'var(--foreground)' }}>
                {d.name}
                {i > 0 && (
                  <span className="font-normal text-muted-foreground ml-1">
                    = {d.qtyInBase.toLocaleString()} {drafts[0].name}
                  </span>
                )}
              </span>
              {i < drafts.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
            </span>
          ))}
        </div>
      )}

      {/* Tier cards */}
      <div className="space-y-2">
        {drafts.length === 0 && !addingNew && (
          <div className="rounded-lg border border-dashed p-5 text-center">
            <PackageOpen className="h-6 w-6 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              No tiers yet. Add <strong>{itemUnit || 'Piece'}</strong> as the base unit (qty = 1), then stack larger packages on top.
            </p>
          </div>
        )}

        {drafts.map((d, idx) => {
          const isBase = idx === 0;
          const rel = relativeQty(drafts, idx);
          const prevName = idx > 0 ? drafts[idx - 1].name : baseUnitName;
          const computedSell = autoSell(d.qtyInBase);
          const isEditing = editingIdx === idx;

          return (
            <div key={`${d.id ?? d.name}-${idx}`} className="rounded-xl border bg-card overflow-hidden">
              {!isEditing ? (
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
                    <div className="shrink-0 flex items-center gap-1.5">
                      <span className="text-xs font-bold">{d.name}</span>
                      {isBase && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: 'oklch(0.477 0.216 27.3 / 0.12)', color: 'var(--primary)' }}>
                          BASE
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {isBase
                        ? '1 unit'
                        : `${rel % 1 === 0 ? rel : rel.toFixed(2)} × ${prevName} = ${d.qtyInBase.toLocaleString()} ${drafts[0].name}`}
                    </span>
                    <div className="flex gap-4 ml-auto text-xs shrink-0">
                      <span className="text-muted-foreground">
                        Cost <strong className="text-foreground">{d.costPrice > 0 ? `KES ${d.costPrice.toLocaleString()}` : '—'}</strong>
                      </span>
                      <span className="text-muted-foreground">
                        Sell <strong style={{ color: 'var(--primary)' }}>
                          {d.sellingPrice != null
                            ? `KES ${d.sellingPrice.toLocaleString()}`
                            : computedSell != null
                              ? `KES ${computedSell.toLocaleString()} (auto)`
                              : '—'}
                        </strong>
                      </span>
                      {d.barcode && (
                        <span className="font-mono text-muted-foreground text-[10px]">{d.barcode}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(idx)}
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => removeDraft(idx)}
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                /* Edit form */
                <div className="px-4 py-3 space-y-3 bg-muted/20">
                  {editForm && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-muted-foreground uppercase">Name</label>
                          <Input
                            list={`tier-names-edit-${idx}`}
                            value={editForm.name}
                            onChange={(e) => setEditForm((f) => f && ({ ...f, name: e.target.value }))}
                            className="h-8 text-xs"
                            autoFocus
                          />
                          <datalist id={`tier-names-edit-${idx}`}>
                            {PRESET_NAMES.map((n) => <option key={n} value={n} />)}
                          </datalist>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-muted-foreground uppercase">
                            {baseUnitName}s per {editForm.name || 'tier'}
                          </label>
                          <Input
                            type="number" min="1" step="any"
                            value={editForm.qtyInBase || ''}
                            onChange={(e) => setEditForm((f) => f && ({ ...f, qtyInBase: Number(e.target.value) }))}
                            className="h-8 text-xs"
                            disabled={isBase}
                          />
                          {isBase && (
                            <p className="text-[10px] text-muted-foreground">Base unit is always 1</p>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-muted-foreground uppercase">Cost (KES)</label>
                          <Input
                            type="number" min="0" step="0.01"
                            value={editForm.costPrice || ''}
                            onChange={(e) => setEditForm((f) => f && ({ ...f, costPrice: Number(e.target.value) }))}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-muted-foreground uppercase">
                            Sell Price
                            {computedSell != null && !editForm.sellingPrice && (
                              <span className="normal-case font-normal text-muted-foreground ml-1">
                                (auto {computedSell.toLocaleString()})
                              </span>
                            )}
                          </label>
                          <Input
                            type="number" min="0" step="0.01"
                            placeholder="Leave blank = auto"
                            value={editForm.sellingPrice ?? ''}
                            onChange={(e) => setEditForm((f) => f && ({
                              ...f, sellingPrice: e.target.value === '' ? null : Number(e.target.value),
                            }))}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-muted-foreground uppercase">Barcode</label>
                          <Input
                            value={editForm.barcode}
                            onChange={(e) => setEditForm((f) => f && ({ ...f, barcode: e.target.value }))}
                            className="h-8 text-xs"
                            placeholder="Optional"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={cancelEdit} className="h-7 px-3 rounded-lg border text-xs font-semibold hover:bg-muted">Cancel</button>
                        <button
                          onClick={commitEdit}
                          disabled={!editForm.name.trim() || !(editForm.qtyInBase > 0)}
                          className="h-7 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                        >
                          <Check className="h-3.5 w-3.5" /> Done
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Add new tier */}
        {addingNew ? (
          <div className="rounded-xl border bg-muted/20 px-4 py-3 space-y-3">
            <p className="text-xs font-bold">New tier</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">Tier name</label>
                <Input
                  list="tier-names-new"
                  placeholder={drafts.length === 0 ? itemUnit || 'Piece' : 'e.g. Dozen, Carton…'}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-8 text-xs"
                  autoFocus
                />
                <datalist id="tier-names-new">
                  {PRESET_NAMES.map((n) => <option key={n} value={n} />)}
                </datalist>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">
                  {drafts.length === 0
                    ? 'Qty (enter 1 for base unit)'
                    : `How many ${baseUnitName}s per ${newName || 'tier'}?`}
                </label>
                <Input
                  type="number"
                  min={drafts.length === 0 ? '1' : '2'}
                  step="1"
                  placeholder={drafts.length === 0 ? '1' : `e.g. 12 for a Dozen of ${baseUnitName}s`}
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  className="h-8 text-xs"
                />
                {newQty && Number(newQty) > 0 && drafts.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    1 {newName || 'tier'} = {Number(newQty).toLocaleString()} {baseUnitName}s
                    {drafts.length > 0 && Number(newQty) > drafts[drafts.length - 1].qtyInBase
                      ? ` · bigger than ${drafts[drafts.length - 1].name} (${drafts[drafts.length - 1].qtyInBase})`
                      : Number(newQty) < (drafts[0]?.qtyInBase ?? 1)
                        ? ' · will become new base unit'
                        : ''}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">Cost (KES)</label>
                <Input type="number" min="0" step="0.01" placeholder="0"
                  value={newCost} onChange={(e) => setNewCost(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">Sell Price</label>
                <Input type="number" min="0" step="0.01" placeholder="Blank = auto"
                  value={newSell} onChange={(e) => setNewSell(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">Barcode</label>
                <Input placeholder="Optional"
                  value={newBarcode} onChange={(e) => setNewBarcode(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={addDraft}
                disabled={!newName.trim() || !(Number(newQty) > 0)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold disabled:opacity-50"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                <Check className="h-3.5 w-3.5" /> Add
              </button>
              <button
                onClick={() => { setAddingNew(false); resetAddForm(); }}
                className="h-8 w-8 rounded-lg border text-xs font-semibold hover:bg-muted flex items-center justify-center"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingNew(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors px-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Add {drafts.length === 0 ? 'base unit' : 'tier'}
          </button>
        )}
      </div>

      {/* Save bar */}
      {dirty && (
        <div className="flex items-center justify-between rounded-xl border bg-primary/5 border-primary/20 px-4 py-2.5">
          <p className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>Unsaved changes</p>
          <div className="flex gap-2">
            <button
              onClick={() => { setDrafts(draftsFromTiers(tiers)); setDirty(false); cancelEdit(); setAddingNew(false); resetAddForm(); }}
              className="h-7 px-3 rounded-lg border text-xs font-semibold hover:bg-muted"
            >
              Discard
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="h-7 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
