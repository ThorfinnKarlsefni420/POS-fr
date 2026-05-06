import { ServiceFeeSettings } from './components/service-fee-settings';

export function AdminPage() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Admin Settings</h1>
        <p className="text-sm text-muted-foreground">Configure pricing, fees, and integrations</p>
      </div>
      <ServiceFeeSettings />
    </div>
  );
}
