import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, VatPendingItem } from '@/lib/api';

const VAT_CLASSES = [
  { id: 'vatcls_standard', label: 'Standard 16%', code: 'VAT',         short: '[V]', color: 'oklch(0.55 0.2 25)' },
  { id: 'vatcls_zero',     label: 'Zero-Rated',   code: 'ZERO',        short: '[Z]', color: 'oklch(0.45 0.14 145)' },
  { id: 'vatcls_exempt',   label: 'Exempt',        code: 'NONTAXABLE', short: '[E]', color: 'oklch(0.45 0.05 240)' },
];

function EtimsTag({ code }: { code: string }) {
  const vc = VAT_CLASSES.find((v) => v.code === code);
  if (!vc) return null;
  return (
    <span
      className="text-[10px] font-bold px-1.5 py-0.5 rounded border"
      style={{ color: vc.color, borderColor: `${vc.color}55`, background: `${vc.color}10` }}
    >
      {vc.short} {vc.label}
    </span>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function VatConfirmDialog({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['vat-pending'],
    queryFn: () => api.products.vatPending(),
    enabled: open,
  });

  const visible = items.filter((i) => !confirmed.has(i.id));

  const handleConfirm = async (item: VatPendingItem, vatClassId: string, label: string) => {
    setConfirming(item.id);
    const reason = vatClassId === item.suggestedVatClassId
      ? `Confirmed: ${label} — ${item.flagReason}`
      : `Manual override: ${label}`;
    try {
      await api.products.confirmVatClass(item.id, vatClassId, reason);
      setConfirmed((prev) => new Set([...prev, item.id]));
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['vat-pending'] });
    } finally {
      setConfirming(null);
    }
  };

  const allDone = visible.length === 0 && (items.length > 0 || confirmed.size > 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-black">
            <ShieldCheck className="h-5 w-5" style={{ color: 'var(--primary)' }} />
            VAT Classification Review
          </DialogTitle>
          <p className="text-xs text-muted-foreground pt-0.5">
            These items need a manual VAT class confirmation before the system can correctly charge KRA VAT on sales.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {isLoading && (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          )}

          {allDone && (
            <div className="flex flex-col items-center gap-3 py-10">
              <CheckCircle className="h-12 w-12" style={{ color: 'oklch(0.45 0.14 145)' }} />
              <p className="font-semibold text-sm">All items classified</p>
              <p className="text-xs text-muted-foreground">KRA VAT will now apply correctly on every sale.</p>
            </div>
          )}

          {visible.map((item) => {
            const isProcessing = confirming === item.id;
            return (
              <div key={item.id} className="rounded-xl border bg-card p-4 space-y-3">
                {/* Item header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.category} · {item.unit}</p>
                  </div>
                  <EtimsTag code={item.currentEtimsCode} />
                </div>

                {/* Flag reason */}
                <div className="flex items-start gap-2 rounded-lg p-2.5 text-xs"
                  style={{ background: 'oklch(0.65 0.15 50 / 0.07)', borderLeft: '3px solid oklch(0.65 0.15 50 / 0.6)' }}>
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: 'oklch(0.55 0.18 50)' }} />
                  <span className="text-muted-foreground">{item.flagReason}</span>
                </div>

                {/* Confirm buttons */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Confirm as:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {VAT_CLASSES.map((vc) => {
                      const isSuggested = vc.id === item.suggestedVatClassId;
                      return (
                        <button
                          key={vc.id}
                          disabled={isProcessing}
                          onClick={() => handleConfirm(item, vc.id, vc.label)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all disabled:opacity-50"
                          style={isSuggested
                            ? { borderColor: vc.color, color: vc.color, background: `${vc.color}12` }
                            : { borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
                        >
                          {isProcessing && <Loader2 className="h-3 w-3 animate-spin" />}
                          {vc.short} {vc.label}
                          {isSuggested && <span className="text-[9px] opacity-70 ml-0.5">suggested</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {!allDone && !isLoading && visible.length > 0 && (
          <p className="text-[10px] text-muted-foreground text-center pt-2 border-t shrink-0">
            {visible.length} item{visible.length !== 1 ? 's' : ''} remaining · Classifications are saved immediately
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
