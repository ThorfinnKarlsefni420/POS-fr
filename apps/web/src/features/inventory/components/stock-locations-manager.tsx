import { useState } from 'react';
import { useLocations, useCreateLocation, useUpdateLocation, useDeactivateLocation } from '@/hooks/use-locations';
import { useTransfers } from '@/hooks/use-locations';
import type { LocationType, StockLocation } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Pencil, Warehouse, ShoppingBag, Monitor, ArrowRightLeft, MoreHorizontal, History } from 'lucide-react';

const LOCATION_TYPES: { value: LocationType; label: string; icon: typeof Warehouse }[] = [
  { value: 'WAREHOUSE', label: 'Warehouse / Storeroom', icon: Warehouse },
  { value: 'SHELF', label: 'Floor Shelf', icon: ShoppingBag },
  { value: 'DISPLAY', label: 'Display / Fridge', icon: Monitor },
  { value: 'TRANSIT', label: 'In Transit', icon: ArrowRightLeft },
  { value: 'OTHER', label: 'Other', icon: MoreHorizontal },
];

const TYPE_COLORS: Record<LocationType, { bg: string; text: string }> = {
  WAREHOUSE: { bg: 'oklch(0.5 0.15 240 / 0.12)', text: 'oklch(0.4 0.15 240)' },
  SHELF:     { bg: 'oklch(0.5 0.15 145 / 0.12)', text: 'oklch(0.4 0.15 145)' },
  DISPLAY:   { bg: 'oklch(0.75 0.15 60 / 0.15)',  text: 'oklch(0.55 0.15 60)' },
  TRANSIT:   { bg: 'oklch(0.477 0.216 27.3 / 0.12)', text: 'var(--primary)' },
  OTHER:     { bg: 'var(--muted)', text: 'var(--muted-foreground)' },
};

function LocationTypeIcon({ type }: { type: LocationType }) {
  const entry = LOCATION_TYPES.find((t) => t.value === type);
  const Icon = entry?.icon ?? MoreHorizontal;
  return <Icon className="h-4 w-4" />;
}

interface LocationFormProps {
  initial?: Partial<StockLocation>;
  onSave: (data: { name: string; type: LocationType; description?: string }) => void;
  onCancel: () => void;
  saving: boolean;
}

