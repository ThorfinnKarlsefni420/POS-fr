import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore, AuthUser } from '../store/use-auth-store';
import { Loader2, LogIn } from 'lucide-react';
import { useSettingsStore } from '@/features/admin/store/use-settings-store';

interface UserCard {
  id: string;
  name: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'CASHIER' | 'SUPPLIER';
}


export function LoginPage() {
  const { setUser, setShiftId } = useAuthStore();
  const storeName = useSettingsStore((s) => s.storeName);

  const [users, setUsers]               = useState<UserCard[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [username, setUsername]         = useState('');
  const [password, setPassword]         = useState('');
  const [error, setError]               = useState('');
  const [verifying, setVerifying]       = useState(false);

  const [freeType, setFreeType]                   = useState(false);
  const [logoClicks, setLogoClicks]               = useState(0);
  const logoClickTimer                            = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogoClick = () => {
    const next = logoClicks + 1;
    if (next >= 3) { setFreeType((f) => !f); setUsername(''); setLogoClicks(0); return; }
    setLogoClicks(next);
    if (logoClickTimer.current) clearTimeout(logoClickTimer.current);
    logoClickTimer.current = setTimeout(() => setLogoClicks(0), 600);
  };

  const [startingShift, setStartingShift]         = useState(false);
  const [startingCashInput, setStartingCashInput] = useState('');
  const [needsShift, setNeedsShift]   = useState(false);
  const [pendingUser, setPendingUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.users.list();
        if (list.length === 0) {
          const created = await api.users.create({ name: 'Admin', pin: '0000', role: 'ADMIN' });
          setUsers([{ id: created.id, name: created.name, role: created.role as UserCard['role'] }]);
          setLoadingUsers(false);
          return;
        }
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

  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '');

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!username.trim() || password.length < 4) return;
    const matched = users.find((u) => normalize(u.name) === normalize(username.trim()));
    if (!matched) { setError('User not found.'); return; }

    setVerifying(true);
    setError('');
    try {
      const verified = await api.users.verify(matched.id, password) as AuthUser;
      if (verified.role === 'SUPERADMIN') { setUser(verified); return; }
      const shift = await api.shifts.current(verified.id);
      if (shift) {
        setUser(verified);
        setShiftId(shift.id);
      } else {
        setPendingUser(verified);
        setNeedsShift(true);
      }
    } catch {
      setError('Incorrect password. Try again.');
      setPassword('');
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

  // ── Start shift screen
  if (needsShift && pendingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6"
        style={{ background: 'radial-gradient(ellipse at 60% 0%, oklch(0.477 0.216 27.3 / 0.08) 0%, transparent 60%), var(--background)' }}
      >
        <div className="bg-card border rounded-2xl shadow-2xl p-8 w-full max-w-sm space-y-6">
          <div className="text-center">
            <p className="text-lg font-black">Open Register</p>
            <p className="text-sm text-muted-foreground mt-1">
              Welcome, {pendingUser.name}. Enter your starting cash to begin your shift.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Starting Cash (KES)</label>
            <input
              type="number"
              className="w-full h-12 rounded-xl border border-input bg-background px-4 text-xl font-bold text-center outline-none focus:ring-2"
              style={{ '--tw-ring-color': 'var(--primary)' } as React.CSSProperties}
              placeholder="0"
              value={startingCashInput}
              onChange={(e) => setStartingCashInput(e.target.value)}
              autoFocus
            />
          </div>
          {error && <p className="text-xs text-destructive text-center">{error}</p>}
          <button
            onClick={handleStartShift}
            disabled={startingShift || !startingCashInput}
            className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            {startingShift && <Loader2 className="h-4 w-4 animate-spin" />}
            Open Register
          </button>
        </div>
      </div>
    );
  }

  // ── Main login
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'radial-gradient(ellipse at 60% 0%, oklch(0.477 0.216 27.3 / 0.08) 0%, transparent 60%), var(--background)' }}
    >
      <div className="w-full max-w-sm">

        {/* ── Login form ── */}
        <div className="bg-card border rounded-2xl shadow-xl p-8 w-full space-y-7">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div
              className="h-11 w-11 rounded-xl flex items-center justify-center shadow-md shrink-0 cursor-pointer select-none"
              style={{ background: 'var(--primary)' }}
              onClick={handleLogoClick}
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <div>
              <p className="font-black text-lg leading-tight">{storeName || 'NomadBite'}</p>
              <p className="text-xs text-muted-foreground font-medium">Point of Sale</p>
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-black tracking-tight">Welcome back</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in to continue to your store</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Username</label>
              {loadingUsers ? (
                <div className="h-11 rounded-xl border bg-muted/40 flex items-center px-3 gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading…
                </div>
              ) : freeType ? (
                <input
                  type="text"
                  autoComplete="off"
                  autoFocus
                  placeholder="Username"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(''); }}
                  className="w-full h-11 rounded-xl border border-input bg-background px-3.5 text-sm font-medium outline-none transition-shadow focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              ) : (
                <select
                  autoFocus
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(''); }}
                  className="w-full h-11 rounded-xl border border-input bg-background px-3.5 text-sm font-medium outline-none transition-shadow focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none cursor-pointer"
                >
                  <option value="">Select your name…</option>
                  {users.filter((u) => u.role !== 'SUPERADMIN').map((u) => (
                    <option key={u.id} value={u.name}>{u.name} — {u.role}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Password (PIN)</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                autoComplete="current-password"
                placeholder="••••"
                value={password}
                onChange={(e) => { setPassword(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}
                className="w-full h-11 rounded-xl border border-input bg-background px-3.5 text-sm font-mono tracking-[0.4em] outline-none transition-shadow focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            {error && (
              <p className="text-xs font-semibold text-destructive bg-destructive/8 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={verifying || !username.trim() || password.length < 4}
              className="w-full h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity mt-2"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              {verifying
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</>
                : <><LogIn className="h-4 w-4" /> Sign In</>
              }
            </button>
          </form>

          <p className="text-xs text-muted-foreground/50 text-center pt-1">
            {new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

      </div>
    </div>
  );
}
