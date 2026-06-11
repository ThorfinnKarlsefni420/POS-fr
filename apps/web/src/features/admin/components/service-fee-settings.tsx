import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSettingsStore } from '../store/use-settings-store';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Wallet } from 'lucide-react';

export function ServiceFeeSettings() {
  const {
    storeName, setStoreName,
    cloudinaryCloudName, setCloudinaryCloudName,
    cloudinaryUploadPreset, setCloudinaryUploadPreset,
    consignmentEnabled, setConsignmentEnabled,
    consignmentRate, setConsignmentRate,
    consignmentType, setConsignmentType,
  } = useSettingsStore();

  const { data: remoteSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });

  const [nameInput, setNameInput]           = useState(storeName);
  const [cloudInput, setCloudInput]         = useState(cloudinaryCloudName);
  const [presetInput, setPresetInput]       = useState(cloudinaryUploadPreset);
  const [isConsignment, setIsConsignment]   = useState(consignmentEnabled);
  const [cRate, setCRate]                   = useState(consignmentRate);
  const [saved, setSaved]                   = useState(false);

  useEffect(() => {
    if (remoteSettings) {
      setNameInput(remoteSettings.storeName);
      setCloudInput(remoteSettings.cloudinaryCloudName);
      setPresetInput(remoteSettings.cloudinaryUploadPreset);
      setIsConsignment(remoteSettings.consignmentEnabled);
      setCRate(remoteSettings.consignmentRate);
    }
  }, [remoteSettings]);

  const saveSettings = useMutation({
    mutationFn: () => api.settings.save({ 
        storeName: nameInput, 
        cloudinaryCloudName: cloudInput, 
        cloudinaryUploadPreset: presetInput,
        consignmentEnabled: isConsignment,
        consignmentRate: cRate,
        consignmentType: 'PERCENTAGE_COMMISSION'
    }),
    onSuccess: () => {
      setStoreName(nameInput);
      setCloudinaryCloudName(cloudInput);
      setCloudinaryUploadPreset(presetInput);
      setConsignmentEnabled(isConsignment);
      setConsignmentRate(cRate);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  return (
    <div className="space-y-5 max-w-xl">
      <Card>
        <CardHeader><CardTitle className="text-base font-bold">Store</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Store Name</Label>
            <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="NomadBite POS" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
            <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-emerald-600" />
                    Consignment Module
                </CardTitle>
                <div className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200 cursor-pointer transition-colors"
                     style={{ backgroundColor: isConsignment ? 'oklch(0.5 0.15 145)' : '' }}
                     onClick={() => setIsConsignment(!isConsignment)}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isConsignment ? 'translate-x-6' : 'translate-x-1'}`} />
                </div>
            </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            When enabled, every transaction will be treated as a consignment sale. 
            The Superadmin will make payouts to the vendor based on the rate below.
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Vendor Portion (0.0 - 1.0)</Label>
            <div className="flex items-center gap-2">
                <Input 
                    type="number" 
                    step="0.01" 
                    min="0" 
                    max="1" 
                    value={cRate} 
                    onChange={(e) => setCRate(Number(e.target.value))} 
                    disabled={!isConsignment}
                />
                <span className="text-xs font-bold whitespace-nowrap">{(cRate * 100).toFixed(0)}% to Vendor</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Example: 0.90 means the vendor gets 90% and superadmin keeps 10%.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base font-bold">Image Settings (Cloudinary)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Cloud Name</Label>
            <Input value={cloudInput} onChange={(e) => setCloudInput(e.target.value)} placeholder="your-cloud-name" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Upload Preset <span className="font-normal text-muted-foreground">(unsigned)</span></Label>
            <Input value={presetInput} onChange={(e) => setPresetInput(e.target.value)} placeholder="ml_default" />
          </div>
        </CardContent>
      </Card>

      <button
        onClick={() => saveSettings.mutate()}
        disabled={saveSettings.isPending}
        className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-70"
        style={{ background: saved ? 'oklch(0.5 0.15 145)' : 'var(--primary)', color: 'white' }}
      >
        {saved ? <><CheckCircle className="h-4 w-4" /> Saved</> : 'Save Settings'}
      </button>
    </div>
  );
}
