import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ShoppingCart, Package, Settings, Store, RotateCcw, WifiOff, CloudUpload, BarChart2 } from 'lucide-react';
import { useSettingsStore } from '@/features/admin/store/use-settings-store';
import { useAuthStore } from '@/features/auth/store/use-auth-store';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { getOfflineQueue } from '@/hooks/use-offline-sync';
import { ShiftPanel } from '@/features/shifts/components/shift-panel';

const NAV = [
  { to: '/pos', icon: ShoppingCart, label: 'POS' },
  { to: '/inventory', icon: Package, label: 'Inventory' },
  { to: '/returns', icon: RotateCcw, label: 'Returns' },
  { to: '/reports', icon: BarChart2, label: 'Reports' },
  { to: '/admin', icon: Settings, label: 'Admin' },
];

const PAGE_TITLES: Record<string, string> = {
  '/pos': 'Point of Sale',
  '/inventory': 'Inventory',
  '/returns': 'Returns & Refunds',
  '/reports': 'Reports',
  '/admin': 'Admin Settings',
};

export function AppShell() {
  const storeName = useSettingsStore((s) => s.storeName);
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] ?? 'NomadBite';
  const { user } = useAuthStore();
  const isOnline = useOnlineStatus();
  const pendingCount = getOfflineQueue().length;
  const [shiftOpen, setShiftOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Sidebar ── */}
      <aside
        className="w-14 md:w-52 flex flex-col shrink-0"
        style={{ background: 'var(--sidebar)', borderRight: '1px solid var(--sidebar-border)' }}
      >
        {/* Logo */}
        <div
          className="h-14 flex items-center gap-3 px-4 shrink-0"
          style={{ borderBottom: '1px solid var(--sidebar-border)' }}
        >
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'var(--sidebar-primary)' }}
          >
            <Store className="h-4.5 w-4.5" style={{ color: 'var(--sidebar-primary-foreground)' }} />
          </div>
          <div className="hidden md:block min-w-0">
            <p className="font-bold text-sm leading-tight truncate" style={{ color: 'var(--sidebar-foreground)' }}>
              {storeName}
            </p>
            <p className="text-xs" style={{ color: 'oklch(0.55 0 0)' }}>POS System</p>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 p-2 space-y-0.5 mt-2">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive ? 'active-nav' : 'inactive-nav'
                }`
              }
              style={({ isActive }) =>
                isActive
                  ? { background: 'var(--sidebar-primary)', color: 'var(--sidebar-primary-foreground)' }
                  : { color: 'var(--sidebar-foreground)', opacity: 0.7 }
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`h-5 w-5 shrink-0 ${isActive ? '' : 'opacity-80'}`} />
                  <span className="hidden md:block">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom tag */}
        <div
          className="p-4 hidden md:block"
          style={{ borderTop: '1px solid var(--sidebar-border)' }}
        >
          <p className="text-xs" style={{ color: 'oklch(0.4 0 0)' }}>NomadBite · v1.0</p>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Offline banner */}
        {!isOnline && (
          <div className="flex items-center justify-center gap-2 py-1.5 text-xs font-bold bg-amber-500 text-white shrink-0">
            <WifiOff className="h-3.5 w-3.5" />
            OFFLINE MODE — Cash payments only · Sales queued locally
            {pendingCount > 0 && <span className="bg-white/20 px-2 py-0.5 rounded-full">{pendingCount} pending</span>}
          </div>
        )}

        {/* Sync banner — show when back online with pending items */}
        {isOnline && pendingCount > 0 && (
          <div className="flex items-center justify-center gap-2 py-1.5 text-xs font-bold bg-green-600 text-white shrink-0">
            <CloudUpload className="h-3.5 w-3.5 animate-bounce" />
            Syncing {pendingCount} offline sale{pendingCount !== 1 ? 's' : ''}…
          </div>
        )}

        {/* Top bar */}
        <header className="h-14 bg-card border-b flex items-center justify-between px-6 shrink-0">
          <h1 className="font-bold text-base">{title}</h1>
          <div className="flex items-center gap-2">
            {isOnline ? (
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: 'oklch(0.477 0.216 27.3 / 0.1)', color: 'var(--primary)' }}
              >
                LIVE · PostgreSQL
              </span>
            ) : (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700">
                OFFLINE
              </span>
            )}

            {/* Shift + user button (Phase 3.2) */}
            {user && (
              <button
                onClick={() => setShiftOpen(true)}
                className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border hover:bg-muted transition-colors"
              >
                <div
                  className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0"
                  style={{ background: 'oklch(0.477 0.216 27.3 / 0.12)', color: 'var(--primary)' }}
                >
                  {user.name.substring(0, 1).toUpperCase()}
                </div>
                <span className="hidden sm:block">{user.name}</span>
                <span className="hidden sm:block text-muted-foreground">·</span>
                <span className="hidden sm:block text-muted-foreground">{user.role}</span>
              </button>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>

      <ShiftPanel open={shiftOpen} onClose={() => setShiftOpen(false)} />
    </div>
  );
}
