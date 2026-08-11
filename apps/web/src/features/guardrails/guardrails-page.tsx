import { useState } from 'react';
import { GuardrailDashboard } from './components/guardrail-dashboard';
import { WeeklyTracker } from './components/weekly-tracker';
import { ReorderCohorts } from './components/reorder-cohorts';

type Tab = 'dashboard' | 'weekly' | 'cohorts';

const TABS: { key: Tab; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'weekly', label: 'Weekly Tracker' },
  { key: 'cohorts', label: 'Reorder Cohorts' },
];

export function GuardrailsPage() {
  const [tab, setTab] = useState<Tab>('dashboard');

  return (
    <div className="flex flex-col h-full p-6 gap-5 overflow-auto">
      <div>
        <h1 className="text-xl font-bold">Guardrail Tracker</h1>
        <p className="text-sm text-muted-foreground">Weekly margin, inventory, subsidy, marketing and reorder guardrails vs. launch targets</p>
      </div>

      <div className="flex gap-0.5 border-b shrink-0">
        {TABS.map((t) => (
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

      <div className="flex-1">
        {tab === 'dashboard' && <GuardrailDashboard />}
        {tab === 'weekly' && <WeeklyTracker />}
        {tab === 'cohorts' && <ReorderCohorts />}
      </div>
    </div>
  );
}
