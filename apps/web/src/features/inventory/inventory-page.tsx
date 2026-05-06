import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { InventoryTable } from './components/inventory-table';
import { CsvUploadDialog } from './components/csv-upload-dialog';
import { Upload, AlertTriangle } from 'lucide-react';
import { useProducts } from '@/hooks/use-products';

export function InventoryPage() {
  const [csvOpen, setCsvOpen] = useState(false);
  const [showRecountOnly, setShowRecountOnly] = useState(false);
  const { data: products = [] } = useProducts();

  const recountItems = products.filter((p) => p.currentStock < 0);

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold">Inventory</h1>
          <p className="text-sm text-muted-foreground">Manage products and stock levels</p>
        </div>
        <div className="flex items-center gap-2">
          {recountItems.length > 0 && (
            <button
              onClick={() => setShowRecountOnly((v) => !v)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${
                showRecountOnly
                  ? 'bg-red-500/10 border-red-500/40 text-red-600'
                  : 'bg-card border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {recountItems.length} Requires Recount
            </button>
          )}
          <Button onClick={() => setCsvOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>
        </div>
      </div>

      {/* Recount alert banner */}
      {recountItems.length > 0 && showRecountOnly && (
        <div className="shrink-0 rounded-xl border border-red-500/30 bg-red-500/8 p-4">
          <p className="text-xs font-bold text-red-600 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Items with negative stock — physical recount required
          </p>
          <div className="flex flex-wrap gap-2">
            {recountItems.map((item) => (
              <span
                key={item.id}
                className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-500/10 text-red-700"
              >
                {item.name} ({item.currentStock})
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden flex flex-col">
        <InventoryTable recountFilter={showRecountOnly} />
      </div>

      <CsvUploadDialog open={csvOpen} onClose={() => setCsvOpen(false)} />
    </div>
  );
}
