import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiUser } from '@/lib/api';
import { useAuthStore } from '@/features/auth/store/use-auth-store';
import {
  Store, TrendingUp, ShoppingBag, Users, Activity,
  Plus, RefreshCw, LogOut, Loader2, X, CheckCircle2, AlertCircle,
  Pencil, Trash2, UserPlus, Shield, User,
} from 'lucide-react';

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
      setError(msg.includes('409') ? 'Slug already in use — choose a different one.' : 'Failed to create store.');
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

        {/* Name */}
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

        {/* PIN */}
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

        {/* Role */}
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

        {/* Store (hidden for SUPERADMIN) */}
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

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function SuperAdminPage() {
  const { logout, user: me } = useAuthStore();
  const qc = useQueryClient();

  const [addStoreOpen, setAddStoreOpen]   = useState(false);
  const [userModal, setUserModal]         = useState<{ open: boolean; editing?: ApiUser }>({ open: false });
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // Dashboard data
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['superadmin-dashboard'],
    queryFn: () => api.superadmin.dashboard(),
    staleTime: 60_000,
    retry: 2,
  });

  // All users
  const { data: allUsers = [], isLoading: usersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ['superadmin-users'],
    queryFn: () => api.users.list(),
    staleTime: 30_000,
  });

  // All stores (for user modal dropdown)
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

  const handleStoreCreated = () => {
    setAddStoreOpen(false);
    invalidateAll();
  };

  const toggleActive = async (id: string, current: boolean) => {
    await api.stores.update(id, { isActive: !current });
    invalidateAll();
  };

  const handleUserSaved = () => {
    setUserModal({ open: false });
    invalidateAll();
  };

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

  // Build a storeId → name lookup
  const storeNameMap = new Map(allStores.map((s) => [s.id, s.name]));

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

      <main className="max-w-6xl mx-auto p-6 space-y-8">

        {/* ── Page title ── */}
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

        {/* ── Error banner ── */}
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
              className="shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-lg border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          </div>
        )}

        {/* ── Summary cards ── */}
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

        {/* ── Store Performance table ── */}
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
                  <p className="text-sm font-medium">{isError ? 'Could not load stores — see error above' : 'No stores yet'}</p>
                  {!isError && <p className="text-xs opacity-60">Click "New Store" to create your first store.</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Users panel ── */}
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
                        <td className="px-4 py-3">
                          <RoleBadge role={u.role} />
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {storeName ? (
                            <span className="flex items-center gap-1">
                              <ShoppingBag className="h-3 w-3 text-gray-400 shrink-0" />
                              {storeName}
                            </span>
                          ) : (
                            <span className="text-gray-300 italic text-xs">Global / No store</span>
                          )}
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
