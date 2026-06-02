import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AlertTriangle, Users, TrendingDown } from 'lucide-react';

interface MkopoOverdueSale {
  id: string;
  customerId: string;
  amountOwed: number | string;
  amountPaid: number | string;
  dueDate: string | null;
  status: string;
  customer: { id: string; name: string; phone: string | null };
  transaction: { id: string; createdAt: string; totalAmount: number | string };
}

export function MkopoReport() {
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.customers.list(),
    staleTime: 30_000,
  });

  const { data: overdueSales = [] } = useQuery({
    queryKey: ['customers', 'overdue'],
    queryFn: () => api.customers.overdue() as Promise<MkopoOverdueSale[]>,
    staleTime: 30_000,
  });

  const activeCustomers = customers
    .filter((c) => (c.outstandingBalance ?? 0) > 0)
    .sort((a, b) => (b.outstandingBalance ?? 0) - (a.outstandingBalance ?? 0));

  const overdueCustomerIds = new Set(overdueSales.map((s) => s.customerId));
  const totalOutstanding = activeCustomers.reduce((s, c) => s + (c.outstandingBalance ?? 0), 0);
  const overdueAmount = overdueSales.reduce(
    (s, ms) => s + (Number(ms.amountOwed) - Number(ms.amountPaid)),
    0,
  );
  const overdueCustomerCount = activeCustomers.filter((c) => overdueCustomerIds.has(c.id)).length;

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading mkopo data…</div>;
  }

  return (
    <div className="space-y-6">

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {([
          {
            label: 'Total Outstanding',
            value: `KES ${totalOutstanding.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`,
            sub: `${activeCustomers.length} customer${activeCustomers.length !== 1 ? 's' : ''} with open tabs`,
            color: 'oklch(0.4 0.15 230)',
            icon: Users,
          },
          {
            label: 'Overdue Amount',
            value: `KES ${overdueAmount.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`,
            sub: `${overdueCustomerCount} customer${overdueCustomerCount !== 1 ? 's' : ''} past due date`,
            color: 'var(--primary)',
            icon: AlertTriangle,
          },
          {
            label: 'Avg Balance',
            value:
              activeCustomers.length > 0
                ? `KES ${(totalOutstanding / activeCustomers.length).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`
                : '—',
            sub: 'per customer with open tab',
            color: 'oklch(0.55 0.15 60)',
            icon: TrendingDown,
          },
        ] as const).map((card) => (
          <div key={card.label} className="rounded-xl border bg-card p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {card.label}
            </span>
            <span className="text-2xl font-black leading-none" style={{ color: card.color }}>
              {card.value}
            </span>
            <span className="text-xs text-muted-foreground">{card.sub}</span>
          </div>
        ))}
      </div>

      {/* Open tabs table */}
      <section>
        <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          Open Tabs
          {activeCustomers.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-muted text-muted-foreground">
              {activeCustomers.length}
            </span>
          )}
        </h2>
        {activeCustomers.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
            No outstanding mkopo balances
          </div>
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="p-3 border-b bg-muted flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Customers with balance
              </p>
              <p className="text-xs font-bold" style={{ color: 'var(--primary)' }}>
                KES {totalOutstanding.toLocaleString('en-KE', { maximumFractionDigits: 0 })} total
              </p>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left p-3 font-semibold text-muted-foreground uppercase tracking-wide">Customer</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground uppercase tracking-wide">Phone</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground uppercase tracking-wide">Outstanding</th>
                  <th className="text-center p-3 font-semibold text-muted-foreground uppercase tracking-wide">Open Sales</th>
                  <th className="text-center p-3 font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {activeCustomers.map((c) => {
                  const isOverdue = overdueCustomerIds.has(c.id);
                  return (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="p-3 font-semibold">{c.name}</td>
                      <td className="p-3 text-muted-foreground">{c.phone ?? '—'}</td>
                      <td className="p-3 text-right font-bold font-mono" style={{ color: 'var(--primary)' }}>
                        KES {(c.outstandingBalance ?? 0).toLocaleString('en-KE', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="p-3 text-center text-muted-foreground">{c.totalSales ?? 0}</td>
                      <td className="p-3 text-center">
                        <span
                          className="px-2 py-0.5 rounded-full font-semibold"
                          style={
                            isOverdue
                              ? { background: 'oklch(0.477 0.216 27.3 / 0.12)', color: 'var(--primary)' }
                              : { background: 'oklch(0.75 0.15 60 / 0.15)', color: 'oklch(0.55 0.15 60)' }
                          }
                        >
                          {isOverdue ? 'Overdue' : 'Open'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Overdue sales detail */}
      {overdueSales.length > 0 && (
        <section>
          <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" style={{ color: 'var(--primary)' }} />
            Overdue Sales Detail
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: 'oklch(0.477 0.216 27.3 / 0.12)', color: 'var(--primary)' }}
            >
              {overdueSales.length}
            </span>
          </h2>
          <div className="rounded-xl border bg-card overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left p-3 font-semibold text-muted-foreground uppercase tracking-wide">Customer</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground uppercase tracking-wide">Owed</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground uppercase tracking-wide">Paid</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground uppercase tracking-wide">Balance</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground uppercase tracking-wide">Due Date</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground uppercase tracking-wide">Days Overdue</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {overdueSales.map((ms) => {
                  const balance = Number(ms.amountOwed) - Number(ms.amountPaid);
                  const daysOverdue = ms.dueDate
                    ? Math.ceil((Date.now() - new Date(ms.dueDate).getTime()) / 86_400_000)
                    : null;
                  return (
                    <tr key={ms.id} className="hover:bg-muted/30">
                      <td className="p-3">
                        <p className="font-semibold">{ms.customer.name}</p>
                        {ms.customer.phone && (
                          <p className="text-[10px] text-muted-foreground">{ms.customer.phone}</p>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono text-muted-foreground">
                        {Number(ms.amountOwed).toLocaleString('en-KE', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="p-3 text-right font-mono text-muted-foreground">
                        {Number(ms.amountPaid).toLocaleString('en-KE', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="p-3 text-right font-bold font-mono" style={{ color: 'var(--primary)' }}>
                        KES {balance.toLocaleString('en-KE', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="p-3 text-right text-muted-foreground">
                        {ms.dueDate
                          ? new Date(ms.dueDate).toLocaleDateString('en-KE', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="p-3 text-right">
                        {daysOverdue !== null ? (
                          <span className="font-mono font-bold" style={{ color: 'var(--primary)' }}>
                            {daysOverdue}d
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
