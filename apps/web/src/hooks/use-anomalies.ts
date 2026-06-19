import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const ANOMALIES_KEY = ['inventory-anomalies'] as const;

export function useAnomalies(resolved?: boolean) {
  return useQuery({
    queryKey: [...ANOMALIES_KEY, resolved],
    queryFn: () => api.products.listAnomalies(resolved),
    staleTime: 2 * 60 * 1000,
  });
}

export function useResolveAnomaly() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) =>
      api.products.resolveAnomaly(id, resolved),
    onSuccess: () => qc.invalidateQueries({ queryKey: ANOMALIES_KEY }),
  });
}

export function useBulkStoreAnomalies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: Array<{ sourceId: string; name: string; reason: string; notes: string }>) =>
      api.products.bulkStoreAnomalies(rows),
    onSuccess: () => qc.invalidateQueries({ queryKey: ANOMALIES_KEY }),
  });
}
