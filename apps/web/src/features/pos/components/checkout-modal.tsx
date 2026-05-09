import { useState } from 'react';
import { useCartStore } from '../store/use-cart-store';
import { api, TransactionResult } from '@/lib/api';
import { useAuthStore } from '@/features/auth/store/use-auth-store';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { enqueueOfflineTransaction } from '@/hooks/use-offline-sync';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle, Banknote, Loader2, AlertTriangle, Receipt, WifiOff, Printer } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useSettingsStore } from '@/features/admin/store/use-settings-store';

interface Props { open: boolean; onClose: () => void; total: number; }

export function CheckoutModal({ open, onClose, total }: Props) {
  const { items, clearCart, totals } = useCartStore();
  const { user, shiftId } = useAuthStore();
  const isOnline = useOnlineStatus();
  const storeName = useSettingsStore((s) => s.storeName);
  const [done, setDone] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TransactionResult | null>(null);
  const { subtotal, taxAmount } = totals();
  const queryClient = useQueryClient();

  const zeroStockItems = items.filter((i) => i.currentStock <= 0);

  const buildPayload = () => ({
    items: items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      originalPrice: item.sellingPrice,
      soldPrice: item.overridePrice ?? item.sellingPrice,
      discountReason: item.discountReason,
    })),
    totalAmount: total,
    taxAmount,
    paymentType: 'CASH' as const,
    userId: user?.id,
    shiftId: shiftId ?? undefined,
  });

  const handleConfirm = async () => {
    setLoading(true);
    try {
      if (!isOnline) {
        enqueueOfflineTransaction(buildPayload());
        setSavedOffline(true);
        setDone(true);
      } else {
        const txResult = await api.transactions.create(buildPayload());
        setResult(txResult);
        setDone(true);
        queryClient.invalidateQueries({ queryKey: ['products'] });
      }
    } catch {
      alert('Transaction failed — check API connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (done) clearCart();
    setDone(false);
    setResult(null);
    setSavedOffline(false);
    setShowReceipt(false);
    onClose();
  };

  const adminAlerts = [
    ...(result?.stockDiscrepancies ?? []).map(
      (d) => `Stock changed during checkout: "${d.name}" — requested ${d.requested}, available ${d.available}`
    ),
    ...(result?.negativeStockItems ?? []).map(
      (n) => `"${n.name}" is now at ${n.stock} — flagged for recount`
    ),
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm border-0 shadow-2xl">
        {done ? (
          showReceipt && result && !savedOffline ? (
            /* ── Receipt view ── */
            <div className="space-y-4 py-2">
              <div className="text-center space-y-1">
                <p className="font-black text-base">{storeName}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date().toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  #{result.id?.slice(-10).toUpperCase()}
                </p>
              </div>

              <div className="border-t border-dashed pt-3 space-y-1.5">
                {(result.lineItems ?? items.map((i) => ({
                  itemId: i.id,
                  item: { name: i.name } as never,
                  quantity: i.quantity,
                  soldPrice: i.overridePrice ?? i.nomadBitePrice,
                  discountReason: i.discountReason,
                }))).map((li, idx) => (
                  <div key={idx} className="flex justify-between text-xs gap-2">
                    <div className="min-w-0">
                      <span className="font-medium">{li.item?.name ?? 'Item'}</span>
                      {li.discountReason && (
                        <span className="text-[10px] text-muted-foreground ml-1">({li.discountReason})</span>
                      )}
                    </div>
                    <span className="shrink-0 font-mono">
                      {Number(li.quantity)} × {Number(li.soldPrice).toLocaleString()} = KES {(Number(li.quantity) * Number(li.soldPrice)).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-dashed pt-3 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Subtotal</span><span>KES {subtotal.toLocaleString()}</span>
                </div>
                {taxAmount > 0 && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>VAT</span><span>KES {taxAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-sm">
                  <span>TOTAL</span>
                  <span style={{ color: 'var(--primary)' }}>KES {total.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Payment</span><span>Cash</span>
                </div>
                {user && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Cashier</span><span>{user.name}</span>
                  </div>
                )}
              </div>

              <p className="text-center text-[10px] text-muted-foreground border-t border-dashed pt-3">
                Thank you for shopping at {storeName}!
              </p>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => window.print()}
                  className="flex-1 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-muted"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print
                </button>
                <button
                  onClick={handleClose}
                  className="flex-1 py-2.5 rounded-xl font-bold text-xs"
                  style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                >
                  New Sale
                </button>
              </div>
            </div>
          ) : (
            /* ── Success screen ── */
            <div className="flex flex-col items-center gap-5 py-6">
              <div
                className="h-20 w-20 rounded-full flex items-center justify-center"
                style={{ background: savedOffline ? 'oklch(0.75 0.15 60 / 0.15)' : 'oklch(0.477 0.216 27.3 / 0.1)' }}
              >
                {savedOffline
                  ? <WifiOff className="h-10 w-10" style={{ color: 'oklch(0.55 0.15 60)' }} />
                  : <CheckCircle className="h-10 w-10" style={{ color: 'var(--primary)' }} />}
              </div>
              <div className="text-center">
                <DialogTitle className="text-xl font-black">
                  {savedOffline ? 'Saved Offline' : 'Sale Complete'}
                </DialogTitle>
                <p className="text-muted-foreground text-sm mt-1">
                  {savedOffline
                    ? 'Will sync automatically when reconnected.'
                    : `KES ${total.toLocaleString()} · Cash`}
                </p>
              </div>

              {adminAlerts.length > 0 && (
                <div className="w-full rounded-xl border border-amber-500/30 bg-amber-500/8 p-3 space-y-1.5">
                  <p className="text-xs font-bold text-amber-600 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> Admin Notice
                  </p>
                  {adminAlerts.map((msg, i) => (
                    <p key={i} className="text-xs text-amber-700/80">{msg}</p>
                  ))}
                </div>
              )}

              <div className="w-full space-y-2">
                <button
                  onClick={handleClose}
                  className="w-full py-3 rounded-xl font-bold text-sm"
                  style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                >
                  New Sale
                </button>
                {!savedOffline && (
                  <button
                    onClick={() => setShowReceipt(true)}
                    className="w-full py-2 rounded-xl font-semibold text-xs text-muted-foreground flex items-center justify-center gap-1.5 hover:bg-muted transition-colors"
                  >
                    <Receipt className="h-3.5 w-3.5" />
                    View Receipt
                  </button>
                )}
              </div>
            </div>
          )
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-black text-lg">Checkout</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-1">
              {zeroStockItems.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-3 space-y-1">
                  <p className="text-xs font-bold text-amber-600 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> Low Stock Warning
                  </p>
                  {zeroStockItems.map((i) => (
                    <p key={i.id} className="text-xs text-amber-700/80">
                      "{i.name}" is at 0 — selling will push inventory negative.
                    </p>
                  ))}
                </div>
              )}

              {/* Summary */}
              <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--muted)' }}>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Items</span>
                  <span>{items.reduce((s, i) => s + i.quantity, 0)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Subtotal</span>
                  <span>KES {subtotal.toLocaleString()}</span>
                </div>
                {taxAmount > 0 && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>VAT</span>
                    <span>KES {taxAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-base border-t pt-2">
                  <span>Total</span>
                  <span style={{ color: 'var(--primary)' }}>KES {total.toLocaleString()}</span>
                </div>
              </div>

              {/* Payment method — cash only */}
              <div className="flex items-center gap-3 rounded-xl border-2 p-4"
                style={{ borderColor: 'var(--primary)', background: 'oklch(0.477 0.216 27.3 / 0.07)' }}
              >
                <Banknote className="h-5 w-5 shrink-0" style={{ color: 'var(--primary)' }} />
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--primary)' }}>Cash</p>
                  <p className="text-[11px] text-muted-foreground">Only payment method accepted</p>
                </div>
              </div>

              {!isOnline && (
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-500/8 border border-amber-500/20 rounded-lg p-2.5">
                  <WifiOff className="h-3.5 w-3.5 shrink-0" />
                  Offline — Sale will sync when reconnected.
                </div>
              )}

              <button
                onClick={handleConfirm}
                disabled={loading}
                className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-opacity disabled:opacity-70"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm · KES {total.toLocaleString()}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
