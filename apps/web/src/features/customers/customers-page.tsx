import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiCustomer } from '@/lib/api';
import { useAuthStore } from '@/features/auth/store/use-auth-store';
import { UserPlus, Search, ChevronRight, AlertTriangle, DollarSign, CreditCard, X, Check } from 'lucide-react';

export function CustomersPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newLimit, setNewLimit] = useState('');
  const [payState, setPayState] = useState<{ saleId: string; amount: string; method: 'CASH' | 'MPESA' | 'BANK_TRANSFER' } | null>(null);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers', q],
    queryFn: () => api.customers.list(q || undefined),
  });

  const { data: detail } = useQuery({
    queryKey: ['customer', selected],
    queryFn: () => api.customers.get(selected!),
    enabled: !!selected,
  });

  const createMutation = useMutation({
    mutationFn: () => api.customers.create({
      name: newName.trim(),
      phone: newPhone.trim() || undefined,
      email: newEmail.trim() || undefined,
      creditLimit: newLimit ? Number(newLimit) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      setShowAdd(false);
      setNewName(''); setNewPhone(''); setNewEmail(''); setNewLimit('');
    },
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!payState || !selected || !user) return;
      await api.customers.recordPayment(selected, {
        mkopoSaleId: payState.saleId,
        amount: Number(payState.amount),
        method: payState.method,
        recordedById: user.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer', selected] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      setPayState(null);
    },
  });

  const filteredCustomers = customers;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel — customer list */}
      <div className="w-80 border-r flex flex-col shrink-0">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center gap-2 rounded-xl border px-3 py-2 bg-muted/40">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
              placeholder="Search customers…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold border hover:bg-muted transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add Customer
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y">
          {isLoading && (
            <p className="text-xs text-muted-foreground text-center py-8">Loading…</p>
          )}
          {!isLoading && filteredCustomers.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">No customers yet</p>
          )}
          {filteredCustomers.map((c) => {
            const outstanding = c.outstandingBalance ?? 0;
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                style={selected === c.id ? { background: 'var(--muted)' } : {}}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.phone ?? 'No phone'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {outstanding > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700">
                      KES {outstanding.toLocaleString()}
                    </span>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right panel — customer detail */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selected && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <CreditCard className="h-12 w-12 mb-3 opacity-20" />
            <p className="text-sm">Select a customer to view their mkopo history</p>
          </div>
        )}

        {selected && detail && (
          <div className="max-w-2xl space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-black">{detail.name}</h2>
                {detail.phone && <p className="text-sm text-muted-foreground">{detail.phone}</p>}
                {detail.email && <p className="text-xs text-muted-foreground">{detail.email}</p>}
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Credit limit</p>
                <p className="font-bold">KES {Number(detail.creditLimit).toLocaleString()}</p>
              </div>
            </div>

            {/* Mkopo sales */}
            <div className="space-y-3">
              <h3 className="font-bold text-sm">Mkopo History</h3>
              {(detail as any).mkopoSales?.length === 0 && (
                <p className="text-xs text-muted-foreground">No mkopo sales yet.</p>
              )}
              {((detail as any).mkopoSales ?? []).map((ms: any) => {
                const owed = Number(ms.amountOwed);
                const paid = Number(ms.amountPaid);
                const remaining = owed - paid;
                const statusColor =
                  ms.status === 'PAID' ? 'text-green-600 bg-green-500/10' :
                  ms.status === 'OVERDUE' ? 'text-red-600 bg-red-500/10' :
                  ms.status === 'PARTIAL' ? 'text-amber-600 bg-amber-500/10' :
                  'text-muted-foreground bg-muted';

                return (
                  <div key={ms.id} className="rounded-xl border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(ms.createdAt).toLocaleDateString('en-KE', { dateStyle: 'medium' })}
                          {ms.dueDate && ` · Due ${new Date(ms.dueDate).toLocaleDateString('en-KE', { dateStyle: 'short' })}`}
                        </p>
                        <p className="font-bold">KES {owed.toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor}`}>
                          {ms.status}
                        </span>
                        {ms.status !== 'PAID' && (
                          <button
                            onClick={() => setPayState({ saleId: ms.id, amount: String(remaining), method: 'CASH' })}
                            className="text-xs font-semibold px-2.5 py-1 rounded-lg border hover:bg-muted"
                          >
                            Record Payment
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    {owed > 0 && (
                      <div>
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                          <span>Paid: KES {paid.toLocaleString()}</span>
                          <span>Remaining: KES {remaining.toLocaleString()}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, (paid / owed) * 100)}%`,
                              background: ms.status === 'PAID' ? '#22c55e' : 'var(--primary)',
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Payment history */}
                    {ms.payments?.length > 0 && (
                      <div className="space-y-1 border-t pt-2">
                        {ms.payments.map((p: any) => (
                          <div key={p.id} className="flex justify-between text-xs text-muted-foreground">
                            <span>
                              {new Date(p.paidAt).toLocaleDateString('en-KE', { dateStyle: 'short' })} · {p.method}
                              {p.recordedBy && ` · ${p.recordedBy.name}`}
                            </span>
                            <span className="font-medium text-foreground">+KES {Number(p.amount).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Add customer dialog */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-2xl shadow-2xl w-80 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-base">New Customer</h3>
              <button onClick={() => setShowAdd(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <div className="space-y-2">
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm"
                placeholder="Name *"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm"
                placeholder="Phone"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm"
                placeholder="Email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">KES</span>
                <input
                  className="w-full rounded-xl border px-3 py-2 text-sm pl-10"
                  placeholder="Credit limit (0 = unlimited)"
                  type="number"
                  min="0"
                  value={newLimit}
                  onChange={(e) => setNewLimit(e.target.value)}
                />
              </div>
            </div>
            <button
              onClick={() => createMutation.mutate()}
              disabled={!newName.trim() || createMutation.isPending}
              className="w-full py-2.5 rounded-xl font-bold text-sm disabled:opacity-60"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              {createMutation.isPending ? 'Creating…' : 'Create Customer'}
            </button>
          </div>
        </div>
      )}

      {/* Record payment dialog */}
      {payState && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-2xl shadow-2xl w-80 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-base">Record Payment</h3>
              <button onClick={() => setPayState(null)}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">KES</span>
                <input
                  className="w-full rounded-xl border px-3 py-2 text-sm pl-10"
                  placeholder="Amount"
                  type="number"
                  min="1"
                  value={payState.amount}
                  onChange={(e) => setPayState((s) => s ? { ...s, amount: e.target.value } : s)}
                />
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['CASH', 'MPESA', 'BANK_TRANSFER'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setPayState((s) => s ? { ...s, method: m } : s)}
                    className="rounded-lg border py-1.5 text-[11px] font-semibold transition-colors"
                    style={payState.method === m ? { background: 'var(--primary)', color: 'var(--primary-foreground)', borderColor: 'var(--primary)' } : {}}
                  >
                    {m === 'BANK_TRANSFER' ? 'Bank' : m}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => payMutation.mutate()}
              disabled={!payState.amount || Number(payState.amount) <= 0 || payMutation.isPending}
              className="w-full py-2.5 rounded-xl font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              <Check className="h-4 w-4" />
              {payMutation.isPending ? 'Recording…' : `Confirm KES ${Number(payState.amount || 0).toLocaleString()}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
