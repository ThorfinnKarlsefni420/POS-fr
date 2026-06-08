import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/features/auth/store/use-auth-store';

export function ConsignmentSettlementDashboard() {
  const queryClient = useQueryClient();
  const [selectedSaleIds, setSelectedSaleIds] = useState<string[]>([]);
  const { user } = useAuthStore();
  const isSuperadmin = user?.role === 'SUPERADMIN';

  const { data: pendingGroups, isLoading } = useQuery({
    queryKey: ['pending-consignment'],
    queryFn: () => api.consignment.pending(),
  });

  const settleMutation = useMutation({
    mutationFn: (data: { supplierId: string; saleIds: string[] }) => 
      api.consignment.settle(data.supplierId, data.saleIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-consignment'] });
      setSelectedSaleIds([]);
    },
  });

  if (isLoading) return <div className="p-6 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>;

  // Assuming 1 supplier per store based on user input
  const supplierData = pendingGroups?.[0]; 

  if (!supplierData) return <div className="p-6">No pending consignment sales.</div>;

  const handleSettle = () => {
    settleMutation.mutate({
      supplierId: supplierData.supplier.id,
      saleIds: selectedSaleIds,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <header className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Consignment Settlements</h1>
        {isSuperadmin && (
          <Button 
              disabled={selectedSaleIds.length === 0 || settleMutation.isPending}
              onClick={handleSettle}
          >
            {settleMutation.isPending ? 'Settling...' : `Settle ${selectedSaleIds.length} Items`}
          </Button>
        )}
      </header>

      <div className="bg-card border rounded-lg shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              {isSuperadmin && (
                <TableCell className="w-12">
                  <input 
                    type="checkbox" 
                    onChange={(e) => {
                      if (e.target.checked) setSelectedSaleIds(supplierData.sales.map((s: any) => s.id));
                      else setSelectedSaleIds([]);
                    }}
                  />
                </TableCell>
              )}
              <TableHead>Item</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead className="text-right">Payout Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {supplierData.sales.map((sale: any) => (
              <TableRow key={sale.id}>
                {isSuperadmin && (
                  <TableCell>
                    <input 
                      type="checkbox" 
                      checked={selectedSaleIds.includes(sale.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedSaleIds([...selectedSaleIds, sale.id]);
                        else setSelectedSaleIds(selectedSaleIds.filter(id => id !== sale.id));
                      }}
                    />
                  </TableCell>
                )}
                <TableCell>{sale.lineItem.item.name}</TableCell>
                <TableCell>{Number(sale.lineItem.quantity)}</TableCell>
                <TableCell className="text-right">KES {Number(sale.payoutAmount).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
