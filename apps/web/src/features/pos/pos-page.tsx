import { useState } from 'react';
import { ShoppingCart, X } from 'lucide-react';
import { Catalog } from './components/catalog';
import { Cart } from './components/cart';
import { useCartStore } from './store/use-cart-store';

export function PosPage() {
  const [cartOpen, setCartOpen] = useState(false);
  const itemCount = useCartStore((s) => s.items.reduce((n, i) => n + i.quantity, 0));

  return (
    <div className="flex h-full overflow-hidden relative">
      {/* Catalog panel — full width on tablet when cart drawer is closed */}
      <div className="flex-1 min-w-0 p-4 overflow-hidden flex flex-col">
        <Catalog />
      </div>

      {/* Cart panel — always visible on lg+, drawer on md */}
      <div
        className={`
          flex flex-col shrink-0 bg-card border-l
          transition-all duration-200
          lg:w-80 lg:relative lg:translate-x-0 lg:shadow-none
          fixed inset-y-0 right-0 w-80 z-40
          ${cartOpen ? 'translate-x-0 shadow-2xl' : 'translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Close button — only visible on the drawer (tablet) */}
        <button
          className="lg:hidden absolute top-3 left-3 z-10 h-8 w-8 flex items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors"
          onClick={() => setCartOpen(false)}
        >
          <X className="h-4 w-4" />
        </button>
        <Cart />
      </div>

      {/* Backdrop — tablet only, behind the open cart drawer */}
      {cartOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/30"
          onClick={() => setCartOpen(false)}
        />
      )}

      {/* Cart FAB — tablet only, shows when cart drawer is closed */}
      <button
        className={`
          lg:hidden fixed bottom-5 right-5 z-50
          h-14 w-14 rounded-full shadow-lg
          flex items-center justify-center
          transition-all duration-150
          ${cartOpen ? 'opacity-0 pointer-events-none scale-90' : 'opacity-100 scale-100'}
        `}
        style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        onClick={() => setCartOpen(true)}
        aria-label="Open cart"
      >
        <ShoppingCart className="h-6 w-6" />
        {itemCount > 0 && (
          <span
            className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full text-[10px] font-black flex items-center justify-center bg-white"
            style={{ color: 'var(--primary)' }}
          >
            {itemCount > 99 ? '99+' : itemCount}
          </span>
        )}
      </button>
    </div>
  );
}
