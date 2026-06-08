import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiPO, ApiPODetail, ApiPOLineInput } from '@/lib/api';
import { useProducts } from '@/hooks/use-products';
import { Plus, ChevronRight, Truck, Check, X, Search, PackageCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  ORDERED: 'bg-blue-500/10 text-blue-700',
  PARTIAL: 'bg-amber-500/10 text-amber-700',
  RECEIVED: 'bg-green-500/10 text-green-700',
  CANCELLED: 'bg-red-500/10 text-red-600',
};

export function PurchaseOrdersPanel() {
  const qc = useQueryClient();
  const { data: products = [] } = useProducts();
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showReceive, setShowReceive] = useState(false);

  // Create form state
  const [refNo, setRefNo] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [expectedAt, setExpectedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<(ApiPOLineInput & { _search: string })[]>([]);
  const [lineSearch, setLineSearch] = useState('');

  // Receive state — per-line qty inputs
  const [receiveQtys, setReceiveQtys] = useState<Record<string, string>>({});

  const { data: pos = [], isLoading } = useQuery({
    queryKey: ['purchase-orders', statusFilter],
    queryFn: () => api.purchaseOrders.list(statusFilter || undefined),
  });

  const { data: detail } = useQuery({
    queryKey: ['purchase-order', selectedId],
    queryFn: () => api.purchaseOrders.get(selectedId!),
    enabled: !!selectedId,
  });

  const createMutation = useMutation({
    mutationFn: () => api.purchaseOrders.create({
      referenceNo: refNo || undefined,
      vendorName: vendorName || undefined,
      expectedAt: expectedAt || undefined,
      notes: notes || undefined,
      lines: lines.map(({ _search, ...l }) => l),
    }),
    onSuccess: (po) => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      setSelectedId(po.id);
      setShowCreate(false);
      resetCreateForm();
    },
  });

  const receiveMutation = useMutation({
    mutationFn: () => {
      const linePayload = Object.entries(receiveQtys)
        .filter(([, v]) => Number(v) > 0)
        .map(([lineId, qty]) => ({ lineId, receivedQty: Number(qty) }));
      return api.purchaseOrders.receive(selectedId!, linePayload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['purchase-order', selectedId] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setShowReceive(false);
      setReceiveQtys({});
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.purchaseOrders.update(id, { status: 'CANCELLED' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['purchase-order', selectedId] });
    },
  });

  const markOrderedMutation = useMutation({
    mutationFn: (id: string) => api.purchaseOrders.update(id, { status: 'ORDERED' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['purchase-order', selectedId] });
    },
  });

  const resetCreateForm = () => {
    setRefNo(''); setVendorName(''); setExpectedAt(''); setNotes(''); setLines([]); setLineSearch('');
  };

  const addLine = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    if (lines.find((l) => l.itemId === productId)) return;
    setLines((prev) => [...prev, { itemId: p.id, orderedQty: 1, unitCost: p.costPrice, _search: p.name }]);
    setLineSearch('');
  };

  const filteredSearch = lineSearch.trim()
    ? products.filter((p) => !lines.find((l) => l.itemId === p.id) && (p.name.toLowerCase().includes(lineSearch.toLowerCase()) || p.sku.toLowerCase().includes(lineSearch.toLowerCase()))).slice(0, 8)
    : [];

  const selectedPO = detail as ApiPODetail | undefined;
  const canReceive = selectedPO && ['ORDERED', 'PARTIAL'].includes(selectedPO.status);

  return (
    <div className="flex h-full overflow-hidden">
      {/* List panel */}
      <div className="w-80 border-r flex flex-col shrink-0">
        <div className="p-3 border-b space-y-2">
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {(['', 'DRAFT', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors"
                style={statusFilter === s ? { background: 'var(--primary)', color: 'var(--primary-foreground)', borderColor: 'var(--primary)' } : {}}
              >
                {s || 'All'}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold border hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" />
            New Purchase Order
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y">
          {isLoading && <p className="text-xs text-muted-foreground text-center py-8">Loading…</p>}
          {!isLoading && pos.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No purchase orders</p>}
          {pos.map((po) => (
            <button
              key={po.id}
              onClick={() => setSelectedId(po.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 text-left"
              style={selectedId === po.id ? { background: 'var(--muted)' } : {}}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{po.referenceNo || `PO-${po.id.slice(-6).toUpperCase()}`}</p>
                <p className="text-xs text-muted-foreground">{po.vendorName || 'No vendor'} · {po.lineCount} items · KES {po.totalCost.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">{new Date(po.createdAt).toLocaleDateString('en-KE', { dateStyle: 'medium' })}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_COLORS[po.status] ?? ''}`}>{po.status}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selectedId && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <PackageCheck className="h-12 w-12 mb-3 opacity-20" />
            <p className="text-sm">Select a purchase order to view details</p>
          </div>
        )}

        {selectedPO && (
          <div className="max-w-2xl space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-black">{selectedPO.referenceNo || `PO-${selectedPO.id.slice(-6).toUpperCase()}`}</h2>
                {selectedPO.vendorName && <p className="text-sm text-muted-foreground">{selectedPO.vendorName}</p>}
                {selectedPO.expectedAt && (
                  <p className="text-xs text-muted-foreground">
                    Expected: {new Date(selectedPO.expectedAt).toLocaleDateString('en-KE', { dateStyle: 'medium' })}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_COLORS[selectedPO.status] ?? ''}`}>{selectedPO.status}</span>
                {selectedPO.status === 'DRAFT' && (
                  <button
                    onClick={() => markOrderedMutation.mutate(selectedPO.id)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border hover:bg-muted"
                  >
                    Mark Ordered
                  </button>
                )}
                {canReceive && (
                  <button
                    onClick={() => { setShowReceive(true); setReceiveQtys({}); }}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                    style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                  >
                    <Truck className="h-3.5 w-3.5" />
                    Receive
                  </button>
                )}
                {['DRAFT', 'ORDERED'].includes(selectedPO.status) && (
                  <button
                    onClick={() => cancelMutation.mutate(selectedPO.id)}
                    className="text-xs font-semibold px-2 py-1.5 rounded-lg border border-red-500/30 text-red-600 hover:bg-red-500/5"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {selectedPO.notes && (
              <p className="text-sm text-muted-foreground bg-muted/40 rounded-xl px-4 py-2">{selectedPO.notes}</p>
            )}

            {/* Lines */}
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                    <th className="text-left p-3 font-semibold text-muted-foreground">Item</th>
                    <th className="text-right p-3 font-semibold text-muted-foreground">Unit Cost</th>
                    <th className="text-right p-3 font-semibold text-muted-foreground">Ordered</th>
                    <th className="text-right p-3 font-semibold text-muted-foreground">Received</th>
                    <th className="text-right p-3 font-semibold text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedPO.lines.map((line) => {
                    const ordered = Number(line.orderedQty);
                    const received = Number(line.receivedQty);
                    const pct = ordered > 0 ? received / ordered : 0;
                    return (
                      <tr key={line.id} className="hover:bg-muted/30">
                        <td className="p-3">
                          <p className="font-semibold">{line.item.name}</p>
                          <p className="text-muted-foreground font-mono text-[10px]">{line.item.sku}</p>
                        </td>
                        <td className="p-3 text-right text-muted-foreground">{Number(line.unitCost).toLocaleString()}</td>
                        <td className="p-3 text-right">{ordered.toLocaleString()}</td>
                        <td className="p-3 text-right">
                          <span className={received >= ordered ? 'text-green-600 font-bold' : received > 0 ? 'text-amber-600 font-semibold' : 'text-muted-foreground'}>
                            {received.toLocaleString()}
                          </span>
                          {ordered > 0 && (
                            <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden w-16 ml-auto">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct * 100)}%`, background: pct >= 1 ? '#22c55e' : 'var(--primary)' }} />
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-right font-semibold">{(Number(line.unitCost) * ordered).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--muted)', borderTop: '1px solid var(--border)' }}>
                    <td colSpan={4} className="p-3 text-right font-bold text-sm">Total</td>
                    <td className="p-3 text-right font-black text-sm">
                      KES {selectedPO.lines.reduce((s, l) => s + Number(l.unitCost) * Number(l.orderedQty), 0).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create PO dialog */}
      <Dialog open={showCreate} onOpenChange={(v) => { if (!v) { setShowCreate(false); resetCreateForm(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-black">New Purchase Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Reference No.</p>
                <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="PO-2026-001" value={refNo} onChange={(e) => setRefNo(e.target.value)} />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Wholesale / Supplier</p>
                <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Supplier name" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Expected Delivery</p>
              <input type="date" className="w-full rounded-xl border px-3 py-2 text-sm" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Notes</p>
              <textarea className="w-full rounded-xl border px-3 py-2 text-sm" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {/* Item search */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Items</p>
              <div className="relative">
                <div className="flex items-center gap-2 rounded-xl border px-3 py-2">
                  <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <input
                    className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
                    placeholder="Search items to add…"
                    value={lineSearch}
                    onChange={(e) => setLineSearch(e.target.value)}
                  />
                </div>
                {filteredSearch.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 rounded-xl border bg-background shadow-lg max-h-40 overflow-y-auto">
                    {filteredSearch.map((p) => (
                      <button key={p.id} onClick={() => addLine(p.id)} className="w-full text-left px-3 py-2 hover:bg-muted text-xs">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-muted-foreground ml-2">{p.sku} · KES {p.costPrice.toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {lines.length > 0 && (
                <div className="mt-2 rounded-xl border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                        <th className="text-left p-2 font-semibold text-muted-foreground">Item</th>
                        <th className="text-right p-2 font-semibold text-muted-foreground">Qty</th>
                        <th className="text-right p-2 font-semibold text-muted-foreground">Unit Cost</th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lines.map((line, i) => (
                        <tr key={line.itemId}>
                          <td className="p-2 font-medium">{line._search}</td>
                          <td className="p-2">
                            <input
                              type="number" min="0.001" step="any"
                              className="w-16 text-right rounded border px-1.5 py-0.5 text-xs ml-auto block"
                              value={line.orderedQty}
                              onChange={(e) => setLines((prev) => prev.map((l, j) => j === i ? { ...l, orderedQty: Number(e.target.value) } : l))}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number" min="0" step="any"
                              className="w-20 text-right rounded border px-1.5 py-0.5 text-xs ml-auto block"
                              value={line.unitCost}
                              onChange={(e) => setLines((prev) => prev.map((l, j) => j === i ? { ...l, unitCost: Number(e.target.value) } : l))}
                            />
                          </td>
                          <td className="p-2 text-center">
                            <button onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}>
                              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <button
              onClick={() => createMutation.mutate()}
              disabled={lines.length === 0 || createMutation.isPending}
              className="w-full py-2.5 rounded-xl font-bold text-sm disabled:opacity-60"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              {createMutation.isPending ? 'Creating…' : 'Create Purchase Order'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receive dialog */}
      {showReceive && selectedPO && (
        <Dialog open={showReceive} onOpenChange={(v) => !v && setShowReceive(false)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-black">Receive Stock</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              <p className="text-xs text-muted-foreground">Enter quantities received for each line. Leave blank to skip a line.</p>
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                      <th className="text-left p-3 font-semibold text-muted-foreground">Item</th>
                      <th className="text-right p-3 font-semibold text-muted-foreground">Remaining</th>
                      <th className="text-right p-3 font-semibold text-muted-foreground">Receive Now</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {selectedPO.lines.filter((l) => Number(l.receivedQty) < Number(l.orderedQty)).map((line) => {
                      const remaining = Number(line.orderedQty) - Number(line.receivedQty);
                      return (
                        <tr key={line.id}>
                          <td className="p-3 font-semibold">{line.item.name}</td>
                          <td className="p-3 text-right text-muted-foreground">{remaining.toLocaleString()}</td>
                          <td className="p-3">
                            <input
                              type="number" min="0" max={remaining} step="any"
                              placeholder={String(remaining)}
                              className="w-20 text-right rounded-lg border px-2 py-1 text-xs ml-auto block"
                              value={receiveQtys[line.id] ?? ''}
                              onChange={(e) => setReceiveQtys((prev) => ({ ...prev, [line.id]: e.target.value }))}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button
                onClick={() => receiveMutation.mutate()}
                disabled={receiveMutation.isPending || Object.values(receiveQtys).every((v) => !v || Number(v) <= 0)}
                className="w-full py-2.5 rounded-xl font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                <Check className="h-4 w-4" />
                {receiveMutation.isPending ? 'Processing…' : 'Confirm Receipt'}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
