import { useEffect, useRef, useState } from 'react';
import { useCartStore } from '../store/use-cart-store';
import { usePinGateStore } from '@/features/auth/store/use-pin-gate-store';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Minus, Plus, Trash2, ShoppingCart, X, Tag, Clock } from 'lucide-react';
import { CheckoutModal } from './checkout-modal';

const IDLE_MS = 15 * 60 * 1000;
const WARN_MS = 13 * 60 * 1000;

export function Cart() {
  const { items, removeItem, updateQuantity, clearCart, setOverridePrice, totals } = useCartStore();
  const { requireAdmin } = usePinGateStore();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [activeDiscountId, setActiveDiscountId] = useState<string | null>(null);
  const [discountInput, setDiscountInput] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [idleSecondsLeft, setIdleSecondsLeft] = useState<number | null>(null);

  const { subtotal, taxAmount, total } = totals();

  // Cart idle auto-clear — 15 min (Phase 2.2)
  const clearTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const warnTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const countdownRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    clearTimeout(clearTimer.current);
    clearTimeout(warnTimer.current);
    clearInterval(countdownRef.current);
    setIdleSecondsLeft(null);

    if (items.length === 0) return;

    warnTimer.current = setTimeout(() => {
      setIdleSecondsLeft(120);
      countdownRef.current = setInterval(() => {
        setIdleSecondsLeft((prev) => {
          if (prev === null || prev <= 1) { clearInterval(countdownRef.current); return null; }
          return prev - 1;
        });
      }, 1000);
    }, WARN_MS);

    clearTimer.current = setTimeout(() => {
      clearCart();
      setIdleSecondsLeft(null);
    }, IDLE_MS);

    return () => {
      clearTimeout(clearTimer.current);
      clearTimeout(warnTimer.current);
      clearInterval(countdownRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const openDiscount = (itemId: string, currentPrice: number, currentReason?: string) => {
    setActiveDiscountId(itemId);
    setDiscountInput(String(currentPrice));
    setDiscountReason(currentReason ?? '');
  };

  const applyDiscount = (itemId: string, originalPrice: number) => {
    const val = parseFloat(discountInput);
    if (isNaN(val) || val < 0) return;
    const discountPct = ((originalPrice - val) / originalPrice) * 100;
    const apply = () => {
      setOverridePrice(itemId, val, discountReason || undefined);
      setActiveDiscountId(null);
    };
    // Require admin PIN for any price override > 0%
    if (discountPct > 0) {
      requireAdmin(apply);
    } else {
      apply();
    }
  };

  const clearDiscount = (itemId: string) => {
    setOverridePrice(itemId, undefined);
    setActiveDiscountId(null);
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-4 p-8">
        <div
          className="h-16 w-16 rounded-2xl flex items-center justify-center"
          style={{ background: 'oklch(0.477 0.216 27.3 / 0.08)' }}
        >
          <ShoppingCart className="h-8 w-8" style={{ color: 'var(--primary)', opacity: 0.5 }} />
        </div>
        <div className="text-center">
          <p className="font-semibold text-sm">Cart is empty</p>
          <p className="text-xs text-muted-foreground mt-1">Tap a product to add it</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
          <span className="font-bold text-sm">
            {items.reduce((s, i) => s + i.quantity, 0)} item{items.reduce((s, i) => s + i.quantity, 0) !== 1 ? 's' : ''}
          </span>
          <button
            onClick={clearCart}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
          >
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        </div>

        {/* Idle warning banner */}
        {idleSecondsLeft !== null && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-700 text-xs font-semibold">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            Cart clears in {Math.floor(idleSecondsLeft / 60)}:{String(idleSecondsLeft % 60).padStart(2, '0')} — tap to keep
          </div>
        )}

        {/* Items */}
        <ScrollArea className="flex-1">
          <div className="divide-y">
            {items.map((item) => {
              const price = item.overridePrice ?? item.nomadBitePrice;
              const isDiscounted = item.overridePrice !== undefined;
              const discountPct = isDiscounted
                ? Math.round((1 - item.overridePrice! / item.nomadBitePrice) * 100)
                : 0;
              const isOpen = activeDiscountId === item.id;

              return (
                <div key={item.id}>
                  <div className="px-4 py-3 flex gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate leading-tight">{item.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.unit}</p>

                      <div className="flex items-center gap-1.5 mt-1">
                        <p className="text-xs font-bold" style={{ color: 'var(--primary)' }}>
                          KES {Number(price).toLocaleString()}
                        </p>
                        {isDiscounted && (
                          <>
                            <span className="text-[10px] line-through text-muted-foreground">
                              {Number(item.nomadBitePrice).toLocaleString()}
                            </span>
                            <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-green-500/10 text-green-700">
                              -{discountPct}%
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end justify-between gap-1.5 shrink-0">
                      <div className="flex items-center gap-0.5">
                        {/* Discount toggle */}
                        <button
                          onClick={() =>
                            isOpen
                              ? setActiveDiscountId(null)
                              : openDiscount(item.id, item.overridePrice ?? item.nomadBitePrice, item.discountReason)
                          }
                          className={`h-5 w-5 rounded flex items-center justify-center transition-colors ${
                            isDiscounted
                              ? 'text-green-600 bg-green-500/10'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                          }`}
                          title="Apply discount"
                        >
                          <Tag className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="h-6 w-6 rounded border flex items-center justify-center hover:border-primary transition-colors"
                        >
                          <Minus className="h-2.5 w-2.5" />
                        </button>
                        <Input
                          className="h-6 w-9 text-center text-xs p-0 border-border"
                          value={item.quantity}
                          onChange={(e) => {
                            const v = parseInt(e.target.value);
                            if (!isNaN(v)) updateQuantity(item.id, v);
                          }}
                        />
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="h-6 w-6 rounded border flex items-center justify-center hover:border-primary transition-colors"
                        >
                          <Plus className="h-2.5 w-2.5" />
                        </button>
                      </div>

                      <p className="text-xs font-black">
                        KES {(Number(price) * item.quantity).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Inline discount editor */}
                  {isOpen && (
                    <div className="px-4 pb-3 space-y-2 bg-muted/30 border-t">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide pt-2">
                        Override Price
                      </p>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          className="h-7 text-xs"
                          placeholder={`KES ${item.nomadBitePrice}`}
                          value={discountInput}
                          onChange={(e) => setDiscountInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && applyDiscount(item.id, item.nomadBitePrice)}
                          autoFocus
                        />
                        <button
                          onClick={() => applyDiscount(item.id, item.nomadBitePrice)}
                          className="shrink-0 h-7 px-2.5 rounded-lg text-xs font-bold"
                          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                        >
                          Apply
                        </button>
                      </div>
                      <Input
                        className="h-7 text-xs"
                        placeholder="Reason (optional)"
                        value={discountReason}
                        onChange={(e) => setDiscountReason(e.target.value)}
                      />
                      {isDiscounted && (
                        <button
                          onClick={() => clearDiscount(item.id)}
                          className="text-[10px] text-muted-foreground hover:text-destructive underline"
                        >
                          Remove discount
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Totals + checkout */}
        <div className="p-4 border-t bg-card space-y-3">
          <div className="space-y-1.5">
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
          </div>

          <div className="flex justify-between items-center font-black text-lg border-t pt-3">
            <span>Total</span>
            <span style={{ color: 'var(--primary)' }}>KES {total.toLocaleString()}</span>
          </div>

          <button
            onClick={() => setCheckoutOpen(true)}
            className="w-full py-3.5 rounded-xl font-bold text-sm transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            Checkout
          </button>
        </div>
      </div>

      <CheckoutModal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} total={total} />
    </>
  );
}
