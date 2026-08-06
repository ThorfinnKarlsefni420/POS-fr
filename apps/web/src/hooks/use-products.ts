import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiItemToProduct } from '@/lib/api';
import { Product } from '@/types/pos';
import { useAuthStore } from '@/features/auth/store/use-auth-store';

// Scoped by storeId so switching stores/users in the same session can't serve
// another store's cached items (X-Store-Id header changes, but an unscoped
// key would keep returning the previous store's cached response).
export function productsKey(storeId: string | null | undefined) {
  return ['products', storeId ?? 'superadmin'] as const;
}

export function useProducts() {
  const storeId = useAuthStore((s) => s.user?.storeId);
  return useQuery({
    queryKey: productsKey(storeId),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.products.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useImportProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ products, replace }: { products: Product[]; replace: boolean }) =>
      api.products.import(products as never, replace),
    onSuccess: (data) => {
      console.log(`[IMPORT RESULT] succeeded=${data.succeeded} failed=${data.failed}`);
      if (data.firstErrors?.length) {
        console.error('[IMPORT FIRST ERRORS]', data.firstErrors);
      }
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
