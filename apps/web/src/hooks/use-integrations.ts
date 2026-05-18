import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Integration, IntegrationType } from '@/lib/api';

export function useIntegrations() {
  return useQuery({
    queryKey: ['integrations'],
    queryFn: () => api.integrations.list(),
  });
}

export function useCreateIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Integration> & { name: string; type: IntegrationType }) =>
      api.integrations.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useUpdateIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Integration> }) =>
      api.integrations.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useDeleteIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.integrations.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useSyncIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { rows?: Record<string, unknown>[]; csvText?: string } }) =>
      api.integrations.sync(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integrations'] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useSyncLogs(integrationId: string | null) {
  return useQuery({
    queryKey: ['sync-logs', integrationId],
    queryFn: () => api.integrations.logs(integrationId!),
    enabled: !!integrationId,
  });
}
