import { useState } from 'react';
import { usePinGateStore } from '../store/use-pin-gate-store';
import { api } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ShieldAlert, Delete, Loader2 } from 'lucide-react';

export function PinGate() {
  const { isOpen, resolve } = usePinGateStore();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async (currentPin: string) => {
    if (currentPin.length !== 4) return;
    setLoading(true);
    try {
      await api.users.verifyAdmin(currentPin);
      setPin('');
      setError('');
      resolve(true);
    } catch {
      setError('Wrong admin PIN.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleNumpad = (d: string) => {
    const next = pin.length < 4 ? pin + d : pin;
    setPin(next);
    setError('');
    if (next.length === 4) handleVerify(next);
  };

  const handleCancel = () => {
    setPin('');
    setError('');
    resolve(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleCancel(); }}>
      <DialogContent className="max-w-xs border-0 shadow-2xl">
        <DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center">
              <ShieldAlert className="h-6 w-6 text-amber-600" />
            </div>
            <div className="text-center">
              <DialogTitle className="font-black">Admin Required</DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">Enter the admin PIN to continue.</p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* PIN dots */}
          <div className="flex justify-center gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-4 w-4 rounded-full border-2 transition-all"
                style={{
                  borderColor: error ? 'var(--destructive)' : 'var(--primary)',
                  background: i < pin.length ? (error ? 'var(--destructive)' : 'var(--primary)') : 'transparent',
                }}
              />
            ))}
          </div>

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-2">
            {['1','2','3','4','5','6','7','8','9'].map((d) => (
              <button
                key={d}
                onClick={() => handleNumpad(d)}
                disabled={loading}
                className="h-11 rounded-xl border font-bold text-base hover:bg-muted transition-colors active:scale-95 disabled:opacity-50"
              >
                {d}
              </button>
            ))}
            <div />
            <button
              onClick={() => handleNumpad('0')}
              disabled={loading}
              className="h-11 rounded-xl border font-bold text-base hover:bg-muted transition-colors active:scale-95 disabled:opacity-50"
            >
              0
            </button>
            <button
              onClick={() => setPin((p) => p.slice(0, -1))}
              disabled={loading}
              className="h-11 rounded-xl border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Delete className="h-4 w-4 text-muted-foreground" />}
            </button>
          </div>

          {error && <p className="text-xs text-destructive text-center">{error}</p>}

          <button
            onClick={handleCancel}
            className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
