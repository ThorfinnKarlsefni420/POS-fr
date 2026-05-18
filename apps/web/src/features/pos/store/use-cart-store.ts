import { create } from 'zustand';
import { CartItem, CartTotals, PackagingTier, Product } from '@/types/pos';

interface CartState {
  items: CartItem[];
  addItem: (product: Product, tier?: PackagingTier) => void;
  removeItem: (cartKey: string) => void;
  updateQuantity: (cartKey: string, quantity: number) => void;
  setOverridePrice: (cartKey: string, price: number | undefined, reason?: string) => void;
  clearCart: () => void;
  totals: () => CartTotals;
}

function makeCartKey(productId: string, tierId?: string) {
  return `${productId}:${tierId ?? 'base'}`;
}

function tierSellingPrice(product: Product, tier: PackagingTier): number {
  if (tier.sellingPriceOverride != null) return tier.sellingPriceOverride;
  return product.nomadBitePrice * tier.quantityInBase;
}

const getEffectivePrice = (item: CartItem) =>
  item.overridePrice !== undefined ? item.overridePrice : item.sellingPrice;

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addItem: (product, tier) => {
    const cartKey = makeCartKey(product.id, tier?.id);
    const sellingPrice = tier ? tierSellingPrice(product, tier) : product.nomadBitePrice;

    set((state) => {
      const existing = state.items.find((i) => i.cartKey === cartKey);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.cartKey === cartKey ? { ...i, quantity: i.quantity + 1 } : i
          ),
        };
      }
      const newItem: CartItem = {
        ...product,
        cartKey,
        quantity: 1,
        selectedTier: tier,
        sellingPrice,
      };
      return { items: [...state.items, newItem] };
    });
  },

  removeItem: (cartKey) =>
    set((state) => ({
      items: state.items.filter((i) => i.cartKey !== cartKey),
    })),

  updateQuantity: (cartKey, quantity) =>
    set((state) => ({
      items: state.items
        .map((i) => (i.cartKey === cartKey ? { ...i, quantity: Math.max(0, quantity) } : i))
        .filter((i) => i.quantity > 0),
    })),

  setOverridePrice: (cartKey, price, reason) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.cartKey === cartKey
          ? { ...i, overridePrice: price, discountReason: price !== undefined ? reason : undefined }
          : i
      ),
    })),

  clearCart: () => set({ items: [] }),

  totals: () => {
    const { items } = get();
    let subtotal = 0;
    let taxAmount = 0;
    let totalZeroKes = 0;
    let totalExemptKes = 0;
    for (const item of items) {
      const price = getEffectivePrice(item);
      const lineTotal = price * item.quantity;
      subtotal += lineTotal;
      // Prices are VAT-inclusive (KRA standard). Extract VAT; never add on top.
      if (item.etimsCode === 'VAT') {
        taxAmount += lineTotal * 0.16 / 1.16;
      } else if (item.etimsCode === 'ZERO') {
        totalZeroKes += lineTotal;
      } else {
        totalExemptKes += lineTotal;
      }
    }
    return {
      subtotal,
      taxAmount: Math.round(taxAmount * 100) / 100,
      totalZeroKes: Math.round(totalZeroKes * 100) / 100,
      totalExemptKes: Math.round(totalExemptKes * 100) / 100,
      total: subtotal,  // total = subtotal; VAT is extracted from inclusive price, not added
    };
  },

}));
