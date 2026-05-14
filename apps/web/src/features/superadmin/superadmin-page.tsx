import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api, ApiUser } from '@/lib/api';
import { useAuthStore } from '@/features/auth/store/use-auth-store';
import { parseSpreadsheet } from '@/lib/file-parser';
import { useSettingsStore } from '@/features/admin/store/use-settings-store';
import { SuperAdminImageMatcher } from './components/superadmin-image-matcher';
import {
  Store, TrendingUp, ShoppingBag, Users,
  Plus, RefreshCw, LogOut, Loader2, X, CheckCircle2, AlertCircle,
  Pencil, Trash2, UserPlus, Shield, User, Package, Percent,
  LayoutDashboard, Boxes, Settings2, Search, Upload, Image, SlidersHorizontal, Activity,
} from 'lucide-react';

function thumbUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.includes('cloudinary.com') && url.includes('/upload/')) {
    return url.replace('/upload/', '/upload/f_auto,q_auto,w_64,h_64,c_fill/');
  }
  return url;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white border rounded-2xl p-5 space-y-1">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-black">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

const ROLE_STYLES: Record<string, string> = {
  SUPERADMIN: 'bg-purple-100 text-purple-700',
  ADMIN:      'bg-orange-100 text-orange-700',
  CASHIER:    'bg-blue-100  text-blue-700',
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${ROLE_STYLES[role] ?? 'bg-gray-100 text-gray-500'}`}>
      {role === 'SUPERADMIN' ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />}
      {role}
    </span>
  );
}

// ─── Add Store Modal ───────────────────────────────────────────────────────────

function AddStoreModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', slug: '', ownerName: '', phone: '', email: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleCreate = async () => {
    if (!form.name.trim() || !form.slug.trim()) { setError('Name and slug are required.'); return; }
    setSaving(true);
    setError('');
    try {
      await api.stores.create({
        name: form.name.trim(),
        slug: form.slug.trim().toLowerCase().replace(/\s+/g, '-'),
        ownerName: form.ownerName || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
      });
      onCreated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes('409') || msg.toLowerCase().includes('slug') ? 'Slug already in use — choose a different one.' : msg || 'Failed to create store.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-lg">New Store</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        {[
          { key: 'name'      as const, label: 'Store Name *',         placeholder: 'NomadBite Westlands' },
          { key: 'slug'      as const, label: 'Slug * (URL-safe ID)', placeholder: 'westlands' },
          { key: 'ownerName' as const, label: 'Owner / Manager',      placeholder: '' },
          { key: 'phone'     as const, label: 'Phone',                placeholder: '+254 7xx xxx xxx' },
          { key: 'email'     as const, label: 'Email',                placeholder: '' },
          { key: 'address'   as const, label: 'Address',              placeholder: '' },
        ].map(({ key, label, placeholder }) => (
          <div key={key} className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
            <input
              className="w-full h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm"
              placeholder={placeholder}
              value={form[key]}
              onChange={set(key)}
            />
          </div>
        ))}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex-1 h-10 rounded-xl bg-orange-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create Store
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── User Modal (Add + Edit) ───────────────────────────────────────────────────

interface UserModalProps {
  user?: ApiUser;
  stores: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}

function UserModal({ user, stores, onClose, onSaved }: UserModalProps) {
  const isEdit = !!user;
  const [name, setName]       = useState(user?.name ?? '');
  const [pin, setPin]         = useState('');
  const [role, setRole]       = useState<'SUPERADMIN' | 'ADMIN' | 'CASHIER'>(user?.role ?? 'CASHIER');
  const [storeId, setStoreId] = useState<string>(user?.storeId ?? '');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!isEdit && pin.length !== 4) { setError('PIN must be exactly 4 digits.'); return; }
    if (isEdit && pin && pin.length !== 4) { setError('PIN must be exactly 4 digits.'); return; }
    if (role !== 'SUPERADMIN' && !storeId) { setError('Select a store for this user.'); return; }

    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await api.users.update(user.id, {
          name: name.trim(),
          ...(pin ? { pin } : {}),
          role,
          storeId: role === 'SUPERADMIN' ? null : storeId,
        });
      } else {
        await api.users.create({
          name: name.trim(),
          pin,
          role,
          storeId: role === 'SUPERADMIN' ? undefined : storeId,
        });
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save user.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-lg">{isEdit ? 'Edit User' : 'New User'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Name *</label>
          <input
            className="w-full h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm"
            placeholder="e.g. Jane Cashier"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            PIN {isEdit ? '(leave blank to keep current)' : '*'}
          </label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            className="w-full h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-mono tracking-widest"
            placeholder="4 digits"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Role *</label>
          <select
            className="w-full h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
          >
            <option value="CASHIER">CASHIER</option>
            <option value="ADMIN">ADMIN</option>
            <option value="SUPERADMIN">SUPERADMIN</option>
          </select>
        </div>

        {role !== 'SUPERADMIN' && (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Store *</label>
            <select
              className="w-full h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
            >
              <option value="">— select a store —</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 h-10 rounded-xl bg-orange-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Superadmin Bulk Import Modal ─────────────────────────────────────────────

function SuperAdminImportModal({ stores, onClose, onImported }: { stores: Array<{ id: string; name: string }>; onClose: () => void; onImported?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [storeId, setStoreId] = useState('');
  const [replaceAll, setReplaceAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ succeeded: number; failed: number } | null>(null);
  const [error, setError] = useState('');
  const { serviceFeePercent } = useSettingsStore();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!storeId) { setError('Select a store first.'); return; }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const parsed = await parseSpreadsheet(file, serviceFeePercent);
      if (parsed.products.length === 0) { setError('No products found in the file.'); setLoading(false); return; }
      const res = await api.superadmin.importForStore(storeId, parsed.products as never, replaceAll);
      setResult(res);
      onImported?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-lg">Bulk Import to Store</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Target Store *</label>
          <select
            className="w-full h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm"
            value={storeId}
            onChange={(e) => { setStoreId(e.target.value); setError(''); setResult(null); }}
          >
            <option value="">— select a store —</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <label className={`flex items-start gap-3 rounded-xl border-2 p-4 cursor-pointer transition-colors ${replaceAll ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}>
          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-red-600" checked={replaceAll} onChange={(e) => setReplaceAll(e.target.checked)} />
          <div>
            <p className={`font-semibold text-sm ${replaceAll ? 'text-red-700' : ''}`}>Clear store inventory before import</p>
            <p className="text-xs text-gray-400 mt-0.5">Deletes all existing items in the selected store, then imports the file.</p>
          </div>
        </label>

        <div
          className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-orange-400 transition-colors"
          onClick={() => storeId && fileRef.current?.click()}
        >
          {loading
            ? <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
            : <Upload className="h-8 w-8 text-gray-300" />
          }
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-600">{loading ? 'Importing…' : storeId ? 'Click to choose file' : 'Select a store first'}</p>
            <p className="text-xs text-gray-400">Supports .xlsx, .xls, .csv</p>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.ods" className="hidden" onChange={handleFile} disabled={!storeId || loading} />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl p-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {result && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-xl p-3">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span><strong>{result.succeeded}</strong> imported{result.failed > 0 ? `, ${result.failed} failed` : ''}</span>
          </div>
        )}

        <button onClick={onClose} className="w-full h-10 rounded-xl border text-sm font-semibold text-gray-600 hover:bg-gray-50">
          {result ? 'Done' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}

