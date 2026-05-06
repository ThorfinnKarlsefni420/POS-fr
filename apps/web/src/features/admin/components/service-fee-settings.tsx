import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../store/use-settings-store';
import { api } from '@/lib/api';
import { useProducts, useImportProducts } from '@/hooks/use-products';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Percent, RefreshCw, CheckCircle } from 'lucide-react';

export function ServiceFeeSettings() {
  const {
    serviceFeePercent, setServiceFeePercent,
    storeName, setStoreName,
    cloudinaryCloudName, setCloudinaryCloudName,
    cloudinaryUploadPreset, setCloudinaryUploadPreset,
  } = useSettingsStore();
  const { data: products = [] } = useProducts();
  const importProducts = useImportProducts();

  const [feeInput, setFeeInput] = useState(String(serviceFeePercent));
  const [nameInput, setNameInput] = useState(storeName);
  const [cloudInput, setCloudInput] = useState(cloudinaryCloudName);
  const [presetInput, setPresetInput] = useState(cloudinaryUploadPreset);
  const [saved, setSaved] = useState(false);
  const [previewCost, setPreviewCost] = useState('1000');

  const saveSettings = useMutation({
    mutationFn: () => api.settings.save({ serviceFeePercent: Number(feeInput), storeName: nameInput, cloudinaryCloudName: cloudInput, cloudinaryUploadPreset: presetInput }),
    onSuccess: () => {
      setServiceFeePercent(Number(feeInput));
      setStoreName(nameInput);
      setCloudinaryCloudName(cloudInput);
      setCloudinaryUploadPreset(presetInput);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const fee = parseFloat(feeInput) || 0;
  const previewSelling = Number((Number(previewCost) * (1 + fee / 100)).toFixed(2));

  const handleRecalculate = () => {
    const updated = products
      .filter((p) => p.costPrice > 0)
      .map((p) => ({ ...p, nomadBitePrice: Number((p.costPrice * (1 + fee / 100)).toFixed(2)) }));
    importProducts.mutate({ products: updated, replace: false });
  };

  return (
    <div className="space-y-5 max-w-xl">
      {/* Store name */}
      <Card>
        <CardHeader><CardTitle className="text-base font-bold">Store</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Store Name</Label>
            <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="NomadBite POS" />
          </div>
        </CardContent>
      </Card>

      {/* Service fee */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Percent className="h-4 w-4" style={{ color: 'var(--primary)' }} />
            Service Fee / Markup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Service Fee Percentage</Label>
            <div className="flex items-center gap-2">
              <Input type="number" min={0} max={100} step={0.5} value={feeInput} onChange={(e) => setFeeInput(e.target.value)} className="w-28 font-mono" />
              <span className="text-muted-foreground text-sm">%</span>
            </div>
            <p className="text-xs text-muted-foreground">Current active: <strong>{serviceFeePercent}%</strong></p>
          </div>

          {/* Live preview */}
          <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--muted)' }}>
            <p className="text-sm font-bold">Live Price Preview</p>
            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Cost Price (KES)</Label>
                <Input type="number" value={previewCost} onChange={(e) => setPreviewCost(e.target.value)} className="w-28 h-9 text-sm bg-card" />
              </div>
              <div className="pb-0.5 text-muted-foreground text-lg">→</div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>NomadBite Price</Label>
                <div
                  className="h-9 px-3 rounded-lg flex items-center font-black text-sm"
                  style={{ background: 'oklch(0.477 0.216 27.3 / 0.1)', color: 'var(--primary)' }}
                >
                  KES {previewSelling.toLocaleString()}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Service fee: KES {(Number(previewCost) * fee / 100).toFixed(2)}
            </p>
          </div>

          {/* Recalculate */}
          <div className="border rounded-xl p-4 space-y-3">
            <p className="text-sm font-bold">Apply to All Inventory</p>
            <p className="text-xs text-muted-foreground">
              Recalculate NomadBite prices for all {products.filter(p => p.costPrice > 0).length} items with a known cost price using {fee}%.
            </p>
            <button
              onClick={handleRecalculate}
              disabled={importProducts.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border font-semibold text-sm hover:bg-muted transition-colors disabled:opacity-60"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Recalculate All ({fee}%)
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Cloudinary */}
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
        {saved ? <><CheckCircle className="h-4 w-4" /> Saved to PostgreSQL</> : 'Save Settings'}
      </button>
    </div>
  );
}
