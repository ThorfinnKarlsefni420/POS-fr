import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore, AuthUser } from '../store/use-auth-store';
import { Delete, Loader2, ShieldCheck, UserCog, User } from 'lucide-react';
import { useSettingsStore } from '@/features/admin/store/use-settings-store';

interface UserCard {
  id: string;
  name: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'CASHIER';
}

const ROLE_META = {
  SUPERADMIN: { label: 'Super Admin', color: '#7c3aed', bg: 'rgba(124,58,237,0.12)', Icon: ShieldCheck },
  ADMIN:      { label: 'Admin',       color: '#ea580c', bg: 'rgba(234,88,12,0.12)',  Icon: UserCog },
  CASHIER:    { label: 'Cashier',     color: '#0284c7', bg: 'rgba(2,132,199,0.12)',  Icon: User },
};

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
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
        // Seed default admin if the database is empty
        if (list.length === 0) {
          const created = await api.users.create({ name: 'Admin', pin: '0000', role: 'ADMIN' });
          setUsers([{ id: created.id, name: created.name, role: created.role as UserCard['role'] }]);
          setLoadingUsers(false);
          return;
        }
        // Ensure a SUPERADMIN always exists — recreate if deleted
        if (!list.some((u) => u.role === 'SUPERADMIN')) {
          const sa = await api.users.create({ name: 'Super Admin', pin: '0000', role: 'SUPERADMIN' });
          setUsers([...list, { id: sa.id, name: sa.name, role: 'SUPERADMIN' }] as UserCard[]);
          setLoadingUsers(false);
          return;
        }
        setUsers(list as UserCard[]);
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

  useEffect(() => {
    if (!selectedUser) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') numpad(e.key);
      else if (e.key === 'Backspace') backspace();
      else if (e.key === 'Enter') handleVerify();
      else if (e.key === 'Escape') { setSelectedUser(null); setPin(''); setError(''); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedUser, pin]);

  const handleVerify = async () => {
    if (pin.length !== 4 || !selectedUser) return;
    setVerifying(true);
    setError('');
    try {
      const verified = await api.users.verify(selectedUser.id, pin) as AuthUser;
      if (verified.role === 'SUPERADMIN') {
        setUser(verified);
        return;
      }
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
      const shift = await api.shifts.start(pendingUser.id, Number(startingCashInput), pendingUser.storeId ?? undefined);
      setUser(pendingUser);
      setShiftId(shift.id);
    } catch {
      setError('Could not start shift.');
    } finally {
      setStartingShift(false);
    }
  };

  // ── Start Shift screen ────────────────────────────────────────────────────
  if (needsShift && pendingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--background)' }}>
        <div className="bg-card border rounded-2xl shadow-2xl p-8 w-full max-w-sm space-y-6">
          <div className="text-center">
            <p className="text-lg font-black">Start Shift</p>
            <p className="text-sm text-muted-foreground mt-1">
              Welcome, {pendingUser.name}. Enter your starting cash.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Starting Cash (KES)
            </label>
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

  // ── Main login screen ─────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 gap-10"
      style={{
        background: 'radial-gradient(ellipse at 60% 0%, oklch(0.477 0.216 27.3 / 0.08) 0%, transparent 60%), var(--background)',
      }}
    >
      {/* Header */}
      <div className="flex flex-col items-center gap-4 text-center">
        <div
          className="h-16 w-16 rounded-2xl flex items-center justify-center shadow-xl"
          style={{ background: 'var(--primary)' }}
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </div>
        <div>
          <p className="text-3xl font-black tracking-tight">{storeName}</p>
          <p className="text-sm text-muted-foreground mt-1">Select your profile to continue</p>
        </div>
      </div>

      {/* User tiles / PIN entry */}
      {!selectedUser ? (
        <div className="w-full max-w-lg">
          {loadingUsers ? (
            <div className="flex justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading profiles…</span>
            </div>
          ) : error ? (
            <p className="text-center text-sm text-destructive">{error}</p>
          ) : (
            <div className={`grid gap-4 ${users.length <= 2 ? 'grid-cols-2' : users.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'}`}>
              {users.map((u) => {
                const meta = ROLE_META[u.role];
                const Icon = meta.Icon;
                return (
                  <button
                    key={u.id}
                    onClick={() => { setSelectedUser(u); setPin(''); setError(''); }}
                    className="group relative flex flex-col items-center gap-4 rounded-3xl border-2 bg-card p-6 text-center transition-all duration-200 hover:shadow-xl hover:-translate-y-1 active:scale-[0.97]"
                    style={{ borderColor: 'transparent' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = meta.color; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; }}
                  >
                    {/* Avatar */}
                    <div
                      className="h-16 w-16 rounded-2xl flex items-center justify-center text-xl font-black shadow-sm transition-transform duration-200 group-hover:scale-105"
                      style={{ background: meta.bg, color: meta.color }}
                    >
                      {initials(u.name)}
                    </div>
                    {/* Name */}
                    <div className="space-y-1.5">
                      <p className="font-bold text-sm leading-tight">{u.name}</p>
                      {/* Role badge */}
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: meta.bg, color: meta.color }}
                      >
                        <Icon className="h-2.5 w-2.5" />
                        {meta.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* PIN Entry */
        <div className="bg-card border rounded-3xl shadow-2xl p-7 w-full max-w-xs space-y-6">
          {/* Selected user */}
          <div className="flex flex-col items-center gap-3">
            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center text-lg font-black"
              style={{ background: ROLE_META[selectedUser.role].bg, color: ROLE_META[selectedUser.role].color }}
            >
              {initials(selectedUser.name)}
            </div>
            <div className="text-center">
              <p className="font-bold text-base">{selectedUser.name}</p>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide mt-0.5">
                {ROLE_META[selectedUser.role].label}
              </p>
            </div>
          </div>

          {/* PIN dots */}
          <div className="flex justify-center gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-3.5 w-3.5 rounded-full border-2 transition-all duration-150"
                style={{
                  borderColor: ROLE_META[selectedUser.role].color,
                  background: i < pin.length ? ROLE_META[selectedUser.role].color : 'transparent',
                  transform: i < pin.length ? 'scale(1.15)' : 'scale(1)',
                }}
              />
            ))}
          </div>

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-2.5">
            {['1','2','3','4','5','6','7','8','9'].map((d) => (
              <button
                key={d}
                onClick={() => numpad(d)}
                className="h-12 rounded-xl border font-bold text-lg hover:bg-muted transition-all active:scale-90"
              >
                {d}
              </button>
            ))}
            <button
              onClick={() => { setSelectedUser(null); setPin(''); setError(''); }}
              className="h-12 rounded-xl border text-xs font-semibold text-muted-foreground hover:bg-muted transition-all active:scale-90"
            >
              Back
            </button>
            <button
              onClick={() => numpad('0')}
              className="h-12 rounded-xl border font-bold text-lg hover:bg-muted transition-all active:scale-90"
            >
              0
            </button>
            <button
              onClick={backspace}
              className="h-12 rounded-xl border flex items-center justify-center hover:bg-muted transition-all active:scale-90"
            >
              <Delete className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {error && <p className="text-xs text-destructive text-center -mt-2">{error}</p>}

          <button
            onClick={handleVerify}
            disabled={pin.length !== 4 || verifying}
            className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
            style={{
              background: pin.length === 4 ? ROLE_META[selectedUser.role].color : undefined,
              color: pin.length === 4 ? 'white' : undefined,
            }}
          >
            {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
            {verifying ? 'Verifying…' : 'Sign In'}
          </button>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground/50">{new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
    </div>
  );
}
