import { useRef, useState, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useProducts, useUpdateProduct, useDeleteProduct } from '@/hooks/use-products';
import { useAuthStore } from '@/features/auth/store/use-auth-store';
import { useSettingsStore } from '@/features/admin/store/use-settings-store';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { api } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useItemStock } from '@/hooks/use-locations';
import type { PackagingTier, Product } from '@/types/pos';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { StockTransferDialog } from './stock-transfer-dialog';
import {
  Search, Pencil, Trash2, Package, ImageUp, Loader2, SlidersHorizontal,
  Plus, X, Check, Layers, ArrowRightLeft, Warehouse, ShoppingBag, Monitor,
  MoreHorizontal, Truck, Barcode, History, TrendingUp, TrendingDown,
} from 'lucide-react';

const LOCATION_TYPE_ICONS: Record<string, typeof Warehouse> = {
  WAREHOUSE: Warehouse,
  SHELF: ShoppingBag,
  DISPLAY: Monitor,
  TRANSIT: ArrowRightLeft,
  OTHER: MoreHorizontal,
};

const LOCATION_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  WAREHOUSE: { bg: 'oklch(0.5 0.15 240 / 0.12)', text: 'oklch(0.4 0.15 240)' },
  SHELF:     { bg: 'oklch(0.5 0.15 145 / 0.12)', text: 'oklch(0.4 0.15 145)' },
  DISPLAY:   { bg: 'oklch(0.75 0.15 60 / 0.15)',  text: 'oklch(0.55 0.15 60)' },
  TRANSIT:   { bg: 'oklch(0.477 0.216 27.3 / 0.12)', text: 'var(--primary)' },
  OTHER:     { bg: 'var(--muted)', text: 'var(--muted-foreground)' },
};

function thumbUrl(url: string | undefined): string {
  if (!url) return '';
  if (url.includes('cloudinary.com') && url.includes('/upload/')) {
    return url.replace('/upload/', '/upload/f_auto,q_auto,w_64,h_64,c_fill/');
  }
  return url;
}

const ADJUST_REASONS = [
  { value: 'RESTOCK', label: 'Restock' },
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'STOLEN', label: 'Stolen / Theft' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'PROMO', label: 'Promo / Giveaway' },
  { value: 'RECOUNT', label: 'Recount Correction' },
];

const DEFAULT_TIER_NAMES = ['Piece', 'Outer', 'Carton', 'Bale'];

interface TierRowProps {
  tier: PackagingTier;
  itemId: string;
  onUpdated: () => void;
}

function TierRow({ tier, itemId, onUpdated }: TierRowProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...tier });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.products.updateTier(itemId, tier.id, {
        name: form.name,
        level: form.level,
        quantityInBase: form.quantityInBase,
        costPrice: form.costPrice,
        sellingPriceOverride: form.sellingPriceOverride ?? undefined,
        barcode: form.barcode ?? undefined,
        isBaseUnit: form.isBaseUnit,
      });
      onUpdated();
      setEditing(false);
    } catch {
      alert('Failed to save tier');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.products.deleteTier(itemId, tier.id);
      onUpdated();
    } catch {
      alert('Failed to delete tier');
    } finally {
      setDeleting(false);
    }
  };

  if (editing) {
    return (
      <tr className="bg-muted/40">
        <td className="p-2">
          <Input
            list="tier-names"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="h-7 text-xs"
          />
          <datalist id="tier-names">
            {DEFAULT_TIER_NAMES.map((n) => <option key={n} value={n} />)}
          </datalist>
        </td>
        <td className="p-2">
          <Input
            type="number" min="0"
            value={form.level}
            onChange={(e) => setForm((f) => ({ ...f, level: Number(e.target.value) }))}
            className="h-7 text-xs w-16"
          />
        </td>
        <td className="p-2">
          <Input
            type="number" min="1" step="0.001"
            value={form.quantityInBase}
            onChange={(e) => setForm((f) => ({ ...f, quantityInBase: Number(e.target.value) }))}
            className="h-7 text-xs w-24"
          />
        </td>
        <td className="p-2">
          <Input
            type="number" min="0" step="0.01"
            value={form.costPrice}
            onChange={(e) => setForm((f) => ({ ...f, costPrice: Number(e.target.value) }))}
            className="h-7 text-xs w-28"
          />
        </td>
        <td className="p-2">
          <Input
            type="number" min="0" step="0.01"
            placeholder="Auto"
            value={form.sellingPriceOverride ?? ''}
            onChange={(e) => setForm((f) => ({
              ...f,
              sellingPriceOverride: e.target.value === '' ? null : Number(e.target.value),
            }))}
            className="h-7 text-xs w-28"
          />
        </td>
        <td className="p-2">
          <Input
            value={form.barcode ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value || null }))}
            className="h-7 text-xs w-28"
          />
        </td>
        <td className="p-2 text-center">
          <input
            type="checkbox"
            checked={form.isBaseUnit}
            onChange={(e) => setForm((f) => ({ ...f, isBaseUnit: e.target.checked }))}
            className="h-3.5 w-3.5 accent-primary"
          />
        </td>
        <td className="p-2">
          <div className="flex gap-1">
            <button
              onClick={save}
              disabled={saving}
              className="h-6 w-6 rounded flex items-center justify-center bg-primary text-primary-foreground hover:opacity-90"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="h-6 w-6 rounded flex items-center justify-center border hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border/40 hover:bg-muted/20">
      <td className="p-2 text-xs font-semibold">
        {tier.name}
        {tier.isBaseUnit && (
          <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: 'oklch(0.477 0.216 27.3 / 0.12)', color: 'var(--primary)' }}>
            BASE
          </span>
        )}
      </td>
      <td className="p-2 text-xs text-muted-foreground text-center">{tier.level}</td>
      <td className="p-2 text-xs font-mono text-center">{Number(tier.quantityInBase).toLocaleString()}</td>
      <td className="p-2 text-xs text-right">KES {Number(tier.costPrice).toLocaleString()}</td>
      <td className="p-2 text-xs text-right text-muted-foreground">
        {tier.sellingPriceOverride != null ? `KES ${Number(tier.sellingPriceOverride).toLocaleString()}` : '—'}
      </td>
      <td className="p-2 text-xs font-mono text-muted-foreground">{tier.barcode ?? '—'}</td>
      <td className="p-2 text-center">
        {tier.isBaseUnit ? <Check className="h-3 w-3 mx-auto text-primary" /> : <span className="text-muted-foreground/30">—</span>}
      </td>
      <td className="p-2">
        <div className="flex gap-1">
          <button
            onClick={() => setEditing(true)}
            className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={remove}
            disabled={deleting}
            className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted"
          >
            {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          </button>
        </div>
      </td>
    </tr>
  );
}

