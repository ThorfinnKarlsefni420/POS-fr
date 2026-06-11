import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useState } from 'react';
import { Loader2, CheckCircle, Clock, ArrowRight } from 'lucide-react';
import { useAuthStore } from '@/features/auth/store/use-auth-store';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function ConsignmentSettlementDashboard() {
  const queryClient = useQueryClient();
  const [selectedSaleIds, setSelectedSaleIds] = useState<string[]>([]);
  const { user } = useAuthStore();
  const isSuperadmin = user?.role === 'SUPERADMIN';

  const { data: pendingGroups, isLoading: pendLoading } = useQuery({
    queryKey: ['pending-consignment'],
    queryFn: () => api.consignment.pending(),
  });

  const { data: settlements, isLoading: settLoading } = useQuery({
    queryKey: ['settlements-consignment'],
    queryFn: () => api.consignment.listSettlements(),
  });

  const settleMutation = useMutation({
    mutationFn: (data: { supplierId: string; saleIds: string[] }) => 
      api.consignment.settle(data.supplierId, data.saleIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-consignment'] });
      queryClient.invalidateQueries({ queryKey: ['settlements-consignment'] });
      setSelectedSaleIds([]);
    },
  });

  const payMutation = useMutation({
    mutationFn: (id: string) => api.consignment.paySettlement(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlements-consignment'] });
    },
  });

  if (pendLoading || settLoading) return <div className="p-6 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>;

  const handleSettle = (supplierId: string, saleIds: string[]) => {
    settleMutation.mutate({ supplierId, saleIds });
  };

  return (
    <div className="p-6 space-y-6">
      <header className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Consignment Module</h1>
      </header>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pending">Pending Sales</TabsTrigger>
          <TabsTrigger value="settlements">Settlements</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-6 mt-4">
          {pendingGroups?.map((group: any) => (
            <div key={group.supplier.id} className="border rounded-lg bg-card overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/50 flex justify-between items-center">
                    <div>
                        <p className="font-bold">{group.supplier.name}</p>
                        <p className="text-xs text-muted-foreground">{group.sales.length} pending sales</p>
                    </div>
                    {isSuperadmin && (
                        <Button 
                            size="sm"
                            disabled={settleMutation.isPending}
                            onClick={() => handleSettle(group.supplier.id, group.sales.map((s: any) => s.id))}
                        >
                            {settleMutation.isPending ? 'Settling...' : `Settle KES ${Number(group.totalPayout).toFixed(2)}`}
                        </Button>
                    )}
                </div>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead>Qty</TableHead>
                            <TableHead className="text-right">Payout</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {group.sales.map((sale: any) => (
                            <TableRow key={sale.id}>
                                <TableCell className="text-xs">{sale.lineItem?.item?.name ?? 'Unknown'}</TableCell>
                                <TableCell className="text-xs">{Number(sale.lineItem?.quantity ?? 0)}</TableCell>
                                <TableCell className="text-right text-xs font-mono font-bold text-emerald-600">
                                    KES {Number(sale.payoutAmount).toFixed(2)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
          ))}
          {(!pendingGroups || pendingGroups.length === 0) && (
            <div className="text-center py-12 text-muted-foreground">No pending consignment sales.</div>
          )}
        </TabsContent>

        <TabsContent value="settlements" className="mt-4">
          <div className="bg-card border rounded-lg shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  {isSuperadmin && <TableHead className="text-right">Action</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlements?.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">{new Date(s.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium text-xs">
                        {s.supplier?.name}
                        {s.store && <p className="text-[10px] text-muted-foreground">{s.store.name}</p>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                        <p className="font-bold">KES {Number(s.totalAmount).toFixed(2)}</p>
                        <div className="flex flex-col text-[9px] text-muted-foreground">
                            <span>Vendor: {Number(s.supplierAmount).toFixed(2)}</span>
                            <span>Platform: {Number(s.superadminAmount).toFixed(2)}</span>
                        </div>
                    </TableCell>
                    <TableCell>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            s.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                            {s.status === 'PAID' ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                            {s.status}
                        </span>
                    </TableCell>
                    {isSuperadmin && (
                      <TableCell className="text-right">
                        {s.status === 'UNPAID' ? (
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="h-7 text-[10px] font-bold"
                            onClick={() => payMutation.mutate(s.id)}
                            disabled={payMutation.isPending}
                          >
                            Mark Paid
                          </Button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">{s.paidAt ? new Date(s.paidAt).toLocaleDateString() : '-'}</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {(!settlements || settlements.length === 0) && (
              <div className="text-center py-12 text-muted-foreground">No settlements yet.</div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
