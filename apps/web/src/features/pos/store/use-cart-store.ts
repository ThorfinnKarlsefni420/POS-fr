import { create } from 'zustand';
import { CartItem, CartTotals, Product } from '@/types/pos';

interface CartState {
  items: CartItem[];
  addItem: (product: Product) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  setOverridePrice: (productId: string, price: number | undefined, reason?: string) => void;
  clearCart: () => void;
  totals: () => CartTotals;
}

const getEffectivePrice = (item: CartItem) =>
  item.overridePrice !== undefined ? item.overridePrice : item.nomadBitePrice;

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addItem: (product) => {
    set((state) => {
      const existing = state.items.find((i) => i.id === product.id);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
          ),
        };
      }
      return { items: [...state.items, { ...product, quantity: 1 }] };
    });
  },

  removeItem: (productId) =>
    set((state) => ({
      items: state.items.filter((i) => i.id !== productId),
    })),

  updateQuantity: (productId, quantity) =>
    set((state) => ({
      items: state.items
        .map((i) => (i.id === productId ? { ...i, quantity: Math.max(0, quantity) } : i))
        .filter((i) => i.quantity > 0),
    })),

  setOverridePrice: (productId, price, reason) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.id === productId
          ? { ...i, overridePrice: price, discountReason: price !== undefined ? reason : undefined }
          : i
      ),
    })),

  clearCart: () => set({ items: [] }),

  totals: () => {
    const { items } = get();
    let subtotal = 0;
    let taxAmount = 0;
    for (const item of items) {
      const price = getEffectivePrice(item);
      const lineTotal = price * item.quantity;
      subtotal += lineTotal;
      taxAmount += lineTotal * (item.taxRate / 100);
    }
    return { subtotal, taxAmount, total: subtotal + taxAmount };
  },

}));
