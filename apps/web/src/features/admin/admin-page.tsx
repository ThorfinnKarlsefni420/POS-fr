import { ServiceFeeSettings } from './components/service-fee-settings';
import { StaffManagement } from './components/staff-management';

export function AdminPage() {
  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Admin Settings</h1>
        <p className="text-sm text-muted-foreground">Configure pricing, fees, and manage your store's staff</p>
      </div>
      <StaffManagement />
      <ServiceFeeSettings />
    </div>
  );
}
