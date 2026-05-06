import { useState } from 'react';
import { api, ApiTransaction } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  transaction: ApiTransaction | null;
  onClose: () => void;
}

export function RefundModal({ transaction, onClose }: Props) {
  const queryClient = useQueryClient();
  const [selections, setSelections] = useState<Record<string, { selected: boolean; isDamaged: boolean }>>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!transaction) return null;

  const refundableItems = transaction.lineItems.filter((li) => !li.isReturned);

  const toggle = (id: string, field: 'selected' | 'isDamaged') => {
    setSelections((prev) => ({
      ...prev,
      [id]: { ...{ selected: false, isDamaged: false }, ...prev[id], [field]: !prev[id]?.[field] },
    }));
  };

  const selectedItems = refundableItems.filter((li) => selections[li.id]?.selected);

  const handleRefund = async () => {
    if (!selectedItems.length) return;
    setLoading(true);
    try {
      await api.transactions.refund(
        transaction.id,
        selectedItems.map((li) => ({ lineItemId: li.id, isDamaged: selections[li.id]?.isDamaged ?? false }))
      );
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setDone(true);
    } catch {
      alert('Refund failed — check API connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelections({});
    setDone(false);
    onClose();
  };

  return (
    <Dialog open={!!transaction} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg border-0 shadow-2xl">
        {done ? (
          <div className="flex flex-col items-center gap-5 py-8">
            <div className="h-16 w-16 rounded-full flex items-center justify-center bg-green-500/10">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <div className="text-center">
              <DialogTitle className="text-lg font-black">Refund Processed</DialogTitle>
              <p className="text-muted-foreground text-sm mt-1">Stock has been updated accordingly.</p>
            </div>
            <button
              onClick={handleClose}
              className="w-full py-3 rounded-xl font-bold text-sm"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-black">Process Return</DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">
                #{transaction.id.slice(-8).toUpperCase()} · {new Date(transaction.createdAt).toLocaleString()} · {transaction.paymentType}
              </p>
            </DialogHeader>

            <div className="space-y-4">
              {refundableItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">All items in this transaction have already been returned.</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {refundableItems.map((li) => {
                      const sel = selections[li.id];
                      return (
                        <div
                          key={li.id}
                          className={`rounded-xl border p-3 transition-colors ${sel?.selected ? 'border-primary/40 bg-primary/5' : 'border-border'}`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              className="mt-0.5 accent-[var(--primary)]"
                              checked={!!sel?.selected}
                              onChange={() => toggle(li.id, 'selected')}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate">{li.item.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Qty {Number(li.quantity)} · KES {Number(li.soldPrice).toLocaleString()}
                              </p>
                            </div>
                          </div>

                          {sel?.selected && (
                            <div className="mt-3 ml-6 flex items-center gap-3">
                              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold">
                                <input
                                  type="checkbox"
                                  className="accent-red-500"
                                  checked={!!sel?.isDamaged}
                                  onChange={() => toggle(li.id, 'isDamaged')}
                                />
                                Item is damaged
                              </label>
                              {sel?.isDamaged ? (
                                <span className="text-[10px] text-red-600 bg-red-500/10 px-2 py-0.5 rounded-full font-semibold">
                                  Refund only · Stock stays
                                </span>
                              ) : (
                                <span className="text-[10px] text-green-700 bg-green-500/10 px-2 py-0.5 rounded-full font-semibold">
                                  Refund + restore stock
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {selectedItems.some((li) => selections[li.id]?.isDamaged) && (
                    <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-500/8 border border-amber-500/20 rounded-lg p-2.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Damaged items will be logged as shrinkage and stock will not be restored.
                    </div>
                  )}

                  <button
                    onClick={handleRefund}
                    disabled={loading || selectedItems.length === 0}
                    className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
                    style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {selectedItems.length === 0 ? 'Select items to return' : `Refund ${selectedItems.length} item${selectedItems.length !== 1 ? 's' : ''}`}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
