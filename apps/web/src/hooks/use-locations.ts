import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, LocationType, TransferPayload } from '@/lib/api';

export function useReplenishmentAlerts() {
  return useQuery({
    queryKey: ['replenishment'],
    queryFn: () => api.locations.replenishment(),
    staleTime: 30_000,
  });
}

export function useLocations() {
  return useQuery({
    queryKey: ['locations'],
    queryFn: () => api.locations.list(),
  });
}

export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; type?: LocationType; description?: string }) =>
      api.locations.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations'] }),
  });
}

export function useUpdateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.locations.update>[1] }) =>
      api.locations.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations'] }),
  });
}

export function useDeactivateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.locations.deactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations'] }),
  });
}

export function useItemStock(itemId: string | null) {
  return useQuery({
    queryKey: ['item-stock', itemId],
    queryFn: () => api.locations.getItemStock(itemId!),
    enabled: !!itemId,
  });
}

export function useTransferStock(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: TransferPayload) => api.locations.transfer(itemId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['item-stock', itemId] });
      qc.invalidateQueries({ queryKey: ['transfers'] });
    },
  });
}

export function useTransfers(itemId?: string) {
  return useQuery({
    queryKey: ['transfers', itemId],
    queryFn: () => api.locations.transfers({ itemId, limit: 50 }),
  });
}
