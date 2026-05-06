import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiTransaction } from '@/lib/api';
import { useAuthStore } from '@/features/auth/store/use-auth-store';
import { usePinGateStore } from '@/features/auth/store/use-pin-gate-store';
import { RefundModal } from './components/refund-modal';
import { Input } from '@/components/ui/input';
import { Search, Loader2, ReceiptText, CheckCircle2, Ban } from 'lucide-react';

export function ReturnsPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ApiTransaction | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const { user } = useAuthStore();
  const { requireAdmin } = usePinGateStore();
  const qc = useQueryClient();

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => api.transactions.list(),
    staleTime: 10_000,
  });

  const filtered = transactions.filter((tx) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      tx.id.toLowerCase().includes(q) ||
      tx.lineItems.some((li) => li.item.name.toLowerCase().includes(q)) ||
      tx.paymentType.toLowerCase().includes(q)
    );
  });

  const handleVoid = (tx: ApiTransaction) => {
    requireAdmin(async () => {
      setVoidingId(tx.id);
      try {
        await api.transactions.void(tx.id);
        qc.invalidateQueries({ queryKey: ['transactions'] });
      } catch {
        alert('Could not void transaction.');
      } finally {
        setVoidingId(null);
      }
    });
  };

  const statusBadge = (status: ApiTransaction['status']) => {
    if (status === 'REFUNDED') return 'bg-red-500/10 text-red-600';
    if (status === 'VOIDED') return 'bg-muted text-muted-foreground';
    return 'bg-green-500/10 text-green-700';
  };

  return (
    <>
      <div className="flex flex-col h-full p-6 gap-4">
        <div className="shrink-0">
          <h1 className="text-xl font-bold">Returns & Refunds</h1>
          <p className="text-sm text-muted-foreground">Find a transaction to process a return</p>
        </div>

        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-10 bg-card"
            placeholder="Search by transaction ID, item name, or payment type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading transactions…</span>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                <ReceiptText className="h-10 w-10 opacity-10" />
                <p className="text-sm">No transactions found</p>
              </div>
            )}
            {filtered.map((tx) => (
              <div
                key={tx.id}
                className="bg-card border rounded-xl p-4 hover:border-primary hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-muted-foreground">
                        #{tx.id.slice(-8).toUpperCase()}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge(tx.status)}`}>
                        {tx.status}
                      </span>
                      {tx.lineItems.every((li) => li.isReturned) && tx.status === 'COMPLETED' && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                      )}
                    </div>
                    <p className="text-sm font-semibold">
                      KES {Number(tx.totalAmount).toLocaleString()} · {tx.paymentType}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {tx.lineItems.map((li) => li.item.name).join(', ')}
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.createdAt).toLocaleDateString()}
                      {' '}
                      {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-xs text-muted-foreground">by {tx.user.name}</p>
                    {tx.status === 'COMPLETED' && (
                      <div className="flex gap-1.5 justify-end mt-2">
                        <button
                          onClick={() => setSelected(tx)}
                          className="text-[10px] font-bold px-2.5 py-1 rounded-lg border hover:bg-muted transition-colors"
                        >
                          Refund
                        </button>
                        {(user?.role === 'ADMIN' || user?.role === 'SUPERADMIN') && (
                          <button
                            onClick={() => handleVoid(tx)}
                            disabled={voidingId === tx.id}
                            className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/5 transition-colors flex items-center gap-1 disabled:opacity-50"
                          >
                            {voidingId === tx.id
                              ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              : <Ban className="h-2.5 w-2.5" />}
                            Void
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <RefundModal transaction={selected} onClose={() => setSelected(null)} />
    </>
  );
}
