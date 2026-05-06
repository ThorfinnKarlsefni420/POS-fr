import { useState } from 'react';
import { SalesReport } from './components/sales-report';
import { ShiftReport } from './components/shift-report';
import { InventoryReport } from './components/inventory-report';

type Tab = 'sales' | 'shifts' | 'inventory';
type Preset = '7d' | '30d' | '3m' | '1y';

function getRange(preset: Preset): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (preset === '7d') from.setDate(from.getDate() - 7);
  else if (preset === '30d') from.setDate(from.getDate() - 30);
  else if (preset === '3m') from.setMonth(from.getMonth() - 3);
  else from.setFullYear(from.getFullYear() - 1);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '3m', label: 'Last 3 months' },
  { key: '1y', label: 'This year' },
];

const TABS: { key: Tab; label: string }[] = [
  { key: 'sales', label: 'Sales' },
  { key: 'shifts', label: 'Shifts' },
  { key: 'inventory', label: 'Inventory' },
];

export function ReportsPage() {
  const [tab, setTab] = useState<Tab>('sales');
  const [preset, setPreset] = useState<Preset>('30d');
  const range = getRange(preset);

  return (
    <div className="flex flex-col h-full p-6 gap-5 overflow-auto">
      {/* Header */}
      <div className="flex items-start justify-between shrink-0 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Reports</h1>
          <p className="text-sm text-muted-foreground">Sales, shifts, and inventory analytics</p>
        </div>

        {/* Date range — hidden for inventory tab */}
        {tab !== 'inventory' && (
          <div className="flex gap-1 bg-muted p-1 rounded-lg">
            {PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
                style={preset === p.key
                  ? { background: 'var(--background)', color: 'var(--foreground)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                  : { color: 'var(--muted-foreground)' }}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b shrink-0">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors"
            style={tab === t.key
              ? { borderColor: 'var(--primary)', color: 'var(--primary)' }
              : { borderColor: 'transparent', color: 'var(--muted-foreground)' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1">
        {tab === 'sales' && <SalesReport from={range.from} to={range.to} />}
        {tab === 'shifts' && <ShiftReport from={range.from} to={range.to} />}
        {tab === 'inventory' && <InventoryReport />}
      </div>
    </div>
  );
}
