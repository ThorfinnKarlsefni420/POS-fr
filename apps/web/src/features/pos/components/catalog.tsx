import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCartStore } from '../store/use-cart-store';
import { useProducts } from '@/hooks/use-products';
import { useBarcodeScanner } from '@/hooks/use-barcode-scanner';
import { useVoiceAssist } from '@/hooks/use-voice-assist';
import { useAuthStore } from '@/features/auth/store/use-auth-store';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Plus, Package, Loader2, Eye, EyeOff, Layers, Mic, MicOff, X } from 'lucide-react';
import type { PackagingTier, Product } from '@/types/pos';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

// Kenyan language options for the voice mic
const LANG_OPTIONS: { code: string; label: string }[] = [
  { code: 'so', label: 'SO' },  // Somali
  { code: 'sw', label: 'SW' },  // Swahili
  { code: 'en', label: 'EN' },  // English
];

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
  console.log(`[DEBUG] Product ${product.sku} packagingTiers:`, product.packagingTiers);
  const outOfStock = product.currentStock <= 0;
  const noPrice = product.sellingPrice <= 0 && product.nomadBitePrice <= 0;
  const disabled = outOfStock || noPrice;
  const tierCount = product.packagingTiers?.length ?? 0;

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
        <div className="flex items-center gap-1.5 mt-1">
          <div
            className="text-xs font-black"
            style={{ color: noPrice ? 'var(--muted-foreground)' : 'var(--primary)' }}
          >
            {noPrice ? 'NO PRICE' : `KES ${Number(product.nomadBitePrice || product.sellingPrice).toLocaleString()}`}
          </div>
          {tierCount > 1 && (
            <span className="flex items-center gap-0.5 text-[9px] font-bold text-muted-foreground">
              <Layers className="h-2.5 w-2.5" />
              {tierCount}
            </span>
          )}
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