// ─── Inventory Tab ─────────────────────────────────────────────────────────────

function InventoryTab({ stores }: { stores: Array<{ id: string; name: string }> }) {
  const [storeFilter, setStoreFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [imageMatcherOpen, setImageMatcherOpen] = useState(false);
  const qc = useQueryClient();
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const { data: globalSettings } = useQuery({
    queryKey: ['superadmin-global-settings'],
    queryFn: () => api.superadmin.getGlobalSettings(),
    staleTime: 60_000,
  });

  const { data: items = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['superadmin-inventory', storeFilter, search],
    queryFn: () => api.superadmin.inventory({
      storeId: storeFilter || undefined,
      search: search || undefined,
    }),
    staleTime: 30_000,
  });

  const handleSearch = () => setSearch(searchInput);

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 56,
    overscan: 8,
    measureElement: useCallback((el: Element) => el.getBoundingClientRect().height, []),
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop    = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0
    ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
    : 0;

  const stockColor = (stock: number) => {
    if (stock < 0) return 'text-red-600 bg-red-50';
    if (stock === 0) return 'text-orange-600 bg-orange-50';
    if (stock < 10) return 'text-yellow-700 bg-yellow-50';
    return 'text-green-700 bg-green-50';
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium min-w-[180px]"
          value={storeFilter}
          onChange={(e) => setStoreFilter(e.target.value)}
        >
          <option value="">All Stores</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <div className="flex gap-2 flex-1 min-w-[220px]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              className="w-full h-9 rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm"
              placeholder="Search name, SKU, category…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <button
            onClick={handleSearch}
            className="h-9 px-3 rounded-xl border text-xs font-semibold text-gray-600 hover:bg-gray-100"
          >
            Search
          </button>
        </div>

        <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-1 rounded-lg font-mono">
          {items.length} items
        </span>

        <button
          onClick={() => refetch()}
          className="h-9 w-9 flex items-center justify-center rounded-xl border text-gray-500 hover:bg-gray-100"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>

        <button
          onClick={() => setImportOpen(true)}
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 transition-colors"
        >
          <Upload className="h-3.5 w-3.5" />
          Import
        </button>

        <button
          onClick={() => setImageMatcherOpen(true)}
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl border border-orange-600 text-orange-600 text-xs font-bold hover:bg-orange-50 transition-colors"
        >
          <Image className="h-3.5 w-3.5" />
          Images
        </button>
      </div>

      {importOpen && (
        <SuperAdminImportModal
          stores={stores}
          onClose={() => setImportOpen(false)}
          onImported={() => qc.invalidateQueries({ queryKey: ['superadmin-inventory'] })}
        />
      )}

      {imageMatcherOpen && (
        <SuperAdminImageMatcher
          open={imageMatcherOpen}
          onClose={() => setImageMatcherOpen(false)}
          products={items}
          cloudinaryCloudName={globalSettings?.cloudinaryCloudName ?? ''}
          cloudinaryUploadPreset={globalSettings?.cloudinaryUploadPreset ?? ''}
        />
      )}

      {isError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm font-bold text-red-700">Could not load inventory</p>
        </div>
      )}

      <div className="bg-white border rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading inventory…</span>
          </div>
        ) : (
          <div ref={tableContainerRef} className="overflow-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-gray-50">
                  {['Stores', 'Item', 'SKU', 'Category', 'Buying Price', "Vendor's Selling Price", 'NomadBite Price', 'Tax %', 'Stock'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center text-gray-400">
                      <Boxes className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">No items found</p>
                    </td>
                  </tr>
                )}
                {paddingTop > 0 && <tr><td style={{ height: paddingTop }} /></tr>}
                {virtualItems.map((vRow) => {
                  const item = items[vRow.index];
                  return (
                    <tr key={item.id} className="hover:bg-gray-50 border-b border-gray-100">
                      <td className="px-4 py-3">
                        {item.storeCount > 1
                          ? <span className="text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">{item.storeCount} stores</span>
                          : <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{item.storeName}</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {item.imageUrl
                            ? <img src={thumbUrl(item.imageUrl)} alt="" loading="lazy" className="h-8 w-8 rounded-lg object-cover shrink-0" />
                            : <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0"><Package className="h-4 w-4 text-gray-300" /></div>
                          }
                          <span className="font-semibold">{item.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{item.sku}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        <div>{item.category}</div>
                        {item.subCategory && <div className="text-gray-300">{item.subCategory}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {item.costPrice > 0 ? Number(item.costPrice).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {item.sellingPrice > 0 ? Number(item.sellingPrice).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3 font-bold text-orange-600">
                        {item.nomadBitePrice > 0 ? Number(item.nomadBitePrice).toLocaleString() : <span className="text-gray-300 font-normal text-xs">not set</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{item.taxRate > 0 ? `${item.taxRate}%` : '0%'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${stockColor(item.currentStock)}`}>
                          {item.currentStock < 0 ? `RECOUNT (${item.currentStock})` : item.currentStock === 0 ? 'Out' : item.currentStock}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {paddingBottom > 0 && <tr><td style={{ height: paddingBottom }} /></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Pricing Tab ───────────────────────────────────────────────────────────────

function PricingTab() {
  const qc = useQueryClient();

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['superadmin-global-settings'],
    queryFn: () => api.superadmin.getGlobalSettings(),
    staleTime: 60_000,
  });

  const [markup, setMarkup]           = useState<string>('');
  const [cloudName, setCloudName]     = useState('');
  const [uploadPreset, setUploadPreset] = useState('');
  const [savingMarkup, setSavingMarkup] = useState(false);
  const [savingCloud, setSavingCloud]   = useState(false);
  const [saveMsg, setSaveMsg]           = useState('');
  const [vendorMarkup, setVendorMarkup] = useState('20');
  const [roundTo, setRoundTo]           = useState(10);
  const [onlyUnset, setOnlyUnset]       = useState(false);

  useEffect(() => {
    if (!settings) return;
    if (settings.globalMarkupPercent !== undefined) setMarkup(String(settings.globalMarkupPercent));
    if (settings.cloudinaryCloudName)   setCloudName(settings.cloudinaryCloudName);
    if (settings.cloudinaryUploadPreset) setUploadPreset(settings.cloudinaryUploadPreset);
  }, [settings]);

  const recalcMutation = useMutation({
    mutationFn: () => api.superadmin.recalculatePrices(),
    onSuccess: (data) => {
      setSaveMsg(`✓ Recalculated ${data.updated} items at ${data.markupPercent}% markup.`);
      qc.invalidateQueries({ queryKey: ['superadmin-inventory'] });
      setTimeout(() => setSaveMsg(''), 6000);
    },
    onError: (err: Error) => setSaveMsg(`Error: ${err.message}`),
  });

  const handleSaveCloudinary = async () => {
    setSavingCloud(true);
    setSaveMsg('');
    try {
      await api.superadmin.saveGlobalSettings({ cloudinaryCloudName: cloudName, cloudinaryUploadPreset: uploadPreset });
      await qc.invalidateQueries({ queryKey: ['superadmin-global-settings'] });
      setSaveMsg('✓ Cloudinary settings saved.');
      setTimeout(() => setSaveMsg(''), 4000);
    } catch (err: unknown) {
      setSaveMsg(`Error: ${err instanceof Error ? err.message : 'Failed to save'}`);
    } finally {
      setSavingCloud(false);
    }
  };

  const setVendorMutation = useMutation({
    mutationFn: () => api.superadmin.setVendorPrices(Number(vendorMarkup), roundTo, onlyUnset),
    onSuccess: (data) => {
      setSaveMsg(`✓ Set vendor selling prices for ${data.updated} items.`);
      qc.invalidateQueries({ queryKey: ['superadmin-inventory'] });
      setTimeout(() => setSaveMsg(''), 6000);
    },
    onError: (err: Error) => setSaveMsg(`Error: ${err.message}`),
  });

  const handleSaveMarkup = async () => {
    const val = Number(markup);
    if (isNaN(val) || val < 0) return;
    setSavingMarkup(true);
    setSaveMsg('');
    try {
      await api.superadmin.saveGlobalSettings({ globalMarkupPercent: val });
      await qc.invalidateQueries({ queryKey: ['superadmin-global-settings'] });
      setSaveMsg(`✓ Markup saved as ${val}%.`);
      setTimeout(() => setSaveMsg(''), 4000);
    } catch (err: unknown) {
      setSaveMsg(`Error: ${err instanceof Error ? err.message : 'Failed to save'}`);
    } finally {
      setSavingMarkup(false);
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      {/* Markup setting */}
      <div className="bg-white border rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Percent className="h-4 w-4 text-orange-600" />
          <p className="font-bold text-sm">Global Markup Percentage</p>
        </div>
        <p className="text-xs text-gray-500">
          This is the margin NomadBite earns on every product. <br />
          <strong>NomadBite Price = Cost Price × (1 + Markup%)</strong><br />
          Applies across all stores when you recalculate.
        </p>

        {settingsLoading ? (
          <div className="flex items-center gap-2 text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Loading…</span></div>
        ) : (
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Markup %</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="1000"
                  step="0.5"
                  className="w-full h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 pr-8 text-sm font-semibold"
                  value={markup}
                  onChange={(e) => setMarkup(e.target.value)}
                  placeholder="e.g. 16.5"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">%</span>
              </div>
            </div>
            <button
              onClick={handleSaveMarkup}
              disabled={savingMarkup}
              className="h-10 px-5 rounded-xl bg-orange-600 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-60 hover:bg-orange-700"
            >
              {savingMarkup && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </button>
          </div>
        )}
      </div>

      {/* Recalculate all prices */}
      <div className="bg-white border rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-orange-600" />
          <p className="font-bold text-sm">Recalculate All Prices</p>
        </div>
        <p className="text-xs text-gray-500">
          Applies the saved markup % to every product across every store — overwriting their current NomadBite prices.
          Run this after uploading new products or changing the markup.
        </p>

        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700 font-medium">
          This overwrites all NomadBite prices. Cost prices are not affected. Make sure the markup above is saved first.
        </div>

        <button
          onClick={() => recalcMutation.mutate()}
          disabled={recalcMutation.isPending}
          className="w-full h-11 rounded-xl border-2 border-orange-600 text-orange-600 text-sm font-bold flex items-center justify-center gap-2 hover:bg-orange-50 disabled:opacity-60 transition-colors"
        >
          {recalcMutation.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Recalculating…</>
            : <><RefreshCw className="h-4 w-4" /> Recalculate All Prices</>
          }
        </button>
      </div>

      {/* Set vendor selling prices */}
      <div className="bg-white border rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-orange-600" />
          <p className="font-bold text-sm">Set Vendor Selling Prices</p>
        </div>
        <p className="text-xs text-gray-500">
          Calculates vendor selling prices from cost price using a fixed markup.
          Optionally rounds up to clean KES amounts — then run Recalculate to update NomadBite prices.
        </p>

        <div className="space-y-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Markup %</label>
              <div className="relative">
                <input
                  type="number" min="0" max="1000" step="0.5"
                  className="w-full h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 pr-8 text-sm font-semibold"
                  value={vendorMarkup}
                  onChange={(e) => setVendorMarkup(e.target.value)}
                  placeholder="e.g. 20"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">%</span>
              </div>
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Round up to nearest</label>
              <div className="flex gap-1.5">
                {[0, 5, 10, 50].map((v) => (
                  <button
                    key={v}
                    onClick={() => setRoundTo(v)}
                    className={`flex-1 h-10 rounded-xl border text-xs font-bold transition-colors ${
                      roundTo === v
                        ? 'bg-orange-600 text-white border-orange-600'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {v === 0 ? 'None' : `KES ${v}`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded accent-orange-600"
              checked={onlyUnset}
              onChange={(e) => setOnlyUnset(e.target.checked)}
            />
            <div>
              <p className="text-sm font-semibold text-gray-700">Only items with no selling price set</p>
              <p className="text-xs text-gray-400">Leave unchecked to overwrite all vendor selling prices</p>
            </div>
          </label>

          {vendorMarkup && Number(vendorMarkup) >= 0 && (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600 font-mono">
              Cost KES 100 → KES {
                roundTo > 0
                  ? Math.ceil(100 * (1 + Number(vendorMarkup) / 100) / roundTo) * roundTo
                  : Math.round(100 * (1 + Number(vendorMarkup) / 100) * 100) / 100
              }
              {roundTo > 0 && <span className="text-gray-400 font-sans"> (rounded up to KES {roundTo})</span>}
            </div>
          )}
        </div>

        <button
          onClick={() => setVendorMutation.mutate()}
          disabled={setVendorMutation.isPending || !vendorMarkup || Number(vendorMarkup) < 0}
          className="w-full h-11 rounded-xl bg-orange-600 text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-orange-700 disabled:opacity-60 transition-colors"
        >
          {setVendorMutation.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Applying…</>
            : <><SlidersHorizontal className="h-4 w-4" /> Set Vendor Prices</>
          }
        </button>
      </div>

      {/* Cloudinary config */}
      <div className="bg-white border rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Image className="h-4 w-4 text-orange-600" />
          <p className="font-bold text-sm">Cloudinary Settings</p>
        </div>
        <p className="text-xs text-gray-500">
          Required for bulk image upload in the Inventory tab. Images are uploaded here and propagated across all stores automatically.
        </p>
        {settingsLoading ? (
          <div className="flex items-center gap-2 text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Loading…</span></div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cloud Name</label>
              <input
                className="w-full h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-mono"
                placeholder="e.g. my-cloud-name"
                value={cloudName}
                onChange={(e) => setCloudName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Upload Preset</label>
              <input
                className="w-full h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-mono"
                placeholder="e.g. unsigned_preset"
                value={uploadPreset}
                onChange={(e) => setUploadPreset(e.target.value)}
              />
            </div>
            <button
              onClick={handleSaveCloudinary}
              disabled={savingCloud}
              className="h-10 px-5 rounded-xl bg-orange-600 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-60 hover:bg-orange-700"
            >
              {savingCloud && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Cloudinary Settings
            </button>
          </div>
        )}
      </div>

      {saveMsg && (
        <p className={`text-sm font-semibold px-4 py-3 rounded-xl ${saveMsg.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
          {saveMsg}
        </p>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'inventory' | 'pricing';

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: 'dashboard', label: 'Dashboard',  icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'inventory', label: 'Inventory',  icon: <Boxes className="h-4 w-4" /> },
  { id: 'pricing',   label: 'Pricing',    icon: <Settings2 className="h-4 w-4" /> },
];

export function SuperAdminPage() {
  const { logout, user: me } = useAuthStore();
  const qc = useQueryClient();

  const [activeTab, setActiveTab]         = useState<Tab>('dashboard');
  const [addStoreOpen, setAddStoreOpen]   = useState(false);
  const [userModal, setUserModal]         = useState<{ open: boolean; editing?: ApiUser }>({ open: false });
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['superadmin-dashboard'],
    queryFn: () => api.superadmin.dashboard(),
    staleTime: 60_000,
    retry: 2,
  });

  const { data: allUsers = [], isLoading: usersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ['superadmin-users'],
    queryFn: () => api.users.list(),
    staleTime: 30_000,
  });

  const { data: allStores = [] } = useQuery({
    queryKey: ['superadmin-stores'],
    queryFn: () => api.stores.list(),
    staleTime: 60_000,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['superadmin-dashboard'] });
    qc.invalidateQueries({ queryKey: ['superadmin-users'] });
    qc.invalidateQueries({ queryKey: ['superadmin-stores'] });
  };

  const handleStoreCreated = () => { setAddStoreOpen(false); invalidateAll(); };

  const toggleActive = async (id: string, current: boolean) => {
    await api.stores.update(id, { isActive: !current });
    invalidateAll();
  };

  const handleUserSaved  = () => { setUserModal({ open: false }); invalidateAll(); };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    setDeletingUserId(userId);
    try {
      await api.users.delete(userId);
      invalidateAll();
    } catch {
      alert('Could not delete user.');
    } finally {
      setDeletingUserId(null);
    }
  };

  const summary    = data?.summary;
  const storeStats = data?.stores ?? [];
  const storeNameMap = useMemo(() => new Map(allStores.map((s) => [s.id, s.name])), [allStores]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="bg-white border-b px-6 h-14 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-orange-600 flex items-center justify-center">
            <Store className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="font-black text-sm leading-tight">NomadBite</p>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Super Admin</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500">{me?.name}</span>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </header>

      {/* ── Tab bar ── */}
      <div className="bg-white border-b px-6">
        <div className="flex gap-1 -mb-px">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-orange-600 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto p-6 space-y-8">

        {/* ════════════ DASHBOARD TAB ════════════ */}
        {activeTab === 'dashboard' && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h1 className="text-xl font-black">Dashboard</h1>
                <p className="text-sm text-gray-500">All stores · Today</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { refetch(); refetchUsers(); }}
                  className="flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-semibold text-gray-600 hover:bg-gray-100"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </button>
                <button
                  onClick={() => setAddStoreOpen(true)}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Store
                </button>
              </div>
            </div>

            {isError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-red-700">Could not load dashboard data</p>
                    <p className="text-xs text-red-500 mt-0.5">Check that the API server is running and the database is reachable.</p>
                  </div>
                </div>
                <button
                  onClick={() => refetch()}
                  className="shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-lg border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-100"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading dashboard…</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatCard label="Revenue Today"  value={`KES ${(summary?.totalRevenueToday ?? 0).toLocaleString()}`} />
                <StatCard label="Transactions"   value={summary?.totalTransactionsToday ?? 0} sub="today" />
                <StatCard label="Active Stores"  value={`${summary?.activeStores ?? 0} / ${summary?.totalStores ?? 0}`} />
                <StatCard label="Open Shifts"    value={summary?.activeShifts ?? 0} />
                <StatCard label="Total Users"    value={allUsers.length} />
              </div>
            )}

            {/* Store Performance */}
            {!isLoading && (
              <div className="bg-white border rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-orange-600" />
                  <p className="font-bold text-sm">Store Performance</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        {['Store', 'Status', 'Revenue Today', 'Revenue (7d)', 'Txns Today', 'Open Shifts', 'Top Product'].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {storeStats.map((s) => (
                        <tr key={s.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-lg bg-orange-600/10 flex items-center justify-center shrink-0">
                                <ShoppingBag className="h-4 w-4 text-orange-600" />
                              </div>
                              <div>
                                <p className="font-semibold text-sm">{s.name}</p>
                                <p className="text-[10px] text-gray-400 font-mono">{s.slug}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${s.isActive ? 'bg-green-500/10 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {s.isActive ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                              {s.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold">KES {s.revenueToday.toLocaleString()}</td>
                          <td className="px-4 py-3 text-gray-500">KES {s.revenueWeek.toLocaleString()}</td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1">
                              <ShoppingBag className="h-3 w-3 text-gray-400" />{s.transactionsToday}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3 text-gray-400" />{s.activeShifts}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px] truncate">{s.topProduct ?? '—'}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => toggleActive(s.id, s.isActive)}
                              className="text-xs font-semibold text-gray-400 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                            >
                              {s.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {storeStats.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
                      <Activity className="h-8 w-8 opacity-20" />
                      <p className="text-sm font-medium">{isError ? 'Could not load stores' : 'No stores yet'}</p>
                      {!isError && <p className="text-xs opacity-60">Click "New Store" to create your first store.</p>}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Users panel */}
            <div className="bg-white border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-orange-600" />
                  <p className="font-bold text-sm">Users</p>
                  <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {allUsers.length}
                  </span>
                </div>
                <button
                  onClick={() => setUserModal({ open: true })}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 transition-colors"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Add User
                </button>
              </div>

              {usersLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading users…</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Store</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {allUsers.map((u) => {
                        const isMe = u.id === me?.id;
                        const storeName = u.storeId ? (storeNameMap.get(u.storeId) ?? u.storeId) : null;
                        return (
                          <tr key={u.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0 text-xs font-black text-orange-700">
                                  {u.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-semibold text-sm">{u.name}</p>
                                  {isMe && <p className="text-[10px] text-orange-600 font-semibold">you</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {storeName
                                ? <span className="flex items-center gap-1"><ShoppingBag className="h-3 w-3 text-gray-400 shrink-0" />{storeName}</span>
                                : <span className="text-gray-300 italic text-xs">Global / No store</span>
                              }
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1 justify-end">
                                <button
                                  onClick={() => setUserModal({ open: true, editing: u })}
                                  className="h-7 w-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                                  title="Edit user"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(u.id)}
                                  disabled={isMe || deletingUserId === u.id}
                                  title={isMe ? "Can't delete yourself" : 'Delete user'}
                                  className="h-7 w-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  {deletingUserId === u.id
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <Trash2 className="h-3.5 w-3.5" />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {allUsers.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-3">
                      <Users className="h-8 w-8 opacity-20" />
                      <p className="text-sm">No users yet</p>
                      <button
                        onClick={() => setUserModal({ open: true })}
                        className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-semibold hover:bg-gray-50"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Add first user
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ════════════ INVENTORY TAB ════════════ */}
        {activeTab === 'inventory' && (
          <>
            <div>
              <h1 className="text-xl font-black">Master Inventory</h1>
              <p className="text-sm text-gray-500">All products across all stores — cost prices visible to superadmin only</p>
            </div>
            <InventoryTab stores={allStores} />
          </>
        )}

        {/* ════════════ PRICING TAB ════════════ */}
        {activeTab === 'pricing' && (
          <>
            <div>
              <h1 className="text-xl font-black">Global Pricing</h1>
              <p className="text-sm text-gray-500">Set the markup % that drives NomadBite prices across all stores</p>
            </div>
            <PricingTab />
          </>
        )}

      </main>

      {/* ── Modals ── */}
      {addStoreOpen && (
        <AddStoreModal onClose={() => setAddStoreOpen(false)} onCreated={handleStoreCreated} />
      )}
      {userModal.open && (
        <UserModal
          user={userModal.editing}
          stores={allStores}
          onClose={() => setUserModal({ open: false })}
          onSaved={handleUserSaved}
        />
      )}
    </div>
  );
}
