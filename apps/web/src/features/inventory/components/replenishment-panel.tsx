import { useState } from 'react';
import { useReplenishmentAlerts } from '@/hooks/use-locations';
import { StockTransferDialog } from './stock-transfer-dialog';
import type { ReplenishmentAlert } from '@/lib/api';
import { Loader2, ArrowRightLeft, Warehouse, CheckCircle } from 'lucide-react';

export function ReplenishmentPanel() {
  const { data: alerts = [], isLoading, refetch } = useReplenishmentAlerts();
  const [transferItem, setTransferItem] = useState<ReplenishmentAlert | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking shelf stock…
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center space-y-2 text-muted-foreground">
        <CheckCircle className="h-8 w-8 mx-auto opacity-20" />
        <p className="text-sm font-semibold">All shelves are adequately stocked</p>
        <p className="text-xs">Items will appear here when shelf stock falls below 20% of available warehouse stock.</p>
      </div>
    );
  }

  return (
    <>
      <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--muted)' }} className="border-b">
              <th className="p-3 text-left font-semibold text-muted-foreground">Item</th>
              <th className="p-3 text-right font-semibold text-muted-foreground">
                <div className="flex items-center justify-end gap-1">
                  <Warehouse className="h-3 w-3" />
                  Warehouse
                </div>
              </th>
              <th className="p-3 text-right font-semibold text-muted-foreground">Shelf / Display</th>
              <th className="p-3 text-left font-semibold text-muted-foreground">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => {
              const isEmpty = alert.shelfQty === 0;
              return (
                <tr key={alert.itemId} className="border-b border-border/40 hover:bg-muted/20">
                  <td className="p-3">
                    <p className="font-semibold">{alert.itemName}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{alert.itemSku}</p>
                    {alert.warehouseLocations.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {alert.warehouseLocations.map((l) => l.name).join(', ')}
                      </p>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <span className="font-mono font-semibold text-sm">
                      {alert.warehouseQty.toLocaleString()}
                    </span>
                    <span className="text-muted-foreground ml-1">pcs</span>
                  </td>
                  <td className="p-3 text-right">
                    <span
                      className="font-mono font-semibold text-sm"
                      style={{ color: isEmpty ? 'var(--primary)' : 'oklch(0.55 0.15 60)' }}
                    >
                      {alert.shelfQty.toLocaleString()}
                    </span>
                    <span className="text-muted-foreground ml-1">pcs</span>
                  </td>
                  <td className="p-3">
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={
                        isEmpty
                          ? { background: 'oklch(0.477 0.216 27.3 / 0.12)', color: 'var(--primary)' }
                          : { background: 'oklch(0.75 0.15 60 / 0.15)', color: 'oklch(0.55 0.15 60)' }
                      }
                    >
                      {isEmpty ? 'Empty shelf' : 'Low shelf'}
                    </span>
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => setTransferItem(alert)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap"
                      style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                    >
                      <ArrowRightLeft className="h-3 w-3" />
                      Replenish
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {transferItem && (
        <StockTransferDialog
          itemId={transferItem.itemId}
          itemName={transferItem.itemName}
          packagingTiers={transferItem.packagingTiers as never}
          onClose={() => {
            setTransferItem(null);
            refetch();
          }}
        />
      )}
    </>
  );
}
