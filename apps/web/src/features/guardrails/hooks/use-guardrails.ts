import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, GuardrailWeeklyInput, GuardrailCohortInput } from '@/lib/api';

export function useGuardrailDashboard() {
  return useQuery({
    queryKey: ['guardrails', 'dashboard'],
    queryFn: () => api.guardrails.dashboard(),
  });
}

export function useWeeklyEntries() {
  return useQuery({
    queryKey: ['guardrails', 'weekly'],
    queryFn: () => api.guardrails.listWeekly(),
  });
}

export function useCohorts() {
  return useQuery({
    queryKey: ['guardrails', 'cohorts'],
    queryFn: () => api.guardrails.listCohorts(),
  });
}

function useInvalidateGuardrails() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['guardrails'] });
}

export function useSaveWeeklyEntry() {
  const invalidate = useInvalidateGuardrails();
  return useMutation({
    mutationFn: (data: GuardrailWeeklyInput) => api.guardrails.saveWeekly(data),
    onSuccess: invalidate,
  });
}

export function useDeleteWeeklyEntry() {
  const invalidate = useInvalidateGuardrails();
  return useMutation({
    mutationFn: (id: string) => api.guardrails.deleteWeekly(id),
    onSuccess: invalidate,
  });
}

export function useSaveCohort() {
  const invalidate = useInvalidateGuardrails();
  return useMutation({
    mutationFn: (data: GuardrailCohortInput) => api.guardrails.saveCohort(data),
    onSuccess: invalidate,
  });
}

export function useDeleteCohort() {
  const invalidate = useInvalidateGuardrails();
  return useMutation({
    mutationFn: (id: string) => api.guardrails.deleteCohort(id),
    onSuccess: invalidate,
  });
}
