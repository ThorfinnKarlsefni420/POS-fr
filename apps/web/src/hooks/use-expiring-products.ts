import { useQuery } from '@tanstack/react-query';
import { api, ExpiringProduct } from '@/lib/api';

export function useExpiringProducts(days = 30) {
  return useQuery<ExpiringProduct[]>({
    queryKey: ['products', 'expiring', days],
    queryFn: () => api.products.expiring(days),
    staleTime: 5 * 60_000,
  });
}
