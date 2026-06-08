import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { PosPage } from '@/features/pos/pos-page';
import { InventoryPage } from '@/features/inventory/inventory-page';
import { SupplierPage } from '@/features/supplier/supplier-page';
import { AdminPage } from '@/features/admin/admin-page';
import { ReturnsPage } from '@/features/returns/returns-page';
import { ReportsPage } from '@/features/reports/reports-page';
import { CustomersPage } from '@/features/customers/customers-page';
import { PinGate } from '@/features/auth/components/pin-gate';
import { LoginPage } from '@/features/auth/components/login-page';
import { SuperAdminPage } from '@/features/superadmin/superadmin-page';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { useSettingsSync } from '@/hooks/use-settings-sync';
import { useAuthStore } from '@/features/auth/store/use-auth-store';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function AppRoutes() {
  useOfflineSync();
  useSettingsSync();
  const user = useAuthStore((s) => s.user);

  if (!user) return <LoginPage />;

  if (user.role === 'SUPERADMIN') {
    return (
      <>
        <Routes>
          <Route path="/superadmin" element={<SuperAdminPage />} />
          <Route path="*" element={<Navigate to="/superadmin" replace />} />
        </Routes>
        <PinGate />
      </>
    );
  }

  if (user.role === 'SUPPLIER') {
    return (
      <Routes>
        <Route path="/supplier" element={<SupplierPage />} />
        <Route path="*" element={<Navigate to="/supplier" replace />} />
      </Routes>
    );
  }

  return (
    <>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/pos" replace />} />
          <Route path="/pos" element={<PosPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/returns" element={<ReturnsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/customers" element={user.role === 'CASHIER' ? <Navigate to="/pos" replace /> : <CustomersPage />} />
          <Route path="/admin" element={user.role === 'CASHIER' ? <Navigate to="/pos" replace /> : <AdminPage />} />
          <Route path="*" element={<Navigate to="/pos" replace />} />
        </Route>
      </Routes>
      <PinGate />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
