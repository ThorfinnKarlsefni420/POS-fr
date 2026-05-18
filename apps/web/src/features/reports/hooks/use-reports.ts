import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useSalesReport(from: string, to: string) {
  return useQuery({
    queryKey: ['reports', 'sales', from, to],
    queryFn: () => api.reports.sales(from, to),
  });
}

export function useShiftsReport(from: string, to: string) {
  return useQuery({
    queryKey: ['reports', 'shifts', from, to],
    queryFn: () => api.reports.shifts(from, to),
  });
}

export function useInventoryReport() {
  return useQuery({
    queryKey: ['reports', 'inventory'],
    queryFn: () => api.reports.inventory(),
  });
}

export function useVatReport(from: string, to: string) {
  return useQuery({
    queryKey: ['reports', 'vat', from, to],
    queryFn: () => api.reports.vat(from, to),
  });
}

export function useProfitReport(from: string, to: string) {
  return useQuery({
    queryKey: ['reports', 'profit', from, to],
    queryFn: () => api.reports.profit(from, to),
  });
}
