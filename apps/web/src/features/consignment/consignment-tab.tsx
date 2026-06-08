import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiSupplier } from '@/lib/api';
import { Loader2, Plus, Handshake, RefreshCw, Phone, Mail, Wallet, Package, Pencil, Trash2, DollarSign, CheckCircle2, ChevronDown, ChevronUp, CreditCard } from 'lucide-react';
import { SupplierModal } from './supplier-modal';
import { ConsignmentSettlementDashboard } from './components/consignment-settlement-dashboard';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
    return (
        <div className="bg-white border rounded-2xl p-4 shadow-sm">
            <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</h2>
            <p className="text-xl font-black mt-1">{value}</p>
            {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
        </div>
    );
}

export function ConsignmentTab() {
  const qc = useQueryClient();
  const [supplierModal, setSupplierModal] = useState<{ open: boolean; editing?: ApiSupplier }>({ open: false });
  const [deletingId, setDeletingId]       = useState<string | null>(null);
  const [settlingId, setSettlingId]       = useState<string | null>(null);

  // ── Queries ──
  const { data: suppliers = [], isLoading: suppLoading, refetch: refetchSupp } = useQuery({
    queryKey: ['consignment-suppliers'],
    queryFn: () => api.suppliers.list(),
    staleTime: 30_000,
  });

  const { data: pending = [], isLoading: pendLoading, refetch: refetchPend } = useQuery({
    queryKey: ['consignment-pending'],
    queryFn: () => api.consignment.pending(),
    staleTime: 15_000,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['consignment-suppliers'] });
    qc.invalidateQueries({ queryKey: ['consignment-pending'] });
  };

  // ── Handlers ──
  const handleDeleteSupplier = async (id: string) => {
    if (!confirm("Delete this supplier? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await api.suppliers.delete(id);
      invalidateAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not delete supplier.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSettle = async (supplierId: string, saleIds: string[]) => {
    setSettlingId(supplierId);
    try {
      await api.consignment.settle(supplierId, saleIds);
      invalidateAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Settlement failed.");
    } finally {
      setSettlingId(null);
    }
  };

  const totalPending = pending.reduce((sum, g) => sum + g.totalPayout, 0);
  const consignmentSuppliers = suppliers.filter((s) => s.isConsignment);

  return (
    <div className="space-y-6">
      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Suppliers" value={suppliers.length} />
        <StatCard label="Consignment Suppliers" value={consignmentSuppliers.length} />
        <StatCard label="Pending Payouts" value={`KES ${totalPending.toLocaleString()}`} />
        <StatCard label="Pending Groups" value={pending.length} sub="suppliers with unsettled sales" />
      </div>

      {/* ── Suppliers Panel ── */}
      <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Handshake className="h-4 w-4 text-emerald-600" />
            <p className="font-bold text-sm">Suppliers</p>
            <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {suppliers.length}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => refetchSupp()}
              className="h-8 w-8 flex items-center justify-center rounded-lg border text-gray-500 hover:bg-gray-100"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setSupplierModal({ open: true })}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Supplier
            </button>
          </div>
        </div>

        {suppLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading suppliers…</span>
          </div>
        ) : suppliers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-3">
            <Handshake className="h-8 w-8 opacity-20" />
            <p className="text-sm">No suppliers yet</p>
            <button
              onClick={() => setSupplierModal({ open: true })}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-semibold hover:bg-gray-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add first supplier
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  {["Supplier", "Contact", "Type", "Model", "Rate", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 text-xs font-black text-emerald-700">
                          {s.name.substring(0, 2).toUpperCase()}
                        </div>
                        <p className="font-semibold text-sm">{s.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5 text-xs text-gray-500">
                        {s.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3 text-gray-300" />{s.phone}</span>}
                        {s.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3 text-gray-300" />{s.email}</span>}
                        {!s.phone && !s.email && <span className="text-gray-300 italic">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        s.isConsignment ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {s.isConsignment ? <Wallet className="h-3 w-3" /> : <Package className="h-3 w-3" />}
                        {s.isConsignment ? "Consignment" : "Regular"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {s.isConsignment
                        ? s.defaultType === "FIXED_COST" ? "Fixed Cost" : "Commission %"
                        : "—"
                      }
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-500">
                      {s.isConsignment && s.defaultType === "PERCENTAGE_COMMISSION"
                        ? `${(Number(s.defaultRate) * 100).toFixed(0)}%`
                        : "—"
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => setSupplierModal({ open: true, editing: s })}
                          className="h-7 w-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                          title="Edit supplier"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteSupplier(s.id)}
                          disabled={deletingId === s.id}
                          title="Delete supplier"
                          className="h-7 w-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {deletingId === s.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pending Payouts ── */}
      <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-amber-600" />
            <p className="font-bold text-sm">Pending Payouts</p>
            {totalPending > 0 && (
              <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                KES {totalPending.toLocaleString()}
              </span>
            )}
          </div>
          <button
            onClick={() => refetchPend()}
            className="h-8 w-8 flex items-center justify-center rounded-lg border text-gray-500 hover:bg-gray-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {pendLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading pending payouts…</span>
          </div>
        ) : pending.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-3">
            <CheckCircle2 className="h-8 w-8 opacity-20" />
            <p className="text-sm font-medium">All caught up!</p>
            <p className="text-xs opacity-60">No pending consignment payouts.</p>
          </div>
        ) : (
          <ConsignmentSettlementDashboard />
        )}
      </div>
    </div>
  );
}