interface AddTierRowProps {
  itemId: string;
  existingLevels: number[];
  onAdded: () => void;
}

function AddTierRow({ itemId, existingLevels, onAdded }: AddTierRowProps) {
  const nextLevel = existingLevels.length > 0 ? Math.max(...existingLevels) + 1 : 0;
  const [form, setForm] = useState({
    name: '', level: nextLevel, quantityInBase: 1, costPrice: 0,
    sellingPriceOverride: '' as string | number,
    barcode: '', isBaseUnit: existingLevels.length === 0,
  });
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.products.createTier(itemId, {
        name: form.name.trim(),
        level: form.level,
        quantityInBase: form.quantityInBase,
        costPrice: form.costPrice,
        sellingPriceOverride: form.sellingPriceOverride === '' ? undefined : Number(form.sellingPriceOverride),
        barcode: form.barcode || undefined,
        isBaseUnit: form.isBaseUnit,
      } as never);
      onAdded();
      setForm({
        name: '', level: nextLevel + 1, quantityInBase: 1, costPrice: 0,
        sellingPriceOverride: '', barcode: '', isBaseUnit: false,
      });
      setOpen(false);
    } catch {
      alert('Failed to add tier — check that name and level are unique for this item.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <tr>
        <td colSpan={8} className="p-2">
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add packaging tier
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-primary/5 border-t border-primary/20">
      <td className="p-2">
        <Input
          list="tier-names-add"
          placeholder="e.g. Carton"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="h-7 text-xs"
          autoFocus
        />
        <datalist id="tier-names-add">
          {DEFAULT_TIER_NAMES.map((n) => <option key={n} value={n} />)}
        </datalist>
      </td>
      <td className="p-2">
        <Input
          type="number" min="0"
          value={form.level}
          onChange={(e) => setForm((f) => ({ ...f, level: Number(e.target.value) }))}
          className="h-7 text-xs w-16"
        />
      </td>
      <td className="p-2">
        <Input
          type="number" min="1" step="0.001"
          value={form.quantityInBase}
          onChange={(e) => setForm((f) => ({ ...f, quantityInBase: Number(e.target.value) }))}
          className="h-7 text-xs w-24"
        />
      </td>
      <td className="p-2">
        <Input
          type="number" min="0" step="0.01"
          value={form.costPrice}
          onChange={(e) => setForm((f) => ({ ...f, costPrice: Number(e.target.value) }))}
          className="h-7 text-xs w-28"
        />
      </td>
      <td className="p-2">
        <Input
          type="number" min="0" step="0.01"
          placeholder="Auto"
          value={form.sellingPriceOverride}
          onChange={(e) => setForm((f) => ({ ...f, sellingPriceOverride: e.target.value }))}
          className="h-7 text-xs w-28"
        />
      </td>
      <td className="p-2">
        <Input
          value={form.barcode}
          onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
          className="h-7 text-xs w-28"
        />
      </td>
      <td className="p-2 text-center">
        <input
          type="checkbox"
          checked={form.isBaseUnit}
          onChange={(e) => setForm((f) => ({ ...f, isBaseUnit: e.target.checked }))}
          className="h-3.5 w-3.5 accent-primary"
        />
      </td>
      <td className="p-2">
        <div className="flex gap-1">
          <button
            onClick={save}
            disabled={saving || !form.name.trim()}
            className="h-6 w-6 rounded flex items-center justify-center bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="h-6 w-6 rounded flex items-center justify-center border hover:bg-muted"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Item History Panel ────────────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = {
  RESTOCK: 'Restock', DAMAGED: 'Damaged', STOLEN: 'Stolen/Theft',
  EXPIRED: 'Expired', PROMO: 'Promo/Giveaway', RECOUNT: 'Recount',
};

function ItemHistoryPanel({ itemId }: { itemId: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ['item-history', itemId],
    queryFn: () => api.products.history(itemId!),
    enabled: !!itemId,
  });

  if (!itemId) return null;
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading history…</span>
      </div>
    );
  }

  // Merge and sort by date desc
  type HistoryRow = { id: string; date: string; type: 'adjustment' | 'transfer'; label: string; qty: number; detail: string };
  const rows: HistoryRow[] = [
    ...(data?.adjustments ?? []).map((a) => ({
      id: a.id,
      date: a.createdAt,
      type: 'adjustment' as const,
      label: REASON_LABELS[a.reasonCode] ?? a.reasonCode,
      qty: a.quantity,
      detail: a.note ?? '',
    })),
    ...(data?.transfers ?? []).map((t) => ({
      id: t.id,
      date: t.createdAt,
      type: 'transfer' as const,
      label: `${t.from} → ${t.to}`,
      qty: t.quantityInTier != null ? t.quantityInTier : t.quantityBase,
      detail: [
        t.tierName ? `${t.tierName}` : 'base units',
        t.reason ?? '',
      ].filter(Boolean).join(' · '),
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground space-y-1">
        <History className="h-8 w-8 mx-auto opacity-20 mb-2" />
        <p className="font-semibold">No history yet</p>
        <p className="text-xs">Stock adjustments and transfers will appear here.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: 'var(--muted)' }} className="border-b">
            <th className="p-2.5 text-left font-semibold text-muted-foreground">Date</th>
            <th className="p-2.5 text-left font-semibold text-muted-foreground">Event</th>
            <th className="p-2.5 text-right font-semibold text-muted-foreground">Qty</th>
            <th className="p-2.5 text-left font-semibold text-muted-foreground">Detail</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border/40 hover:bg-muted/20">
              <td className="p-2.5 text-muted-foreground whitespace-nowrap">
                {new Date(row.date).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </td>
              <td className="p-2.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={
                      row.type === 'transfer'
                        ? { background: 'oklch(0.5 0.15 240 / 0.12)', color: 'oklch(0.4 0.15 240)' }
                        : { background: 'var(--muted)', color: 'var(--muted-foreground)' }
                    }
                  >
                    {row.type === 'transfer' ? 'Transfer' : 'Adjustment'}
                  </span>
                  <span className="font-semibold">{row.label}</span>
                </div>
              </td>
              <td className="p-2.5 text-right font-mono font-semibold"
                style={{ color: row.qty > 0 ? 'oklch(0.4 0.15 145)' : 'var(--primary)' }}>
                {row.qty > 0 ? '+' : ''}{row.qty}
              </td>
              <td className="p-2.5 text-muted-foreground">{row.detail || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface InventoryTableProps {
  recountFilter?: boolean;
  stockFilter?: 'all' | 'out' | 'low';
  addOpen?: boolean;
  onAddClose?: () => void;
  categoryFilter?: string;
}

export function InventoryTable({ recountFilter = false, stockFilter = 'all', addOpen = false, onAddClose, categoryFilter = '' }: InventoryTableProps) {
  const { data: products = [], isLoading } = useProducts();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';
  const { calcNomadBitePrice, cloudinaryCloudName, cloudinaryUploadPreset } = useSettingsStore();
  const queryClient = useQueryClient();

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [editItem, setEditItem] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [editTab, setEditTab] = useState('basic');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const imageFileRef = useRef<HTMLInputElement>(null);

  const EMPTY_FORM = { name: '', sku: '', category: '', subCategory: '', unit: '', costPrice: 0, sellingPrice: 0, nomadBitePrice: 0, taxRate: 0, currentStock: 0, imageUrl: '' };
  const [addForm, setAddForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM);
  const [addSaving, setAddSaving] = useState(false);
  const addImageRef = useRef<HTMLInputElement>(null);
  const [addUploadingImage, setAddUploadingImage] = useState(false);
  const [addUploadError, setAddUploadError] = useState('');

  const handleAddImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAddUploadingImage(true);
    setAddUploadError('');
    try {
      const result = await uploadToCloudinary(file, cloudinaryCloudName, cloudinaryUploadPreset, addForm.sku || 'new-item');
      setAddForm((f) => ({ ...f, imageUrl: result.secure_url }));
    } catch (err) {
      setAddUploadError((err as Error).message);
    } finally {
      setAddUploadingImage(false);
      if (addImageRef.current) addImageRef.current.value = '';
    }
  };

  const handleAddSave = async () => {
    if (!addForm.name.trim() || !addForm.sku.trim()) return;
    setAddSaving(true);
    try {
      await api.products.create(addForm);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setAddForm(EMPTY_FORM);
      onAddClose?.();
    } catch {
      alert('Failed to create item — check that the SKU is unique.');
    } finally {
      setAddSaving(false);
    }
  };

  const [transferOpen, setTransferOpen] = useState(false);
  const { data: editItemStock } = useItemStock(editItem?.id ?? null);

  // Adjust stock dialog state
  const [adjustItem, setAdjustItem] = useState<Product | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustReason, setAdjustReason] = useState('RESTOCK');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustTierId, setAdjustTierId] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const handleAdjust = async () => {
    if (!adjustItem || adjustDelta === '' || isNaN(Number(adjustDelta))) return;
    setAdjusting(true);
    try {
      await api.products.adjustStock(
        adjustItem.id,
        Number(adjustDelta),
        adjustReason,
        adjustNote || undefined,
        adjustTierId || undefined,
      );
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setAdjustItem(null);
      setAdjustDelta('');
      setAdjustNote('');
      setAdjustReason('RESTOCK');
      setAdjustTierId('');
    } catch {
      alert('Adjustment failed.');
    } finally {
      setAdjusting(false);
    }
  };

  const filtered = useMemo(() => {
    let list = products;
    if (recountFilter) list = list.filter((p) => p.currentStock < 0);
    if (stockFilter === 'out') list = list.filter((p) => p.currentStock <= 0);
    if (stockFilter === 'low') list = list.filter((p) => p.currentStock > 0 && p.currentStock < 10);
    if (categoryFilter) list = list.filter((p) => p.category === categoryFilter);
    const q = search.toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [products, search, recountFilter, stockFilter, categoryFilter]);

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 52,
    overscan: 10,
  });

  const openEdit = (product: Product) => {
    setEditItem(product);
    setEditForm({ ...product });
    setEditTab('basic');
    setUploadError('');
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    setUploadError('');
    try {
      const result = await uploadToCloudinary(file, cloudinaryCloudName, cloudinaryUploadPreset, editForm.sku);
      setEditForm((f) => ({ ...f, imageUrl: result.secure_url }));
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploadingImage(false);
      if (imageFileRef.current) imageFileRef.current.value = '';
    }
  };

  const saveEdit = () => {
    if (!editItem) return;
    updateProduct.mutate({ id: editItem.id, updates: editForm });
    setEditItem(null);
  };

  const field = (key: keyof Product) => ({
    value: String(editForm[key] ?? ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setEditForm((f) => ({ ...f, [key]: e.target.value })),
  });

  const marginColor = (costPrice: number, sellingPrice: number) => {
    if (sellingPrice <= 0) return { background: 'var(--muted)', color: 'var(--muted-foreground)' };
    const pct = ((sellingPrice - costPrice) / sellingPrice) * 100;
    if (pct < 5) return { background: 'oklch(0.477 0.216 27.3 / 0.12)', color: 'var(--primary)' };
    if (pct < 15) return { background: 'oklch(0.75 0.15 60 / 0.15)', color: 'oklch(0.55 0.15 60)' };
    return { background: 'oklch(0.5 0.15 145 / 0.12)', color: 'oklch(0.4 0.15 145)' };
  };

  const stockColor = (stock: number) => {
    if (stock < 0) return { background: 'oklch(0.4 0.18 27.3 / 0.15)', color: 'oklch(0.55 0.22 27.3)' };
    if (stock === 0) return { background: 'oklch(0.477 0.216 27.3 / 0.12)', color: 'var(--primary)' };
    if (stock < 10) return { background: 'oklch(0.75 0.15 60 / 0.15)', color: 'oklch(0.55 0.15 60)' };
    return { background: 'oklch(0.5 0.15 145 / 0.12)', color: 'oklch(0.4 0.15 145)' };
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading from PostgreSQL…</span>
      </div>
    );
  }

  const editTiers: PackagingTier[] = editItem?.packagingTiers ?? [];

  return (
    <>
      {/* Search + count */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-10 bg-card" placeholder="Search inventory…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className="text-sm text-muted-foreground shrink-0 bg-card border rounded-lg px-3 py-2 font-mono">
          {filtered.length} / {products.length}
        </span>
      </div>

      {/* Table */}
      <div ref={tableContainerRef} className="border rounded-xl overflow-auto bg-card flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
              <th className="text-left p-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Item</th>
              <th className="text-left p-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Category</th>
              <th className="text-left p-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">SKU</th>
              <th className="text-left p-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Unit</th>
              <th className="text-right p-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Buying Price</th>
              <th className="text-right p-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Selling Price</th>
              <th className="text-center p-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Margin</th>
              <th className="text-center p-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Stock</th>
              <th className="text-center p-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Tiers</th>
              <th className="text-center p-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Img</th>
              {isAdmin && <th className="p-3" />}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 11 : 10} className="p-12 text-center text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  No items found
                </td>
              </tr>
            )}
            {rowVirtualizer.getVirtualItems().length > 0 && (
              <>
                {rowVirtualizer.getVirtualItems()[0].start > 0 && (
                  <tr><td style={{ height: rowVirtualizer.getVirtualItems()[0].start }} /></tr>
                )}
                {rowVirtualizer.getVirtualItems().map((vRow) => {
                  const p = filtered[vRow.index];
                  const tierCount = p.packagingTiers?.length ?? 0;
                  return (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors border-b border-border/50">
                      <td className="p-3 font-semibold">{p.name}</td>
                      <td className="p-3">
                        <div className="text-xs text-muted-foreground">{p.category}</div>
                        <div className="text-xs text-muted-foreground/60">{p.subCategory}</div>
                      </td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{p.sku}</td>
                      <td className="p-3 text-xs text-muted-foreground">{p.unit}</td>
                      <td className="p-3 text-right text-xs text-muted-foreground">
                        {p.costPrice > 0 ? Number(p.costPrice).toLocaleString() : '—'}
                      </td>
                      <td className="p-3 text-right font-bold text-sm" style={{ color: 'var(--primary)' }}>
                        {p.sellingPrice > 0 ? Number(p.sellingPrice).toLocaleString() : '—'}
                      </td>
                      <td className="p-3 text-center">
                        {p.sellingPrice > 0 ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={marginColor(p.costPrice, p.sellingPrice)}>
                            {(((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100).toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={stockColor(p.currentStock)}>
                          {p.currentStock < 0 ? `RECOUNT (${p.currentStock})` : p.currentStock === 0 ? 'Out' : p.currentStock}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {tierCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Layers className="h-3 w-3" />
                            {tierCount}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/30 text-xs">—</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {p.imageUrl ? (
                          <img src={thumbUrl(p.imageUrl)} alt="" loading="lazy" className="h-8 w-8 object-cover rounded-lg mx-auto" onError={(e) => { (e.currentTarget.style.display = 'none'); }} />
                        ) : (
                          <Package className="h-4 w-4 text-muted-foreground/20 mx-auto" />
                        )}
                      </td>
                      {isAdmin && (
                        <td className="p-3">
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => { setAdjustItem(p); setAdjustDelta(''); setAdjustReason('RESTOCK'); setAdjustNote(''); setAdjustTierId(''); }}
                              title="Adjust stock"
                              className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              <SlidersHorizontal className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => openEdit(p)} className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => deleteProduct.mutate(p.id)}
                              className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground transition-colors"
                              onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
                              onMouseLeave={e => (e.currentTarget.style.color = '')}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {(() => {
                  const items = rowVirtualizer.getVirtualItems();
                  const paddingBottom = rowVirtualizer.getTotalSize() - items[items.length - 1].end;
                  return paddingBottom > 0 ? <tr><td style={{ height: paddingBottom }} /></tr> : null;
                })()}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Comprehensive tabbed Edit sheet ────────────────────────────────── */}
      <Sheet open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <SheetContent className="flex flex-col">
          <SheetHeader>
            <SheetTitle className="font-black pr-8">
              {editItem?.name ?? 'Edit Item'}
            </SheetTitle>
            <p className="text-xs text-muted-foreground">{editItem?.sku}</p>
          </SheetHeader>

          <Tabs value={editTab} onValueChange={setEditTab} className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <TabsList className="shrink-0 w-full justify-start overflow-x-auto">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="packaging">
                Packaging
                {editTiers.length > 0 && (
                  <span className="ml-1.5 text-[9px] font-bold bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">
                    {editTiers.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="pricing">Pricing</TabsTrigger>
              <TabsTrigger value="stock">Stock</TabsTrigger>
              <TabsTrigger value="supplier" className="flex items-center gap-1">
                <Truck className="h-3 w-3" />Supplier
              </TabsTrigger>
              <TabsTrigger value="barcode" className="flex items-center gap-1">
                <Barcode className="h-3 w-3" />Barcode
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-1">
                <History className="h-3 w-3" />History
              </TabsTrigger>
            </TabsList>

            {/* ── Basic tab ─────────────────────────────────────────────── */}
            <TabsContent value="basic" className="overflow-y-auto pt-4 px-6 pb-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-semibold">Name</Label>
                  <Input {...field('name')} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">SKU</Label>
                  <Input {...field('sku')} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Unit (display label)</Label>
                  <Input placeholder="e.g. pcs, kg, litre" {...field('unit')} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Category</Label>
                  <Input {...field('category')} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Sub-Category</Label>
                  <Input {...field('subCategory')} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-semibold">Description</Label>
                  <Input {...field('description')} placeholder="Optional product description" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-semibold">Notes</Label>
                  <Input {...field('notes')} placeholder="Internal notes (not shown at POS)" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Manufacturing Date</Label>
                  <Input type="date" {...field('manufacturingDate')} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Expiry Date</Label>
                  <Input type="date" {...field('expiryDate')} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-semibold">Image</Label>
                  <div className="flex gap-2">
                    <Input placeholder="https://… or Cloudinary URL" {...field('imageUrl')} className="flex-1" />
                    <button
                      type="button"
                      onClick={() => imageFileRef.current?.click()}
                      disabled={uploadingImage}
                      className="shrink-0 h-9 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 hover:bg-muted transition-colors disabled:opacity-60"
                    >
                      {uploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageUp className="h-3.5 w-3.5" />}
                      {uploadingImage ? 'Uploading…' : 'Upload'}
                    </button>
                    <input ref={imageFileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </div>
                  {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
                  {editForm.imageUrl && (
                    <img src={editForm.imageUrl as string} alt="preview" className="h-16 w-16 object-cover rounded-lg mt-1 border" onError={(e) => { (e.currentTarget.style.display = 'none'); }} />
                  )}
                </div>
              </div>
            </TabsContent>

            {/* ── Packaging tab ──────────────────────────────────────────── */}
            <TabsContent value="packaging" className="overflow-y-auto pt-4 px-6 pb-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold">Packaging Tiers</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Define how this item is packaged. Stock is always tracked in base units (level&nbsp;0).
                    </p>
                  </div>
                </div>

                {editTiers.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    No tiers defined. Add a <strong>Piece</strong> tier (level 0, qty 1) as the base unit, then add Outer, Carton, Bale above it.
                  </div>
                )}

                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: 'var(--muted)' }} className="border-b">
                        <th className="p-2 text-left font-semibold text-muted-foreground">Name</th>
                        <th className="p-2 text-center font-semibold text-muted-foreground">Level</th>
                        <th className="p-2 text-center font-semibold text-muted-foreground">Qty / Base</th>
                        <th className="p-2 text-right font-semibold text-muted-foreground">Cost/Unit</th>
                        <th className="p-2 text-right font-semibold text-muted-foreground">Sell Price</th>
                        <th className="p-2 text-left font-semibold text-muted-foreground">Barcode</th>
                        <th className="p-2 text-center font-semibold text-muted-foreground">Base</th>
                        <th className="p-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {editTiers.map((tier) => (
                        <TierRow
                          key={tier.id}
                          tier={tier}
                          itemId={editItem!.id}
                          onUpdated={() => queryClient.invalidateQueries({ queryKey: ['products'] })}
                        />
                      ))}
                      {editItem && (
                        <AddTierRow
                          itemId={editItem.id}
                          existingLevels={editTiers.map((t) => t.level)}
                          onAdded={() => queryClient.invalidateQueries({ queryKey: ['products'] })}
                        />
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground">How ratios work</p>
                  <p>Example: 1 Carton = 24 Pieces. Set Piece (level 0, qty 1) as base, Carton (level 2, qty 24).</p>
                  <p>When receiving 2 cartons → stock increases by 48 pieces. When 1 piece is sold → 1 is deducted.</p>
                </div>
              </div>
            </TabsContent>

            {/* ── Pricing tab ────────────────────────────────────────────── */}
            <TabsContent value="pricing" className="overflow-y-auto pt-4 px-6 pb-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Buying Price / Cost (KES)</Label>
                  <Input
                    type="number"
                    value={String(editForm.costPrice ?? '')}
                    onChange={(e) => {
                      const cost = Number(e.target.value);
                      setEditForm((f) => ({ ...f, costPrice: cost, sellingPrice: calcNomadBitePrice(cost) }));
                    }}
                  />
                  <p className="text-[10px] text-muted-foreground">Per-piece buying cost. Use Packaging tab for per-tier buying cost.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>Selling Price (KES)</Label>
                  <Input type="number" {...field('sellingPrice')} />
                  <p className="text-[10px] text-muted-foreground">Vendor's own retail price per piece.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">NomadBite Price (KES)</Label>
                  <Input type="number" {...field('nomadBitePrice')} />
                  <p className="text-[10px] text-muted-foreground">Platform selling price (set by Superadmin markup).</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Tax Rate (%)</Label>
                  <Input type="number" {...field('taxRate')} />
                </div>

                {editTiers.length > 0 && (
                  <div className="col-span-2 rounded-lg border bg-muted/30 p-3 space-y-1.5">
                    <p className="text-xs font-semibold">Cost by Packaging Tier</p>
                    {editTiers.map((t) => (
                      <div key={t.id} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{t.name} ({Number(t.quantityInBase).toLocaleString()} pcs)</span>
                        <span className="font-semibold">KES {Number(t.costPrice).toLocaleString()}</span>
                      </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground">Edit tier-specific costs in the Packaging tab.</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Stock tab ──────────────────────────────────────────────── */}
            <TabsContent value="stock" className="overflow-y-auto pt-4 px-6 pb-4">
              <div className="space-y-4">
                {/* Total + Transfer button header */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold">Total Stock</p>
                    <p className="text-2xl font-black font-mono">
                      {Number(editForm.currentStock ?? 0).toLocaleString()}
                      <span className="text-xs font-normal text-muted-foreground ml-1.5">base units</span>
                    </p>
                  </div>
                  <button
                    onClick={() => setTransferOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold"
                    style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Transfer / Receive
                  </button>
                </div>

                {/* Per-location breakdown */}
                {editItemStock && editItemStock.locations.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: 'var(--muted)' }} className="border-b">
                          <th className="p-2.5 text-left font-semibold text-muted-foreground">Location</th>
                          <th className="p-2.5 text-right font-semibold text-muted-foreground">Units</th>
                          <th className="p-2.5 text-right font-semibold text-muted-foreground">Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {editItemStock.locations.map((loc) => {
                          const Icon = LOCATION_TYPE_ICONS[loc.locationType] ?? MoreHorizontal;
                          const colors = LOCATION_TYPE_COLORS[loc.locationType] ?? LOCATION_TYPE_COLORS.OTHER;
                          const total = editItemStock.locations.reduce((s, l) => s + Number(l.quantity), 0);
                          const pct = total > 0 ? (Number(loc.quantity) / total) * 100 : 0;
                          return (
                            <tr key={loc.locationId} className="border-b border-border/40 hover:bg-muted/20">
                              <td className="p-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="h-6 w-6 rounded flex items-center justify-center shrink-0"
                                    style={{ background: colors.bg, color: colors.text }}>
                                    <Icon className="h-3 w-3" />
                                  </div>
                                  <span className="font-semibold">{loc.locationName}</span>
                                </div>
                              </td>
                              <td className="p-2.5 text-right font-mono font-semibold">
                                {Number(loc.quantity).toLocaleString()}
                              </td>
                              <td className="p-2.5 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div
                                      className="h-full rounded-full"
                                      style={{ width: `${pct}%`, background: colors.text }}
                                    />
                                  </div>
                                  <span className="text-muted-foreground w-9 text-right">{pct.toFixed(0)}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {editItemStock.unallocated > 0 && (
                          <tr className="border-b border-border/40 bg-muted/10">
                            <td className="p-2.5">
                              <div className="flex items-center gap-2">
                                <div className="h-6 w-6 rounded flex items-center justify-center bg-muted text-muted-foreground shrink-0">
                                  <Package className="h-3 w-3" />
                                </div>
                                <span className="text-muted-foreground italic">Unallocated</span>
                              </div>
                            </td>
                            <td className="p-2.5 text-right font-mono text-muted-foreground">
                              {Number(editItemStock.unallocated).toLocaleString()}
                            </td>
                            <td className="p-2.5 text-right text-muted-foreground">—</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground space-y-1">
                    <p className="font-semibold">No location breakdown yet</p>
                    <p>Use <strong>Transfer / Receive</strong> to assign stock to specific locations (Warehouse, Shelf, etc.).</p>
                  </div>
                )}

                {/* Fractional toggle */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Fractional quantities</Label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(editForm.isFractional)}
                      onChange={(e) => setEditForm((f) => ({ ...f, isFractional: e.target.checked }))}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="text-xs text-muted-foreground">Allow fractional quantities (e.g. 0.5 kg)</span>
                  </label>
                </div>

                {/* Tier equivalents */}
                {editTiers.length > 0 && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                    <p className="text-xs font-semibold">Stock in packaging tiers</p>
                    {editTiers
                      .filter((t) => t.quantityInBase > 1)
                      .map((t) => {
                        const inTier = Number(editForm.currentStock ?? 0) / Number(t.quantityInBase);
                        return (
                          <div key={t.id} className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{t.name}s</span>
                            <span className="font-mono">{inTier % 1 === 0 ? inTier : inTier.toFixed(2)}</span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Supplier tab ───────────────────────────────────────────────── */}
            <TabsContent value="supplier" className="overflow-y-auto pt-4 px-6 pb-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-semibold">Supplier Name</Label>
                  <Input
                    placeholder="e.g. Unga Group PLC"
                    value={String(editForm.supplierName ?? '')}
                    onChange={(e) => setEditForm((f) => ({ ...f, supplierName: e.target.value }))}
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-semibold">Supplier Phone / Contact</Label>
                  <Input
                    placeholder="+254 700 000 000"
                    value={String(editForm.supplierPhone ?? '')}
                    onChange={(e) => setEditForm((f) => ({ ...f, supplierPhone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Lead Time (days)</Label>
                  <Input
                    type="number" min="0" placeholder="e.g. 3"
                    value={editForm.leadTimeDays ?? ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, leadTimeDays: e.target.value === '' ? null : Number(e.target.value) }))}
                  />
                  <p className="text-[10px] text-muted-foreground">Days from order to delivery.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Reorder Point (base units)</Label>
                  <Input
                    type="number" min="0" placeholder="e.g. 20"
                    value={editForm.reorderPoint ?? ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, reorderPoint: e.target.value === '' ? null : Number(e.target.value) }))}
                  />
                  <p className="text-[10px] text-muted-foreground">Alert when stock falls below this.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Reorder Quantity (base units)</Label>
                  <Input
                    type="number" min="0" placeholder="e.g. 48"
                    value={editForm.reorderQty ?? ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, reorderQty: e.target.value === '' ? null : Number(e.target.value) }))}
                  />
                  <p className="text-[10px] text-muted-foreground">How many units to order at once.</p>
                </div>

                {/* Reorder status */}
                {editForm.reorderPoint != null && (
                  <div className="col-span-2 rounded-lg border p-3 flex items-center gap-3"
                    style={
                      Number(editForm.currentStock) <= Number(editForm.reorderPoint)
                        ? { borderColor: 'oklch(0.477 0.216 27.3 / 0.4)', background: 'oklch(0.477 0.216 27.3 / 0.06)' }
                        : { borderColor: 'oklch(0.5 0.15 145 / 0.3)', background: 'oklch(0.5 0.15 145 / 0.06)' }
                    }
                  >
                    {Number(editForm.currentStock) <= Number(editForm.reorderPoint)
                      ? <TrendingDown className="h-4 w-4 shrink-0" style={{ color: 'var(--primary)' }} />
                      : <TrendingUp className="h-4 w-4 shrink-0" style={{ color: 'oklch(0.4 0.15 145)' }} />
                    }
                    <p className="text-xs">
                      Current stock <strong>{Number(editForm.currentStock).toLocaleString()}</strong> is{' '}
                      {Number(editForm.currentStock) <= Number(editForm.reorderPoint)
                        ? <span style={{ color: 'var(--primary)' }}>at or below</span>
                        : <span style={{ color: 'oklch(0.4 0.15 145)' }}>above</span>
                      }{' '}
                      the reorder point of <strong>{Number(editForm.reorderPoint).toLocaleString()}</strong>.
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Barcode tab ────────────────────────────────────────────────── */}
            <TabsContent value="barcode" className="overflow-y-auto pt-4 px-6 pb-4">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Item Barcode (SKU-level)</Label>
                  <Input
                    placeholder="Scan or type barcode"
                    value={String(editForm.barcode ?? '')}
                    onChange={(e) => setEditForm((f) => ({ ...f, barcode: e.target.value }))}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    This barcode identifies the item itself. For packaging-specific barcodes (e.g. carton vs piece), use the <strong>Packaging</strong> tab.
                  </p>
                </div>

                {editTiers.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold">Per-Tier Barcodes</p>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: 'var(--muted)' }} className="border-b">
                            <th className="p-2.5 text-left font-semibold text-muted-foreground">Tier</th>
                            <th className="p-2.5 text-left font-semibold text-muted-foreground">Qty / base</th>
                            <th className="p-2.5 text-left font-semibold text-muted-foreground">Barcode</th>
                          </tr>
                        </thead>
                        <tbody>
                          {editTiers.map((t) => (
                            <tr key={t.id} className="border-b border-border/40">
                              <td className="p-2.5 font-semibold">
                                {t.name}
                                {t.isBaseUnit && (
                                  <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                    style={{ background: 'oklch(0.477 0.216 27.3 / 0.12)', color: 'var(--primary)' }}>BASE</span>
                                )}
                              </td>
                              <td className="p-2.5 font-mono text-muted-foreground">{Number(t.quantityInBase).toLocaleString()}</td>
                              <td className="p-2.5 font-mono">{t.barcode ?? <span className="text-muted-foreground/40">—</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Edit tier barcodes in the <strong>Packaging</strong> tab.
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── History tab ────────────────────────────────────────────────── */}
            <TabsContent value="history" className="overflow-y-auto pt-4 px-6 pb-4">
              <ItemHistoryPanel itemId={editItem?.id ?? null} />
            </TabsContent>
          </Tabs>

          <div className="flex gap-3 px-6 py-4 shrink-0 border-t">
            <button
              onClick={() => setEditItem(null)}
              className="flex-1 py-2.5 rounded-lg border font-semibold text-sm hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={saveEdit}
              className="flex-1 py-2.5 rounded-lg font-bold text-sm transition-opacity hover:opacity-90"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              Save Changes
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Add Item dialog (unchanged) ─────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) { setAddForm(EMPTY_FORM); setAddUploadError(''); onAddClose?.(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-black">Add New Item</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold">Name <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. Omo Detergent 1kg" value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">SKU <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. OMO-1KG" value={addForm.sku} onChange={(e) => setAddForm((f) => ({ ...f, sku: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Unit</Label>
              <Input placeholder="e.g. pcs, kg, litre" value={addForm.unit} onChange={(e) => setAddForm((f) => ({ ...f, unit: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Category</Label>
              <Input placeholder="e.g. Detergents" value={addForm.category} onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Sub-Category</Label>
              <Input placeholder="e.g. Laundry" value={addForm.subCategory} onChange={(e) => setAddForm((f) => ({ ...f, subCategory: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Buying Price (KES)</Label>
              <Input type="number" min="0" value={addForm.costPrice || ''} onChange={(e) => {
                const cost = Number(e.target.value);
                setAddForm((f) => ({ ...f, costPrice: cost, sellingPrice: calcNomadBitePrice(cost) }));
              }} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>Selling Price (KES)</Label>
              <Input type="number" min="0" value={addForm.sellingPrice || ''} onChange={(e) => setAddForm((f) => ({ ...f, sellingPrice: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Initial Stock</Label>
              <Input type="number" value={addForm.currentStock || ''} onChange={(e) => setAddForm((f) => ({ ...f, currentStock: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Tax Rate (%)</Label>
              <Input type="number" min="0" max="100" value={addForm.taxRate || ''} onChange={(e) => setAddForm((f) => ({ ...f, taxRate: Number(e.target.value) }))} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold">Image</Label>
              <div className="flex gap-2">
                <Input placeholder="https://… or leave blank" value={addForm.imageUrl} onChange={(e) => setAddForm((f) => ({ ...f, imageUrl: e.target.value }))} className="flex-1" />
                <button
                  type="button"
                  onClick={() => addImageRef.current?.click()}
                  disabled={addUploadingImage}
                  className="shrink-0 h-9 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 hover:bg-muted transition-colors disabled:opacity-60"
                >
                  {addUploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageUp className="h-3.5 w-3.5" />}
                  {addUploadingImage ? 'Uploading…' : 'Upload'}
                </button>
                <input ref={addImageRef} type="file" accept="image/*" className="hidden" onChange={handleAddImageUpload} />
              </div>
              {addUploadError && <p className="text-xs text-destructive">{addUploadError}</p>}
              {addForm.imageUrl && (
                <img src={addForm.imageUrl} alt="preview" className="h-16 w-16 object-cover rounded-lg mt-1 border" onError={(e) => { (e.currentTarget.style.display = 'none'); }} />
              )}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => { setAddForm(EMPTY_FORM); setAddUploadError(''); onAddClose?.(); }} className="flex-1 py-2.5 rounded-lg border font-semibold text-sm hover:bg-muted transition-colors">
              Cancel
            </button>
            <button
              onClick={handleAddSave}
              disabled={addSaving || !addForm.name.trim() || !addForm.sku.trim()}
              className="flex-1 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              {addSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Add Item
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Stock Transfer dialog ──────────────────────────────────────── */}
      {transferOpen && editItem && (
        <StockTransferDialog
          itemId={editItem.id}
          itemName={editItem.name}
          packagingTiers={editItem.packagingTiers}
          onClose={() => {
            setTransferOpen(false);
            queryClient.invalidateQueries({ queryKey: ['products'] });
          }}
        />
      )}

      {/* ── Stock Adjustment dialog ─────────────────────────────────────── */}
      <Dialog open={!!adjustItem} onOpenChange={() => setAdjustItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-black">Adjust Stock</DialogTitle>
            {adjustItem && (
              <p className="text-sm text-muted-foreground mt-1">
                {adjustItem.name} · current: <strong>{adjustItem.currentStock}</strong>
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {adjustItem && (adjustItem.packagingTiers?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Count in</Label>
                <select
                  value={adjustTierId}
                  onChange={(e) => setAdjustTierId(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Base units (pieces)</option>
                  {adjustItem.packagingTiers!.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({Number(t.quantityInBase).toLocaleString()} pcs each)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Change in quantity</Label>
              <Input
                type="number"
                placeholder="+10 or -3"
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground">
                Positive = add stock · Negative = remove stock
                {adjustTierId && adjustItem?.packagingTiers && (() => {
                  const tier = adjustItem.packagingTiers!.find((t) => t.id === adjustTierId);
                  if (!tier || !adjustDelta) return null;
                  const baseQty = Number(adjustDelta) * Number(tier.quantityInBase);
                  return <> · {Number(adjustDelta)} {tier.name}(s) = <strong>{baseQty} pcs</strong></>;
                })()}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Reason</Label>
              <select
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {ADJUST_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Note (optional)</Label>
              <Input
                placeholder="e.g. 3 bottles broken during delivery"
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setAdjustItem(null)} className="flex-1 py-2.5 rounded-lg border font-semibold text-sm hover:bg-muted transition-colors">
                Cancel
              </button>
              <button
                onClick={handleAdjust}
                disabled={adjusting || adjustDelta === ''}
                className="flex-1 py-2.5 rounded-lg font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                {adjusting && <Loader2 className="h-4 w-4 animate-spin" />}
                Apply
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
