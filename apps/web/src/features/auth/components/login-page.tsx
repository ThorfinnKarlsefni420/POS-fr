import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore, AuthUser } from '../store/use-auth-store';
import { Store, Delete, Loader2 } from 'lucide-react';
import { useSettingsStore } from '@/features/admin/store/use-settings-store';

interface UserCard {
  id: string;
  name: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'CASHIER';
}

export function LoginPage() {
  const { setUser, setShiftId } = useAuthStore();
  const storeName = useSettingsStore((s) => s.storeName);

  const [users, setUsers] = useState<UserCard[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserCard | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [startingShift, setStartingShift] = useState(false);
  const [startingCashInput, setStartingCashInput] = useState('');
  const [needsShift, setNeedsShift] = useState(false);
  const [pendingUser, setPendingUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.users.list();
        // Seed a default admin if none exist yet
        if (list.length === 0) {
          await api.users.create({ name: 'Admin', pin: '0000', role: 'ADMIN' });
          setUsers([{ id: 'seed', name: 'Admin', role: 'ADMIN' }]);
        } else {
          setUsers(list as UserCard[]);
        }
      } catch {
        setError('Cannot reach API — is the server running?');
      } finally {
        setLoadingUsers(false);
      }
    })();
  }, []);

  const numpad = (d: string) => {
    if (pin.length < 4) setPin((p) => p + d);
    setError('');
  };
  const backspace = () => setPin((p) => p.slice(0, -1));

  const handleVerify = async () => {
    if (pin.length !== 4 || !selectedUser) return;
    setVerifying(true);
    setError('');
    try {
      const verified = await api.users.verify(selectedUser.id, pin) as AuthUser;
      // SUPERADMIN: no shift required
      if (verified.role === 'SUPERADMIN') {
        setUser(verified);
        return;
      }
      // Check for active shift
      const shift = await api.shifts.current(verified.id);
      if (shift) {
        setUser(verified);
        setShiftId(shift.id);
      } else {
        setPendingUser(verified);
        setNeedsShift(true);
      }
    } catch {
      setError('Wrong PIN — try again.');
      setPin('');
    } finally {
      setVerifying(false);
    }
  };

  const handleStartShift = async () => {
    if (!pendingUser || startingCashInput === '') return;
    setStartingShift(true);
    try {
      const shift = await api.shifts.start(pendingUser.id, Number(startingCashInput));
      setUser(pendingUser);
      setShiftId(shift.id);
    } catch {
      setError('Could not start shift.');
    } finally {
      setStartingShift(false);
    }
  };

  // Start shift screen
  if (needsShift && pendingUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="bg-card border rounded-2xl shadow-2xl p-8 w-full max-w-sm space-y-6">
          <div className="text-center">
            <p className="text-lg font-black">Start Shift</p>
            <p className="text-sm text-muted-foreground mt-1">
              Welcome, {pendingUser.name}. Enter your starting cash.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Starting Cash (KES)</label>
            <input
              type="number"
              className="w-full h-12 rounded-xl border border-input bg-background px-4 text-xl font-bold text-center"
              placeholder="0"
              value={startingCashInput}
              onChange={(e) => setStartingCashInput(e.target.value)}
              autoFocus
            />
          </div>
          {error && <p className="text-xs text-destructive text-center">{error}</p>}
          <button
            onClick={handleStartShift}
            disabled={startingShift || startingCashInput === ''}
            className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            {startingShift && <Loader2 className="h-4 w-4 animate-spin" />}
            Open Register
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 gap-8">
      {/* Logo */}
      <div className="flex flex-col items-center gap-3">
        <div
          className="h-14 w-14 rounded-2xl flex items-center justify-center shadow-lg"
          style={{ background: 'var(--sidebar-primary)' }}
        >
          <Store className="h-7 w-7" style={{ color: 'var(--sidebar-primary-foreground)' }} />
        </div>
        <div className="text-center">
          <p className="text-2xl font-black">{storeName}</p>
          <p className="text-sm text-muted-foreground">Who's working today?</p>
        </div>
      </div>

      {/* User selection */}
      {!selectedUser ? (
        <div className="w-full max-w-md space-y-3">
          {loadingUsers ? (
            <div className="flex justify-center py-8 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading profiles…</span>
            </div>
          ) : error ? (
            <p className="text-center text-sm text-destructive">{error}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => { setSelectedUser(u); setPin(''); setError(''); }}
                  className="bg-card border rounded-2xl p-5 text-left hover:border-primary hover:shadow-lg transition-all duration-200 active:scale-[0.97]"
                >
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center mb-3 text-sm font-black"
                    style={{ background: 'oklch(0.477 0.216 27.3 / 0.12)', color: 'var(--primary)' }}
                  >
                    {u.name.substring(0, 2).toUpperCase()}
                  </div>
                  <p className="font-bold text-sm">{u.name}</p>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mt-0.5">
                    {u.role}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* PIN entry */
        <div className="bg-card border rounded-2xl shadow-2xl p-6 w-full max-w-xs space-y-5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSelectedUser(null); setPin(''); setError(''); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back
            </button>
            <div className="flex-1 text-center">
              <p className="font-bold text-sm">{selectedUser.name}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{selectedUser.role}</p>
            </div>
          </div>

          {/* PIN dots */}
          <div className="flex justify-center gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-4 w-4 rounded-full border-2 transition-all duration-150"
                style={{
                  borderColor: 'var(--primary)',
                  background: i < pin.length ? 'var(--primary)' : 'transparent',
                }}
              />
            ))}
          </div>

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-2">
            {['1','2','3','4','5','6','7','8','9'].map((d) => (
              <button
                key={d}
                onClick={() => numpad(d)}
                className="h-12 rounded-xl border font-bold text-lg hover:bg-muted transition-colors active:scale-95"
              >
                {d}
              </button>
            ))}
            <div />
            <button
              onClick={() => numpad('0')}
              className="h-12 rounded-xl border font-bold text-lg hover:bg-muted transition-colors active:scale-95"
            >
              0
            </button>
            <button
              onClick={backspace}
              className="h-12 rounded-xl border flex items-center justify-center hover:bg-muted transition-colors active:scale-95"
            >
              <Delete className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {error && <p className="text-xs text-destructive text-center">{error}</p>}

          <button
            onClick={handleVerify}
            disabled={pin.length !== 4 || verifying}
            className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
            {verifying ? 'Verifying…' : 'Sign In'}
          </button>
        </div>
      )}
    </div>
  );
}
