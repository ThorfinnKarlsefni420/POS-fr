import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Product } from '@/types/pos';
import { MOCK_PRODUCTS } from '@/features/pos/mock-data';

interface InventoryState {
  products: Product[];
  setProducts: (products: Product[]) => void;
  addProduct: (product: Product) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  importProducts: (products: Product[], replace?: boolean) => void;
  adjustStock: (id: string, delta: number) => void;
}

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      products: MOCK_PRODUCTS,

      setProducts: (products) => set({ products }),

      addProduct: (product) =>
        set((state) => ({ products: [...state.products, product] })),

      updateProduct: (id, updates) =>
        set((state) => ({
          products: state.products.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        })),

      deleteProduct: (id) =>
        set((state) => ({
          products: state.products.filter((p) => p.id !== id),
        })),

      importProducts: (incoming, replace = false) =>
        set((state) => {
          if (replace) return { products: incoming };
          const existingSkus = new Set(state.products.map((p) => p.sku));
          const newItems = incoming.filter((p) => !existingSkus.has(p.sku));
          const updated = state.products.map((existing) => {
            const match = incoming.find((p) => p.sku === existing.sku);
            return match ? { ...existing, ...match } : existing;
          });
          return { products: [...updated, ...newItems] };
        }),

      adjustStock: (id, delta) => {
        const { products } = get();
        const product = products.find((p) => p.id === id);
        if (!product) return;
        const newStock = product.currentStock + delta;
        set((state) => ({
          products: state.products.map((p) =>
            p.id === id ? { ...p, currentStock: newStock } : p
          ),
        }));
      },
    }),
    { name: 'pos-inventory' }
  )
);
