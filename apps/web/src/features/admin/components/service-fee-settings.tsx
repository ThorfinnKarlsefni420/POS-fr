import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../store/use-settings-store';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle } from 'lucide-react';

export function ServiceFeeSettings() {
  const {
    storeName, setStoreName,
    cloudinaryCloudName, setCloudinaryCloudName,
    cloudinaryUploadPreset, setCloudinaryUploadPreset,
  } = useSettingsStore();

  const [nameInput, setNameInput]     = useState(storeName);
  const [cloudInput, setCloudInput]   = useState(cloudinaryCloudName);
  const [presetInput, setPresetInput] = useState(cloudinaryUploadPreset);
  const [saved, setSaved]             = useState(false);

  const saveSettings = useMutation({
    mutationFn: () => api.settings.save({ storeName: nameInput, cloudinaryCloudName: cloudInput, cloudinaryUploadPreset: presetInput }),
    onSuccess: () => {
      setStoreName(nameInput);
      setCloudinaryCloudName(cloudInput);
      setCloudinaryUploadPreset(presetInput);
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
        <CardHeader><CardTitle className="text-base font-bold">Image Settings (Cloudinary)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Cloud Name</Label>
            <Input value={cloudInput} onChange={(e) => setCloudInput(e.target.value)} placeholder="your-cloud-name" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Upload Preset <span className="font-normal text-muted-foreground">(unsigned)</span></Label>
            <Input value={presetInput} onChange={(e) => setPresetInput(e.target.value)} placeholder="ml_default" />
            <div className="rounded-lg p-3 text-xs text-muted-foreground space-y-1" style={{ background: 'var(--muted)' }}>
              <p className="font-semibold text-foreground">How to create an unsigned preset:</p>
              <p>1. Go to Cloudinary Dashboard → Settings → Upload → Upload presets</p>
              <p>2. Click <strong>Add upload preset</strong> → set Signing mode to <strong>Unsigned</strong></p>
              <p>3. Copy the preset name here and save settings</p>
              <p className="mt-1">Once configured, you can upload images directly from the Inventory edit dialog.</p>
            </div>
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
