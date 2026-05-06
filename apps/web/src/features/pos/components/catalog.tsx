import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCartStore } from '../store/use-cart-store';
import { useProducts } from '@/hooks/use-products';
import { useBarcodeScanner } from '@/hooks/use-barcode-scanner';
import { Input } from '@/components/ui/input';
import { Search, Plus, Package, Loader2, Eye, EyeOff } from 'lucide-react';
import type { Product } from '@/types/pos';

// Card height (px) + row gap (px)
const CARD_H = 72;
const ROW_GAP = 10;
const ROW_H = CARD_H + ROW_GAP;

function useCols(): number {
  const [cols, setCols] = useState(() => {
    if (typeof window === 'undefined') return 2;
    if (window.innerWidth >= 1280) return 5;
    if (window.innerWidth >= 1024) return 4;
    if (window.innerWidth >= 640) return 3;
    return 2;
  });
  useEffect(() => {
    const update = () => {
      if (window.innerWidth >= 1280) setCols(5);
      else if (window.innerWidth >= 1024) setCols(4);
      else if (window.innerWidth >= 640) setCols(3);
      else setCols(2);
    };
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return cols;
}

function ProductCard({ product, onAdd }: { product: Product; onAdd: (p: Product) => void }) {
  const outOfStock = product.currentStock <= 0;
  const noPrice = product.nomadBitePrice <= 0;
  const disabled = outOfStock || noPrice;

  const hue = product.name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  const bg = `hsla(${hue}, 60%, 50%, 0.12)`;
  const fg = `hsl(${hue}, 60%, 35%)`;

  return (
    <button
      disabled={disabled}
      onClick={() => onAdd(product)}
      style={{ height: `${CARD_H}px` }}
      className={`group flex items-center gap-3 px-3 rounded-xl border bg-card text-left transition-all duration-150 w-full overflow-hidden ${
        disabled
          ? 'opacity-40 cursor-not-allowed border-dashed'
          : 'hover:border-primary hover:shadow-md hover:shadow-primary/5 cursor-pointer hover:-translate-y-px active:translate-y-0'
      }`}
    >
      {/* Thumbnail / initials */}
      <div
        className="shrink-0 w-10 h-10 rounded-lg overflow-hidden relative flex items-center justify-center"
        style={{ backgroundColor: bg }}
      >
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <span className="text-xs font-black" style={{ color: fg }}>
            {product.name.substring(0, 2).toUpperCase()}
          </span>
        )}
        {outOfStock && (
          <div className="absolute inset-0 bg-background/75 flex items-center justify-center">
            <span className="text-[7px] font-black text-destructive leading-none">OUT</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold truncate leading-none mb-0.5">
          {product.category}
        </div>
        <div className="text-sm font-bold leading-tight truncate text-foreground group-hover:text-primary transition-colors">
          {product.name}
        </div>
        <div
          className="text-xs font-black mt-1"
          style={{ color: noPrice ? 'var(--muted-foreground)' : 'var(--primary)' }}
        >
          {noPrice ? 'NO PRICE' : `KES ${Number(product.nomadBitePrice).toLocaleString()}`}
        </div>
      </div>

      {/* Add button */}
      {!disabled && (
        <div className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center bg-primary/10 text-primary opacity-0 group-hover:opacity-100 transition-opacity">
          <Plus className="h-3.5 w-3.5" />
        </div>
      )}
    </button>
  );
}

export function Catalog() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [showOutOfStock, setShowOutOfStock] = useState(false);
  const addItem = useCartStore((s) => s.addItem);
  const { data: products = [], isLoading, isError } = useProducts();
  const scrollRef = useRef<HTMLDivElement>(null);
  const cols = useCols();

  // Barcode scanner: match scanned SKU directly to a product and add to cart
  const handleScan = useCallback((barcode: string) => {
    const match = products.find(
      (p) => p.sku.toLowerCase() === barcode.toLowerCase()
    );
    if (match && match.nomadBitePrice > 0) {
      addItem(match);
    } else {
      // Fall back to showing the barcode in the search box so the cashier can see it
      setSearch(barcode);
    }
  }, [products, addItem]);

  useBarcodeScanner(handleScan);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));
    return ['All', ...cats.sort()];
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) => {
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);
      const matchesCategory = activeCategory === 'All' || p.category === activeCategory;
      const isAvailable = p.currentStock > 0 && p.nomadBitePrice > 0;
      const matchesVisibility = showOutOfStock || isAvailable;
      return matchesSearch && matchesCategory && matchesVisibility;
    });
  }, [products, search, activeCategory, showOutOfStock]);

  // Group filtered items into rows of `cols` for virtualization
  const rows = useMemo(() => {
    const result: Product[][] = [];
    for (let i = 0; i < filtered.length; i += cols) {
      result.push(filtered.slice(i, i + cols));
    }
    return result;
  }, [filtered, cols]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 5,
  });

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Header: search + toggle + count */}
      <div className="flex flex-col gap-2 shrink-0">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by name, SKU, or category…"
              className="pl-10 bg-card border-border h-10 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowOutOfStock(!showOutOfStock)}
            className={`flex items-center gap-2 px-3 rounded-lg border transition-colors text-xs font-medium whitespace-nowrap ${
              showOutOfStock
                ? 'bg-primary/10 border-primary text-primary'
                : 'bg-card border-border text-muted-foreground hover:bg-muted'
            }`}
            title={showOutOfStock ? 'Showing all items' : 'Showing available only'}
          >
            {showOutOfStock ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            <span className="hidden sm:inline">{showOutOfStock ? 'Showing All' : 'Available'}</span>
          </button>
          <span className="shrink-0 flex items-center text-xs text-muted-foreground font-mono bg-card border rounded-lg px-3 whitespace-nowrap">
            {filtered.length}{products.length !== filtered.length ? ` / ${products.length}` : ''}
          </span>
        </div>

        {/* Category pills */}
        <div className="flex gap-1.5 overflow-x-auto py-0.5 shrink-0 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-150 border whitespace-nowrap ${
                activeCategory === cat
                  ? 'bg-primary border-primary text-primary-foreground shadow-sm'
                  : 'bg-card border-border text-muted-foreground hover:border-muted-foreground/30'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* States */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span className="text-sm">Loading inventory…</span>
        </div>
      )}
      {isError && (
        <div className="flex-1 flex items-center justify-center text-destructive text-sm font-medium">
          Cannot reach API — is the server running?
        </div>
      )}

      {/* Virtualized grid */}
      {!isLoading && !isError && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
              <Package className="h-12 w-12 opacity-10" />
              <p className="text-sm font-medium">No products found</p>
              <p className="text-xs opacity-60">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
              {virtualizer.getVirtualItems().map((vRow) => (
                <div
                  key={vRow.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 4,
                    height: `${CARD_H}px`,
                    transform: `translateY(${vRow.start}px)`,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                    gap: '10px',
                  }}
                >
                  {rows[vRow.index].map((product) => (
                    <ProductCard key={product.id} product={product} onAdd={addItem} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
