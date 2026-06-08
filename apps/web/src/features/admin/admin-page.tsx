import { ConsignmentTab } from '@/features/consignment/consignment-tab';
import { ServiceFeeSettings } from './components/service-fee-settings';
import { StaffManagement } from './components/staff-management';
import { PromosPanel } from './components/promos-panel';
import { Handshake } from 'lucide-react';

export function AdminPage() {
  return (
    <div className="h-full overflow-y-auto p-6 space-y-8">
      <div>
        <h1 className="text-xl font-bold">Admin Settings</h1>
        <p className="text-sm text-muted-foreground">Configure pricing, fees, and manage your store's staff</p>
      </div>
      <StaffManagement />
      <ServiceFeeSettings />
      <PromosPanel />
      <div className="space-y-4">
        <div className="flex items-center gap-2">
            <Handshake className="h-5 w-5 text-emerald-600" />
            <h2 className="text-xl font-bold">Consignment</h2>
        </div>
        <ConsignmentTab />
      </div>
    </div>
  );
}
