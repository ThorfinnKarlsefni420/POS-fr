import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/features/auth/store/use-auth-store';
import {
  Store, TrendingUp, ShoppingBag, Users, Activity,
  Plus, RefreshCw, LogOut, Loader2, X, CheckCircle2, AlertCircle,
} from 'lucide-react';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white border rounded-2xl p-5 space-y-1">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-black">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {[
          { key: 'name' as const, label: 'Store Name *', placeholder: 'NomadBite Westlands' },
          { key: 'slug' as const, label: 'Slug * (URL-safe ID)', placeholder: 'westlands' },
          { key: 'ownerName' as const, label: 'Owner / Manager', placeholder: '' },
          { key: 'phone' as const, label: 'Phone', placeholder: '+254 7xx xxx xxx' },
          { key: 'email' as const, label: 'Email', placeholder: '' },
          { key: 'address' as const, label: 'Address', placeholder: '' },
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
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-xl border text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
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

export function SuperAdminPage() {
  const { logout, user } = useAuthStore();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['superadmin-dashboard'],
    queryFn: () => api.superadmin.dashboard(),
    staleTime: 60_000,
  });

  const handleStoreCreated = () => {
    setAddOpen(false);
    qc.invalidateQueries({ queryKey: ['superadmin-dashboard'] });
    qc.invalidateQueries({ queryKey: ['stores'] });
  };

  const toggleActive = async (id: string, current: boolean) => {
    await api.stores.update(id, { isActive: !current });
    qc.invalidateQueries({ queryKey: ['superadmin-dashboard'] });
    qc.invalidateQueries({ queryKey: ['stores'] });
  };

  const summary = data?.summary;
  const storeStats = data?.stores ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 h-14 flex items-center justify-between">
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
          <span className="text-xs font-semibold text-gray-500">{user?.name}</span>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Page title row */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black">Dashboard</h1>
            <p className="text-sm text-gray-500">All stores · Today</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-semibold text-gray-600 hover:bg-gray-100"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-orange-600 text-white text-xs font-bold"
            >
              <Plus className="h-3.5 w-3.5" />
              New Store
            </button>
          </div>
        </div>

        {/* Summary cards */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading dashboard…</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatCard
                label="Revenue Today"
                value={`KES ${(summary?.totalRevenueToday ?? 0).toLocaleString()}`}
              />
              <StatCard
                label="Transactions"
                value={summary?.totalTransactionsToday ?? 0}
                sub="today"
              />
              <StatCard
                label="Active Stores"
                value={`${summary?.activeStores ?? 0} / ${summary?.totalStores ?? 0}`}
              />
              <StatCard
                label="Open Shifts"
                value={summary?.activeShifts ?? 0}
              />
              <StatCard
                label="Total Stores"
                value={summary?.totalStores ?? 0}
              />
            </div>

            {/* Per-store table */}
            <div className="bg-white border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-orange-600" />
                <p className="font-bold text-sm">Store Performance</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      {['Store', 'Status', 'Revenue Today', 'Revenue (7d)', 'Txns Today', 'Active Shifts', 'Top Product'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {storeStats.map((s) => {
                      return (
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
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              s.isActive ? 'bg-green-500/10 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {s.isActive ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                              {s.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold">KES {s.revenueToday.toLocaleString()}</td>
                          <td className="px-4 py-3 text-gray-500">KES {s.revenueWeek.toLocaleString()}</td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1">
                              <ShoppingBag className="h-3 w-3 text-gray-400" />
                              {s.transactionsToday}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3 text-gray-400" />
                              {s.activeShifts}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px] truncate">
                            {s.topProduct ?? '—'}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => toggleActive(s.id, s.isActive)}
                              className="text-xs font-semibold text-gray-400 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                            >
                              {s.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {storeStats.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
                    <Activity className="h-8 w-8 opacity-20" />
                    <p className="text-sm">No stores yet</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {addOpen && <AddStoreModal onClose={() => setAddOpen(false)} onCreated={handleStoreCreated} />}
    </div>
  );
}
