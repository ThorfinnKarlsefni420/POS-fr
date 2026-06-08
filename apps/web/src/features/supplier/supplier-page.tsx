import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/features/auth/store/use-auth-store';
import { Loader2 } from 'lucide-react';

export function SupplierPage() {
  const user = useAuthStore((s) => s.user);

  const { data: supplier, isLoading, error } = useQuery({
    queryKey: ['supplier-me'],
    queryFn: () => api.suppliers.getMe(),
    enabled: !!user && user.role === 'SUPPLIER',
  });

  if (isLoading) return <div className="p-6 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>;
  if (error) return <div className="p-6 text-center text-destructive">Error loading dashboard.</div>;
  if (!supplier) return null;

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight">Welcome, {user?.name}</h1>
        <p className="text-muted-foreground">{supplier.name} Dashboard</p>
      </header>
      
      <div className="grid gap-6 md:grid-cols-3">
        <div className="bg-card border rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase">Active Products</h2>
          <p className="text-3xl font-black mt-2">{supplier.items.length}</p>
        </div>
        <div className="bg-card border rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase">Pending Sales</h2>
          <p className="text-3xl font-black mt-2">
            {supplier.consignmentSales.filter(s => s.status === 'PENDING').length}
          </p>
        </div>
        <div className="bg-card border rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase">Recent Settlements</h2>
          <p className="text-3xl font-black mt-2">{supplier.settlements.length}</p>
        </div>
      </div>

      <div className="bg-card border rounded-2xl p-6 shadow-sm">
        <h2 className="text-xl font-bold mb-4">Inventory</h2>
        <table className="w-full">
            <thead>
                <tr className="text-left text-sm text-muted-foreground">
                    <th className="pb-2">Name</th>
                    <th className="pb-2">Stock</th>
                    <th className="pb-2">Cost</th>
                </tr>
            </thead>
            <tbody>
                {supplier.items.map(item => (
                    <tr key={item.id} className="border-t">
                        <td className="py-3 font-medium">{item.name}</td>
                        <td className="py-3">{Number(item.currentStock)}</td>
                        <td className="py-3">KES {Number(item.costPrice).toFixed(2)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>
    </div>
  );
}
