import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiItemToProduct } from '@/lib/api';
import { Product } from '@/types/pos';

export const PRODUCTS_KEY = ['products'] as const;

export function useProducts() {
  return useQuery({
    queryKey: PRODUCTS_KEY,
    queryFn: async () => {
      const items = await api.products.list();
      return items.map(apiItemToProduct);
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Product> }) =>
      api.products.update(id, updates as never),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.products.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  });
}

export function useImportProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ products, replace }: { products: Product[]; replace: boolean }) =>
      api.products.import(products as never, replace),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  });
}