function LocationForm({ initial, onSave, onCancel, saving }: LocationFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<LocationType>(initial?.type ?? 'WAREHOUSE');
  const [description, setDescription] = useState(initial?.description ?? '');

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Name <span className="text-destructive">*</span></Label>
        <Input
          placeholder="e.g. Main Warehouse, Floor Shelf A, Cold Storage"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Type</Label>
        <div className="grid grid-cols-1 gap-1.5">
          {LOCATION_TYPES.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm text-left transition-all ${
                  type === t.value
                    ? 'border-primary bg-primary/8 font-semibold'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Description (optional)</Label>
        <Input
          placeholder="e.g. Back room next to loading dock"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg border font-semibold text-sm hover:bg-muted">
          Cancel
        </button>
        <button
          onClick={() => onSave({ name, type, description: description || undefined })}
          disabled={saving || !name.trim()}
          className="flex-1 py-2.5 rounded-lg font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Location
        </button>
      </div>
    </div>
  );
}

export function StockLocationsManager() {
  const { data: locations = [], isLoading } = useLocations();
  const { data: recentTransfers = [] } = useTransfers();
  const createLocation = useCreateLocation();
  const updateLocation = useUpdateLocation();
  const deactivateLocation = useDeactivateLocation();

  const [addOpen, setAddOpen] = useState(false);
  const [editLocation, setEditLocation] = useState<StockLocation | null>(null);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const active = locations.filter((l) => l.isActive);
  const inactive = locations.filter((l) => !l.isActive);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading locations…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-lg">Stock Locations</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define physical storage areas — warehouse, shelf, display fridge — and track stock per location.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${
              showHistory ? 'bg-primary/10 border-primary text-primary' : 'hover:bg-muted'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            History
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Location
          </button>
        </div>
      </div>

      {/* Empty state */}
      {active.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground space-y-2">
          <Warehouse className="h-10 w-10 mx-auto opacity-20" />
          <p className="text-sm font-semibold">No locations yet</p>
          <p className="text-xs">Create a Warehouse and a Shelf to start tracking stock per location.</p>
          <button
            onClick={() => setAddOpen(true)}
            className="mt-2 px-4 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add First Location
          </button>
        </div>
      )}

      {/* Active locations grid */}
      {active.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {active.map((loc) => {
            const colors = TYPE_COLORS[loc.type];
            return (
              <div key={loc.id} className="rounded-xl border bg-card p-4 space-y-3 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: colors.bg, color: colors.text }}>
                      <LocationTypeIcon type={loc.type} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">{loc.name}</p>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ background: colors.bg, color: colors.text }}>
                        {LOCATION_TYPES.find((t) => t.value === loc.type)?.label ?? loc.type}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditLocation(loc)}
                    className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>

                {loc.description && (
                  <p className="text-xs text-muted-foreground">{loc.description}</p>
                )}

                <div className="grid grid-cols-2 gap-2 pt-1 border-t">
                  <div>
                    <p className="text-xs text-muted-foreground">SKUs tracked</p>
                    <p className="text-sm font-bold">{loc.itemCount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total units</p>
                    <p className="text-sm font-bold">{Number(loc.totalUnits).toLocaleString()}</p>
                  </div>
                </div>

                <button
                  onClick={() => setDeactivateId(loc.id)}
                  className="w-full text-xs text-muted-foreground hover:text-destructive transition-colors text-left"
                >
                  Deactivate location
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Inactive locations */}
      {inactive.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Inactive Locations</p>
          <div className="flex flex-wrap gap-2">
            {inactive.map((loc) => (
              <div key={loc.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed bg-muted/30 text-sm text-muted-foreground">
                <span>{loc.name}</span>
                <button
                  onClick={() => updateLocation.mutate({ id: loc.id, data: { isActive: true } })}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transfer history */}
      {showHistory && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent Transfers</p>
          {recentTransfers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No transfers yet.</p>
          ) : (
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--muted)' }} className="border-b">
                    <th className="p-3 text-left font-semibold text-muted-foreground">Item</th>
                    <th className="p-3 text-left font-semibold text-muted-foreground">From</th>
                    <th className="p-3 text-left font-semibold text-muted-foreground">To</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">Qty</th>
                    <th className="p-3 text-left font-semibold text-muted-foreground">Reason</th>
                    <th className="p-3 text-left font-semibold text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransfers.map((t) => (
                    <tr key={t.id} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="p-3 font-semibold">{t.itemName}</td>
                      <td className="p-3 text-muted-foreground">{t.from}</td>
                      <td className="p-3 text-muted-foreground">{t.to}</td>
                      <td className="p-3 text-right font-mono">
                        {t.tierName && t.quantityInTier != null
                          ? `${t.quantityInTier} ${t.tierName}(s)`
                          : t.quantityBase}
                        {' '}
                        <span className="text-muted-foreground">pcs</span>
                      </td>
                      <td className="p-3 text-muted-foreground">{t.reason ?? '—'}</td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(t.createdAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add location dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-black">Add Location</DialogTitle></DialogHeader>
          <LocationForm
            onSave={async (data) => {
              await createLocation.mutateAsync(data);
              setAddOpen(false);
            }}
            onCancel={() => setAddOpen(false)}
            saving={createLocation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit location dialog */}
      <Dialog open={!!editLocation} onOpenChange={() => setEditLocation(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-black">Edit Location</DialogTitle></DialogHeader>
          {editLocation && (
            <LocationForm
              initial={editLocation}
              onSave={async (data) => {
                await updateLocation.mutateAsync({ id: editLocation.id, data });
                setEditLocation(null);
              }}
              onCancel={() => setEditLocation(null)}
              saving={updateLocation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Deactivate confirm */}
      <Dialog open={!!deactivateId} onOpenChange={() => setDeactivateId(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle className="font-black">Deactivate Location</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This location will be hidden from transfer menus. Any stock tracked here will remain visible in reports. You can restore it later.
          </p>
          <p className="text-xs text-muted-foreground">
            If this location still has stock, deactivation will be blocked. Transfer or write off that stock first.
          </p>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setDeactivateId(null)} className="flex-1 py-2.5 rounded-lg border font-semibold text-sm hover:bg-muted">
              Cancel
            </button>
            <button
              onClick={async () => {
                try {
                  await deactivateLocation.mutateAsync(deactivateId!);
                  setDeactivateId(null);
                } catch (e) {
                  alert((e as Error).message);
                }
              }}
              disabled={deactivateLocation.isPending}
              className="flex-1 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              {deactivateLocation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Deactivate
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
