import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/features/auth/store/use-auth-store';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowDownCircle, ArrowUpCircle, LogOut, Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ShiftPanel({ open, onClose }: Props) {
  const { user, shiftId, setShiftId, logout } = useAuthStore();
  const qc = useQueryClient();

  const [cashLogOpen, setCashLogOpen] = useState<'PAY_IN' | 'PAY_OUT' | null>(null);
  const [cashAmount, setCashAmount] = useState('');
  const [cashReason, setCashReason] = useState('');
  const [closeOpen, setCloseOpen] = useState(false);
  const [actualCash, setActualCash] = useState('');
  const [closeResult, setCloseResult] = useState<{ expectedCash: number; variance: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: shift, refetch } = useQuery({
    queryKey: ['shift', shiftId],
    queryFn: () => (shiftId ? api.shifts.current(user?.id) : Promise.resolve(null)),
    enabled: open && !!shiftId,
    staleTime: 5_000,
  });

  const cashLogs = shift?.cashLogs ?? [];
  const payIns = cashLogs.filter((l: { type: string }) => l.type === 'PAY_IN').reduce((s: number, l: { amount: string | number }) => s + Number(l.amount), 0);
  const payOuts = cashLogs.filter((l: { type: string }) => l.type === 'PAY_OUT').reduce((s: number, l: { amount: string | number }) => s + Number(l.amount), 0);

  const handleCashLog = async () => {
    if (!shiftId || !cashLogOpen || !cashAmount) return;
    setSubmitting(true);
    try {
      await api.shifts.addCashLog(shiftId, {
        amount: Number(cashAmount),
        type: cashLogOpen,
        reason: cashReason || (cashLogOpen === 'PAY_IN' ? 'Pay In' : 'Pay Out'),
      });
      setCashAmount('');
      setCashReason('');
      setCashLogOpen(null);
      refetch();
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseShift = async () => {
    if (!shiftId || actualCash === '') return;
    setSubmitting(true);
    try {
      const result = await api.shifts.close(shiftId, Number(actualCash));
      setCloseResult(result as { expectedCash: number; variance: number });
      setShiftId(null);
      qc.invalidateQueries({ queryKey: ['shift'] });
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    logout();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm border-0 shadow-2xl">
        {closeResult ? (
          <div className="space-y-4 py-2">
            <DialogHeader>
              <DialogTitle className="font-black">Shift Closed</DialogTitle>
            </DialogHeader>
            <div className="rounded-xl bg-muted p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected cash</span>
                <span className="font-bold">KES {closeResult.expectedCash.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Actual cash</span>
                <span className="font-bold">KES {Number(actualCash).toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">Variance</span>
                <span className={`font-black ${closeResult.variance < 0 ? 'text-destructive' : 'text-green-600'}`}>
                  {closeResult.variance >= 0 ? '+' : ''}KES {closeResult.variance.toLocaleString()}
                </span>
              </div>
            </div>
            <button
              onClick={() => { setCloseResult(null); handleLogout(); }}
              className="w-full py-3 rounded-xl font-bold text-sm"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              Done — Log Out
            </button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-black">Shift Management</DialogTitle>
              {shift && (
                <p className="text-xs text-muted-foreground mt-1">
                  Started {new Date(shift.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' · '}Starting cash: KES {Number(shift.startingCash).toLocaleString()}
                </p>
              )}
            </DialogHeader>

            <div className="space-y-4">
              {/* Cash summary */}
              <div className="rounded-xl bg-muted p-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Pay-ins</p>
                  <p className="font-bold text-green-600">+KES {payIns.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pay-outs</p>
                  <p className="font-bold text-destructive">-KES {payOuts.toLocaleString()}</p>
                </div>
              </div>

              {/* Cash log history */}
              {cashLogs.length > 0 && (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {cashLogs.map((log: { id: string; type: string; amount: string | number; reason: string; createdAt: string }) => (
                    <div key={log.id} className="flex items-center justify-between text-xs px-1">
                      <div className="flex items-center gap-1.5">
                        {log.type === 'PAY_IN'
                          ? <ArrowDownCircle className="h-3.5 w-3.5 text-green-600" />
                          : <ArrowUpCircle className="h-3.5 w-3.5 text-destructive" />}
                        <span className="text-muted-foreground">{log.reason}</span>
                      </div>
                      <span className={`font-semibold ${log.type === 'PAY_IN' ? 'text-green-600' : 'text-destructive'}`}>
                        {log.type === 'PAY_IN' ? '+' : '-'}KES {Number(log.amount).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Cash log form */}
              {cashLogOpen && (
                <div className="rounded-xl border p-3 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {cashLogOpen === 'PAY_IN' ? 'Pay In' : 'Pay Out'}
                  </p>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Amount (KES)</Label>
                    <Input type="number" placeholder="0" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} autoFocus />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Reason</Label>
                    <Input placeholder="e.g. Bought supplies" value={cashReason} onChange={(e) => setCashReason(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setCashLogOpen(null)} className="flex-1 py-2 rounded-lg border text-xs font-semibold hover:bg-muted">
                      Cancel
                    </button>
                    <button
                      onClick={handleCashLog}
                      disabled={submitting || !cashAmount}
                      className="flex-1 py-2 rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1"
                      style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                    >
                      {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Confirm
                    </button>
                  </div>
                </div>
              )}

              {/* Close shift form */}
              {closeOpen && (
                <div className="rounded-xl border p-3 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Count Drawer & Close</p>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Actual Cash in Drawer (KES)</Label>
                    <Input type="number" placeholder="0" value={actualCash} onChange={(e) => setActualCash(e.target.value)} autoFocus />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setCloseOpen(false)} className="flex-1 py-2 rounded-lg border text-xs font-semibold hover:bg-muted">
                      Cancel
                    </button>
                    <button
                      onClick={handleCloseShift}
                      disabled={submitting || actualCash === ''}
                      className="flex-1 py-2 rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1 bg-destructive text-destructive-foreground"
                    >
                      {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Close Shift
                    </button>
                  </div>
                </div>
              )}

              {/* Actions */}
              {!cashLogOpen && !closeOpen && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setCashLogOpen('PAY_IN')}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-bold hover:bg-muted transition-colors"
                  >
                    <ArrowDownCircle className="h-4 w-4 text-green-600" />
                    Pay In
                  </button>
                  <button
                    onClick={() => setCashLogOpen('PAY_OUT')}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-bold hover:bg-muted transition-colors"
                  >
                    <ArrowUpCircle className="h-4 w-4 text-destructive" />
                    Pay Out
                  </button>
                </div>
              )}

              {!cashLogOpen && !closeOpen && (
                <div className="flex gap-2 pt-1 border-t">
                  <button
                    onClick={() => setCloseOpen(true)}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-colors"
                  >
                    End Shift
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-muted-foreground border hover:bg-muted transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Log Out
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