function TierPickerDialog({
  product,
  onSelect,
  onClose,
}: {
  product: Product;
  onSelect: (tier?: PackagingTier) => void;
  onClose: () => void;
}) {
  const dbTiers = (product.packagingTiers ?? []).filter((t) => !t.isBaseUnit && t.level > 0);

  // Always include the base unit (individual piece) as the first option
  const baseUnitName = product.unit || 'Piece';
  const basePrice = product.nomadBitePrice || product.sellingPrice;

  function tierPrice(tier: PackagingTier): number {
    if (tier.sellingPriceOverride != null) return tier.sellingPriceOverride;
    return basePrice * tier.quantityInBase;
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="font-black text-base">{product.name}</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Select packaging size</p>
        </DialogHeader>
        <div className="space-y-2 pt-1">
          {/* Base unit — always first */}
          <button
            onClick={() => onSelect(undefined)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border hover:border-primary hover:bg-primary/5 transition-all text-left group"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold group-hover:text-primary transition-colors">{baseUnitName}</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: 'oklch(0.477 0.216 27.3 / 0.12)', color: 'var(--primary)' }}>
                  BASE
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">1 {baseUnitName}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-black" style={{ color: 'var(--primary)' }}>
                KES {basePrice.toLocaleString()}
              </p>
            </div>
          </button>

          {/* Higher tiers (Outer, Carton, Bale…) */}
          {dbTiers.map((tier) => (
            <button
              key={tier.id}
              onClick={() => onSelect(tier)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border hover:border-primary hover:bg-primary/5 transition-all text-left group"
            >
              <div>
                <span className="text-sm font-bold group-hover:text-primary transition-colors">{tier.name}</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {Number(tier.quantityInBase).toLocaleString()} {baseUnitName}s each
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-black" style={{ color: 'var(--primary)' }}>
                  KES {tierPrice(tier).toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  KES {basePrice.toLocaleString()} / {baseUnitName}
                </p>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Catalog() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [showOutOfStock, setShowOutOfStock] = useState(false);
  const [tierPickProduct, setTierPickProduct] = useState<Product | null>(null);
  const [voiceLang, setVoiceLang] = useState('so');
  const addItem = useCartStore((s) => s.addItem);
  const { data: products = [], isLoading, isError } = useProducts();
  const scrollRef = useRef<HTMLDivElement>(null);
  const cols = useCols();

  const user = useAuthStore((s) => s.user);
  const voiceHeaders = useCallback(() => ({
    ...(user?.id ? { 'X-User-Id': user.id } : {}),
    ...(user?.storeId ? { 'X-Store-Id': user.storeId } : {}),
  }), [user]);

  const {
    isListening,
    partial,
    transcript,
    suggestions,
    processing,
    error: voiceError,
    startListening,
    stopListening,
    clearSuggestions,
  } = useVoiceAssist(API_BASE, voiceHeaders);

  const handleAddProduct = useCallback((product: Product) => {
    const tiers = (product.packagingTiers ?? []).filter((t) => !t.isBaseUnit && t.level > 0);
    if (tiers.length >= 1) {
      // Has packaging tiers — show picker so cashier can choose Piece, Outer, Carton, etc.
      setTierPickProduct(product);
    } else {
      // No tiers — add as base unit directly
      addItem(product);
    }
  }, [addItem]);

  // Barcode scanner: match scanned SKU or tier barcode directly to a product and add to cart
  const handleScan = useCallback((barcode: string) => {
    // First check tier barcodes across all products
    for (const p of products) {
      const matchTier = (p.packagingTiers ?? []).find(
        (t) => t.barcode && t.barcode.toLowerCase() === barcode.toLowerCase()
      );
      if (matchTier && p.sellingPrice > 0) {
        addItem(p, matchTier);
        return;
      }
    }
    // Fall back to SKU match
    const match = products.find(
      (p) => p.sku.toLowerCase() === barcode.toLowerCase()
    );
    if (match && match.sellingPrice > 0) {
      handleAddProduct(match);
    } else {
      setSearch(barcode);
    }
  }, [products, addItem, handleAddProduct]);

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
      const isAvailable = p.currentStock > 0 && p.sellingPrice > 0;
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
      {/* Header: search + mic + toggle + count */}
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

          {/* Voice mic button — tap to toggle */}
          <button
            onClick={() => isListening ? stopListening() : startListening(voiceLang)}
            className={`relative flex items-center gap-1.5 px-3 rounded-lg border transition-colors text-xs font-bold whitespace-nowrap select-none ${
              isListening
                ? 'bg-primary border-primary text-primary-foreground animate-pulse'
                : processing
                  ? 'bg-primary/10 border-primary text-primary'
                  : 'bg-card border-border text-muted-foreground hover:bg-muted hover:border-primary/40'
            }`}
            title={isListening ? 'Tap to stop' : 'Tap to speak — Somali, Swahili, or English'}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {/* Language selector — only when idle */}
            {!isListening && !processing && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  const idx = LANG_OPTIONS.findIndex((l) => l.code === voiceLang);
                  setVoiceLang(LANG_OPTIONS[(idx + 1) % LANG_OPTIONS.length].code);
                }}
                className="text-[9px] font-black px-1 py-0.5 rounded bg-muted text-muted-foreground cursor-pointer hover:bg-primary/10 hover:text-primary"
                title="Tap to change language"
              >
                {LANG_OPTIONS.find((l) => l.code === voiceLang)?.label ?? 'SO'}
              </span>
            )}
            {processing && <Loader2 className="h-3 w-3 animate-spin" />}
          </button>

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

        {/* Voice strip — live partial, processing indicator, and suggestion chips */}
        {(isListening && partial) || processing || suggestions.length > 0 || (transcript && !isListening) || voiceError ? (
          <div className="flex items-center gap-2 overflow-x-auto py-0.5 shrink-0 scrollbar-none">
            {/* Live partial transcript while streaming */}
            {isListening && partial && (
              <span className="shrink-0 text-[10px] text-muted-foreground italic truncate max-w-[220px] animate-pulse">
                "{partial}"
              </span>
            )}
            {/* LeMUR processing indicator */}
            {processing && (
              <span className="shrink-0 flex items-center gap-1 text-[10px] text-primary font-medium">
                <Loader2 className="h-3 w-3 animate-spin" />
                Processing…
              </span>
            )}
            {/* Final transcript when no suggestions matched */}
            {transcript && suggestions.length === 0 && !processing && (
              <span className="shrink-0 text-[10px] text-muted-foreground italic truncate max-w-[200px]">
                "{transcript}"
              </span>
            )}
            {voiceError && (
              <span className="shrink-0 text-[10px] text-destructive font-medium">{voiceError}</span>
            )}
            {suggestions.map((s) => {
              const product = products.find((p) => p.id === s.productId);
              if (!product) return null;
              const borderColor = s.confidence === 'high'
                ? 'var(--primary)'
                : s.confidence === 'medium'
                  ? 'oklch(0.6 0.15 60)'
                  : 'var(--border)';
              return (
                <button
                  key={s.productId}
                  onClick={() => {
                    handleAddProduct(product);
                    clearSuggestions();
                  }}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all hover:opacity-80 active:scale-95"
                  style={{
                    border: `1.5px solid ${borderColor}`,
                    color: 'var(--primary)',
                    background: 'oklch(0.477 0.216 27.3 / 0.07)',
                  }}
                >
                  <Mic className="h-3 w-3 shrink-0" />
                  {s.name}
                  {s.qty && s.qty > 1 ? ` ×${s.qty}` : ''}
                </button>
              );
            })}
            {/* Dismiss */}
            {(suggestions.length > 0 || transcript) && !isListening && (
              <button
                onClick={clearSuggestions}
                className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Dismiss suggestions"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : null}
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
                    <ProductCard key={product.id} product={product} onAdd={handleAddProduct} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tierPickProduct && (
        <TierPickerDialog
          product={tierPickProduct}
          onSelect={(tier) => {
            addItem(tierPickProduct, tier);
            setTierPickProduct(null);
          }}
          onClose={() => setTierPickProduct(null)}
        />
      )}
    </div>
  );
}
