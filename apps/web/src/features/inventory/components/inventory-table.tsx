import { useRef, useState, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useProducts, useUpdateProduct, useDeleteProduct } from '@/hooks/use-products';
import { useAuthStore } from '@/features/auth/store/use-auth-store';
import { useSettingsStore } from '@/features/admin/store/use-settings-store';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { Product } from '@/types/pos';

function thumbUrl(url: string | undefined): string {
  if (!url) return '';
  if (url.includes('cloudinary.com') && url.includes('/upload/')) {
    return url.replace('/upload/', '/upload/f_auto,q_auto,w_64,h_64,c_fill/');
  }
  return url;
}
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Pencil, Trash2, Package, ImageUp, Loader2, SlidersHorizontal } from 'lucide-react';

const ADJUST_REASONS = [
  { value: 'RESTOCK', label: 'Restock' },
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'STOLEN', label: 'Stolen / Theft' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'PROMO', label: 'Promo / Giveaway' },
  { value: 'RECOUNT', label: 'Recount Correction' },
];

interface InventoryTableProps {
  recountFilter?: boolean;
  addOpen?: boolean;
  onAddClose?: () => void;
  categoryFilter?: string;
}

export function InventoryTable({ recountFilter = false, addOpen = false, onAddClose, categoryFilter = '' }: InventoryTableProps) {
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

  // Adjust stock dialog state (Phase 2.1)
  const [adjustItem, setAdjustItem] = useState<Product | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustReason, setAdjustReason] = useState('RESTOCK');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const handleAdjust = async () => {
    if (!adjustItem || adjustDelta === '' || isNaN(Number(adjustDelta))) return;
    setAdjusting(true);
    try {
      await api.products.adjustStock(adjustItem.id, Number(adjustDelta), adjustReason, adjustNote || undefined);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setAdjustItem(null);
      setAdjustDelta('');
      setAdjustNote('');
      setAdjustReason('RESTOCK');
    } catch {
      alert('Adjustment failed.');
    } finally {
      setAdjusting(false);
    }
  };

  const filtered = useMemo(() => {
    let list = products;
    if (recountFilter) list = list.filter((p) => p.currentStock < 0);
    if (categoryFilter) list = list.filter((p) => p.category === categoryFilter);
    const q = search.toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [products, search, recountFilter, categoryFilter]);

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 52,
    overscan: 10,
  });

  const openEdit = (product: Product) => {
    setEditItem(product);
    setEditForm({ ...product });
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
    if (stock < 0) return { background: 'oklch(0.4 0.18 27.3 / 0.15)', color: 'oklch(0.55 0.22 27.3)' }; // negative = recount
    if (stock === 0) return { background: 'oklch(0.477 0.216 27.3 / 0.12)', color: 'var(--primary)' };    // zero = out
    if (stock < 10) return { background: 'oklch(0.75 0.15 60 / 0.15)', color: 'oklch(0.55 0.15 60)' };   // low
    return { background: 'oklch(0.5 0.15 145 / 0.12)', color: 'oklch(0.4 0.15 145)' };                    // good
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading from PostgreSQL…</span>
      </div>
    );
  }

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
              <th className="text-center p-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Img</th>
              {isAdmin && <th className="p-3" />}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 10 : 9} className="p-12 text-center text-muted-foreground">
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
                              onClick={() => { setAdjustItem(p); setAdjustDelta(''); setAdjustReason('RESTOCK'); setAdjustNote(''); }}
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

      {/* Edit dialog */}
      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-black">Edit Item</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold">Name</Label>
              <Input {...field('name')} />
            </div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">SKU</Label><Input {...field('sku')} /></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Unit</Label><Input {...field('unit')} /></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Category</Label><Input {...field('category')} /></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Sub-Category</Label><Input {...field('subCategory')} /></div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Buying Price (KES)</Label>
              <Input type="number" {...field('costPrice')}
                onChange={(e) => {
                  const cost = Number(e.target.value);
                  setEditForm((f) => ({ ...f, costPrice: cost, sellingPrice: calcNomadBitePrice(cost) }));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>Selling Price (KES)</Label>
              <Input type="number" {...field('sellingPrice')} />
            </div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Stock</Label><Input type="number" {...field('currentStock')} /></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Tax Rate (%)</Label><Input type="number" {...field('taxRate')} /></div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold">Image</Label>
              <div className="flex gap-2">
                <Input placeholder="https://… or Cloudinary URL" {...field('imageUrl')} className="flex-1" />
                <button
                  type="button"
                  onClick={() => imageFileRef.current?.click()}
                  disabled={uploadingImage}
                  title={cloudinaryCloudName && cloudinaryUploadPreset ? 'Upload to Cloudinary' : 'Configure Cloudinary in Admin → Image Settings first'}
                  className="shrink-0 h-9 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 hover:bg-muted transition-colors disabled:opacity-60"
                >
                  {uploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageUp className="h-3.5 w-3.5" />}
                  {uploadingImage ? 'Uploading…' : 'Upload'}
                </button>
                <input ref={imageFileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </div>
              {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
              {editForm.imageUrl && (
                <img src={editForm.imageUrl} alt="preview" className="h-16 w-16 object-cover rounded-lg mt-1 border" onError={(e) => { (e.currentTarget.style.display = 'none'); }} />
              )}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setEditItem(null)} className="flex-1 py-2.5 rounded-lg border font-semibold text-sm hover:bg-muted transition-colors">
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
        </DialogContent>
      </Dialog>

      {/* Add Item dialog */}
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

      {/* Inventory Adjustment dialog (Phase 2.1) */}
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
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Change in quantity</Label>
              <Input
                type="number"
                placeholder="+10 or -3"
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground">Positive = add stock · Negative = remove stock</p>
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
