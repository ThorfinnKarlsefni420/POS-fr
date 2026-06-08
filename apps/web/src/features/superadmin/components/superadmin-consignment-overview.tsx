import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, AlertCircle } from 'lucide-react';

export function SuperadminConsignmentOverview() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['superadmin-consignment-pending'],
    queryFn: () => api.get('/superadmin/consignment/pending').then(res => res.data),
    staleTime: 60_000,
  });

  if (isLoading) return <div className="p-6 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>;
  if (isError) return <div className="p-6 text-center text-red-600 flex items-center justify-center gap-2"><AlertCircle className="h-5 w-5" /> Error loading data.</div>;
  if (!data || data.stores.length === 0) return <div className="p-6 text-center text-gray-400">No pending consignment payouts across all stores.</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border">
        <h2 className="font-bold text-lg">Consolidated Pending Payouts</h2>
        <div className="text-xl font-black text-orange-600">
          KES {Number(data.totalPendingPayout).toLocaleString()}
        </div>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Store</TableHead>
              <TableHead className="text-right">Sales Count</TableHead>
              <TableHead className="text-right">Pending Payout</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.stores.map((s: any) => (
              <TableRow key={s.storeName}>
                <TableCell className="font-medium">{s.storeName}</TableCell>
                <TableCell className="text-right">{s.salesCount}</TableCell>
                <TableCell className="text-right font-bold">KES {Number(s.totalPayout).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
