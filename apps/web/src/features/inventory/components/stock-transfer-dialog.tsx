import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowRight, PackageOpen, Trash2 } from 'lucide-react';
import { useLocations, useTransferStock, useItemStock } from '@/hooks/use-locations';
import type { PackagingTier } from '@/types/pos';

interface Props {
  itemId: string;
  itemName: string;
  packagingTiers?: PackagingTier[];
  onClose: () => void;
}

export function StockTransferDialog({ itemId, itemName, packagingTiers = [], onClose }: Props) {
  const { data: locations = [] } = useLocations();
  const { data: stockBreakdown } = useItemStock(itemId);
  const transfer = useTransferStock(itemId);

  const activeLocations = locations.filter((l) => l.isActive);

  const [fromType, setFromType] = useState<'location' | 'supplier'>('supplier');
  const [toType, setToType] = useState<'location' | 'dispose'>('location');
  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [tierId, setTierId] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const selectedTier = packagingTiers.find((t) => t.id === tierId);
  const baseQty = selectedTier ? Number(quantity || 0) * selectedTier.quantityInBase : Number(quantity || 0);

  // Stock at source location for validation display
  const sourceStock = fromType === 'location' && fromLocationId
    ? stockBreakdown?.locations.find((l) => l.locationId === fromLocationId)?.quantity ?? 0
    : null;

  const isValid =
    Number(quantity) > 0 &&
    (fromType === 'supplier' || fromLocationId) &&
    (toType === 'dispose' || toLocationId) &&
    (fromType === 'location' ? fromLocationId !== toLocationId : true);

  const handleSubmit = async () => {
    try {
      await transfer.mutateAsync({
        fromLocationId: fromType === 'supplier' ? null : fromLocationId,
        toLocationId: toType === 'dispose' ? null : toLocationId,
        quantity: Number(quantity),
        tierId: tierId || undefined,
        reason: reason || undefined,
        notes: notes || undefined,
      });
      onClose();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const actionLabel =
    fromType === 'supplier' ? 'Receive from Supplier'
    : toType === 'dispose' ? 'Write Off / Dispose'
    : 'Transfer Stock';

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-black">{actionLabel}</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{itemName}</p>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* From */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">From</Label>
            <div className="flex gap-1.5 mb-1.5">
              <button
                onClick={() => setFromType('supplier')}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                  fromType === 'supplier' ? 'bg-primary/10 border-primary text-primary' : 'hover:bg-muted'
                }`}
              >
                Supplier
              </button>
              <button
                onClick={() => setFromType('location')}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                  fromType === 'location' ? 'bg-primary/10 border-primary text-primary' : 'hover:bg-muted'
                }`}
              >
                Location
              </button>
            </div>
            {fromType === 'location' && (
              <select
                value={fromLocationId}
                onChange={(e) => setFromLocationId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select source location…</option>
                {activeLocations.map((loc) => {
                  const locStock = stockBreakdown?.locations.find((l) => l.locationId === loc.id);
                  return (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} {locStock ? `(${Number(locStock.quantity).toLocaleString()} pcs)` : '(0 pcs)'}
                    </option>
                  );
                })}
              </select>
            )}
            {fromType === 'location' && sourceStock !== null && (
              <p className="text-[10px] text-muted-foreground">
                Available at source: <strong>{Number(sourceStock).toLocaleString()} base units</strong>
              </p>
            )}
          </div>

          {/* Arrow */}
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <div className="flex-1 h-px bg-border" />
            <ArrowRight className="h-4 w-4 shrink-0" />
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* To */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">To</Label>
            <div className="flex gap-1.5 mb-1.5">
              <button
                onClick={() => setToType('location')}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                  toType === 'location' ? 'bg-primary/10 border-primary text-primary' : 'hover:bg-muted'
                }`}
              >
                Location
              </button>
              <button
                onClick={() => setToType('dispose')}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                  toType === 'dispose' ? 'bg-destructive/10 border-destructive/40 text-destructive' : 'hover:bg-muted'
                }`}
              >
                Write Off
              </button>
            </div>
            {toType === 'location' && (
              <select
                value={toLocationId}
                onChange={(e) => setToLocationId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select destination location…</option>
                {activeLocations
                  .filter((loc) => fromType !== 'location' || loc.id !== fromLocationId)
                  .map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
              </select>
            )}
            {toType === 'dispose' && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                Stock will be removed from inventory permanently.
              </div>
            )}
          </div>

          {/* Quantity + tier */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Quantity</Label>
            {packagingTiers.length > 0 && (
              <select
                value={tierId}
                onChange={(e) => setTierId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm mb-1.5"
              >
                <option value="">Base units (pieces)</option>
                {packagingTiers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({Number(t.quantityInBase).toLocaleString()} pcs each)
                  </option>
                ))}
              </select>
            )}
            <Input
              type="number"
              min="0.001"
              step="1"
              placeholder="e.g. 5"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            {selectedTier && Number(quantity) > 0 && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <PackageOpen className="h-3 w-3" />
                {Number(quantity)} {selectedTier.name}(s) = <strong>{baseQty.toLocaleString()} base units</strong>
              </p>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Reason</Label>
            <Input
              placeholder="e.g. Shelf replenishment, Morning restock…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Notes (optional)</Label>
            <Input
              placeholder="Additional details"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border font-semibold text-sm hover:bg-muted">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!isValid || transfer.isPending}
              className="flex-1 py-2.5 rounded-lg font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              {transfer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {actionLabel}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
