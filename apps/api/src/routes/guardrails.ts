import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { getStoreContext } from '../middleware/store-context';

export const guardrailsRouter = new Hono();

// Guardrail targets and status bands — mirrors the launch-budget workbook (Section 5).
// direction: 'min' means higher is better (on-target is >= target); 'max' means lower is better.
const BANDS = {
  margin:      { direction: 'min' as const, onTarget: 25, watchLow: 22 },
  inventoryDays: { direction: 'max' as const, onTarget: 45, watchHigh: 48 },
  subsidy:     { direction: 'max' as const, onTarget: 5, watchHigh: 6 },
  marketing:   { direction: 'max' as const, onTarget: 8, watchHigh: 9 },
  reorder:     { direction: 'min' as const, onTarget: 30, watchLow: 25 },
};

type BandKey = keyof typeof BANDS;
type Status = 'on_target' | 'watch' | 'off_target' | 'pending';

function statusFor(key: BandKey, value: number | null): Status {
  if (value === null || Number.isNaN(value)) return 'pending';
  const band = BANDS[key];
  if (band.direction === 'min') {
    if (value >= band.onTarget) return 'on_target';
    if (value >= band.watchLow) return 'watch';
    return 'off_target';
  }
  if (value <= band.onTarget) return 'on_target';
  if (value <= band.watchHigh) return 'watch';
  return 'off_target';
}

function toNum(d: unknown): number {
  return d === null || d === undefined ? 0 : Number(d);
}

function weeklyMetrics(entry: { revenue: unknown; cogs: unknown; avgInventoryValue: unknown; deliverySubsidyCost: unknown; marketingSpend: unknown; firstOrderRevenue: unknown }) {
  const revenue = toNum(entry.revenue);
  const cogs = toNum(entry.cogs);
  const avgInventoryValue = toNum(entry.avgInventoryValue);
  const deliverySubsidyCost = toNum(entry.deliverySubsidyCost);
  const marketingSpend = toNum(entry.marketingSpend);
  const firstOrderRevenue = toNum(entry.firstOrderRevenue);

  const marginPct = revenue > 0 ? ((revenue - cogs) / revenue) * 100 : null;
  const dailyCogs = cogs / 7;
  const inventoryDays = dailyCogs > 0 ? avgInventoryValue / dailyCogs : null;
  const subsidyPct = revenue > 0 ? (deliverySubsidyCost / revenue) * 100 : null;
  const marketingPct = firstOrderRevenue > 0 ? (marketingSpend / firstOrderRevenue) * 100 : null;

  return { marginPct, inventoryDays, subsidyPct, marketingPct };
}

function cohortReorderRate(cohort: { newCustomersInCohort: number; reorderedCount: number | null }) {
  if (cohort.reorderedCount === null) return null;
  if (cohort.newCustomersInCohort <= 0) return null;
  return (cohort.reorderedCount / cohort.newCustomersInCohort) * 100;
}

function rollingAvg(values: Array<number | null>, take = 4): number | null {
  const usable = values.filter((v): v is number => v !== null).slice(0, take);
  if (usable.length === 0) return null;
  return usable.reduce((s, v) => s + v, 0) / usable.length;
}

function round2(n: number | null): number | null {
  return n === null ? null : Math.round(n * 100) / 100;
}

function parseWeekStart(raw: string | undefined): Date {
  if (!raw) throw new Error('weekStart is required');
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new Error('weekStart is invalid');
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ─── Weekly Tracker ────────────────────────────────────────────────────────

guardrailsRouter.get('/weekly', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const entries = await prisma.weeklyGuardrailEntry.findMany({
    where: { storeId },
    orderBy: { weekStart: 'desc' },
  });

  return c.json(entries.map((e) => ({
    id: e.id,
    weekStart: e.weekStart.toISOString().split('T')[0],
    revenue: toNum(e.revenue),
    cogs: toNum(e.cogs),
    avgInventoryValue: toNum(e.avgInventoryValue),
    deliverySubsidyCost: toNum(e.deliverySubsidyCost),
    marketingSpend: toNum(e.marketingSpend),
    firstOrderRevenue: toNum(e.firstOrderRevenue),
    newCustomers: e.newCustomers,
    notes: e.notes,
    ...weeklyMetrics(e),
  })));
});

// Prefill revenue + COGS for a given week from actual transaction data,
// so weekly entry doesn't require manually re-deriving numbers this repo already has.
guardrailsRouter.get('/weekly/prefill', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  let weekStart: Date;
  try {
    weekStart = parseWeekStart(c.req.query('weekStart'));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const lineItems = await prisma.lineItem.findMany({
    where: {
      isReturned: false,
      transaction: {
        storeId,
        status: 'COMPLETED',
        createdAt: { gte: weekStart, lt: weekEnd },
      },
    },
    select: {
      quantity: true,
      soldPrice: true,
      item: { select: { costPrice: true } },
    },
  });

  let revenue = 0;
  let cogs = 0;
  for (const li of lineItems) {
    const qty = Number(li.quantity);
    revenue += Number(li.soldPrice) * qty;
    cogs += Number(li.item.costPrice) * qty;
  }

  return c.json({ revenue: Math.round(revenue * 100) / 100, cogs: Math.round(cogs * 100) / 100 });
});

guardrailsRouter.post('/weekly', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const body = await c.req.json<{
    weekStart: string;
    revenue?: number;
    cogs?: number;
    avgInventoryValue?: number;
    deliverySubsidyCost?: number;
    marketingSpend?: number;
    firstOrderRevenue?: number;
    newCustomers?: number;
    notes?: string;
  }>();

  let weekStart: Date;
  try {
    weekStart = parseWeekStart(body.weekStart);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }

  const data = {
    revenue: body.revenue ?? 0,
    cogs: body.cogs ?? 0,
    avgInventoryValue: body.avgInventoryValue ?? 0,
    deliverySubsidyCost: body.deliverySubsidyCost ?? 0,
    marketingSpend: body.marketingSpend ?? 0,
    firstOrderRevenue: body.firstOrderRevenue ?? 0,
    newCustomers: body.newCustomers ?? 0,
    notes: body.notes,
  };

  const entry = await prisma.weeklyGuardrailEntry.upsert({
    where: { storeId_weekStart: { storeId, weekStart } },
    create: { storeId, weekStart, ...data },
    update: data,
  });

  return c.json({
    id: entry.id,
    weekStart: entry.weekStart.toISOString().split('T')[0],
    revenue: toNum(entry.revenue),
    cogs: toNum(entry.cogs),
    avgInventoryValue: toNum(entry.avgInventoryValue),
    deliverySubsidyCost: toNum(entry.deliverySubsidyCost),
    marketingSpend: toNum(entry.marketingSpend),
    firstOrderRevenue: toNum(entry.firstOrderRevenue),
    newCustomers: entry.newCustomers,
    notes: entry.notes,
    ...weeklyMetrics(entry),
  }, 201);
});

guardrailsRouter.delete('/weekly/:id', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const id = c.req.param('id');
  const entry = await prisma.weeklyGuardrailEntry.findUnique({ where: { id } });
  if (!entry || entry.storeId !== storeId) return c.json({ error: 'Not found' }, 404);

  await prisma.weeklyGuardrailEntry.delete({ where: { id } });
  return c.json({ ok: true });
});

// ─── Reorder Cohorts ───────────────────────────────────────────────────────

guardrailsRouter.get('/cohorts', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const cohorts = await prisma.reorderCohort.findMany({
    where: { storeId },
    orderBy: { cohortStartDate: 'desc' },
  });

  const now = new Date();
  return c.json(cohorts.map((ch) => {
    const day60Date = new Date(ch.cohortStartDate);
    day60Date.setUTCDate(day60Date.getUTCDate() + 60);
    return {
      id: ch.id,
      cohortStartDate: ch.cohortStartDate.toISOString().split('T')[0],
      day60Date: day60Date.toISOString().split('T')[0],
      day60Passed: day60Date <= now,
      newCustomersInCohort: ch.newCustomersInCohort,
      reorderedCount: ch.reorderedCount,
      reorderRatePct: cohortReorderRate(ch),
      notes: ch.notes,
    };
  }));
});

guardrailsRouter.post('/cohorts', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const body = await c.req.json<{
    cohortStartDate: string;
    newCustomersInCohort?: number;
    reorderedCount?: number | null;
    notes?: string;
  }>();

  let cohortStartDate: Date;
  try {
    cohortStartDate = parseWeekStart(body.cohortStartDate);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }

  const data = {
    newCustomersInCohort: body.newCustomersInCohort ?? 0,
    reorderedCount: body.reorderedCount ?? null,
    notes: body.notes,
  };

  const cohort = await prisma.reorderCohort.upsert({
    where: { storeId_cohortStartDate: { storeId, cohortStartDate } },
    create: { storeId, cohortStartDate, ...data },
    update: data,
  });

  const day60Date = new Date(cohort.cohortStartDate);
  day60Date.setUTCDate(day60Date.getUTCDate() + 60);

  return c.json({
    id: cohort.id,
    cohortStartDate: cohort.cohortStartDate.toISOString().split('T')[0],
    day60Date: day60Date.toISOString().split('T')[0],
    day60Passed: day60Date <= new Date(),
    newCustomersInCohort: cohort.newCustomersInCohort,
    reorderedCount: cohort.reorderedCount,
    reorderRatePct: cohortReorderRate(cohort),
    notes: cohort.notes,
  }, 201);
});

guardrailsRouter.delete('/cohorts/:id', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const id = c.req.param('id');
  const cohort = await prisma.reorderCohort.findUnique({ where: { id } });
  if (!cohort || cohort.storeId !== storeId) return c.json({ error: 'Not found' }, 404);

  await prisma.reorderCohort.delete({ where: { id } });
  return c.json({ ok: true });
});

// ─── Dashboard ─────────────────────────────────────────────────────────────
// Latest completed week/cohort + 4-week rolling average + status band per guardrail.

guardrailsRouter.get('/dashboard', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const [weeklyEntries, cohorts] = await Promise.all([
    prisma.weeklyGuardrailEntry.findMany({ where: { storeId }, orderBy: { weekStart: 'desc' }, take: 4 }),
    // Latest completed cohort = most recently recorded reorder count.
    prisma.reorderCohort.findMany({ where: { storeId, reorderedCount: { not: null } }, orderBy: { cohortStartDate: 'desc' }, take: 4 }),
  ]);

  const weeklyCalc = weeklyEntries.map(weeklyMetrics);
  const latestWeek = weeklyEntries[0] ?? null;
  const latestWeekCalc = weeklyCalc[0] ?? { marginPct: null, inventoryDays: null, subsidyPct: null, marketingPct: null };

  const cohortRates = cohorts.map(cohortReorderRate);
  const latestCohort = cohorts[0] ?? null;
  const latestReorderRate = cohortRates[0] ?? null;

  const rolling = {
    marginPct: rollingAvg(weeklyCalc.map((w) => w.marginPct)),
    inventoryDays: rollingAvg(weeklyCalc.map((w) => w.inventoryDays)),
    subsidyPct: rollingAvg(weeklyCalc.map((w) => w.subsidyPct)),
    marketingPct: rollingAvg(weeklyCalc.map((w) => w.marketingPct)),
    reorderRatePct: rollingAvg(cohortRates),
  };

  const guardrails = [
    {
      key: 'margin', label: 'Blended gross margin', target: '≥ 25%',
      latest: round2(latestWeekCalc.marginPct), rollingAvg: round2(rolling.marginPct),
      status: statusFor('margin', latestWeekCalc.marginPct),
    },
    {
      key: 'inventoryDays', label: 'Inventory days', target: '< 45',
      latest: round2(latestWeekCalc.inventoryDays), rollingAvg: round2(rolling.inventoryDays),
      status: statusFor('inventoryDays', latestWeekCalc.inventoryDays),
    },
    {
      key: 'subsidy', label: 'Delivery subsidy', target: '< 5%',
      latest: round2(latestWeekCalc.subsidyPct), rollingAvg: round2(rolling.subsidyPct),
      status: statusFor('subsidy', latestWeekCalc.subsidyPct),
    },
    {
      key: 'marketing', label: 'Paid marketing (first-order rev)', target: '< 8%',
      latest: round2(latestWeekCalc.marketingPct), rollingAvg: round2(rolling.marketingPct),
      status: statusFor('marketing', latestWeekCalc.marketingPct),
    },
    {
      key: 'reorder', label: 'Reorder rate by day 60', target: '≥ 30%',
      latest: round2(latestReorderRate), rollingAvg: round2(rolling.reorderRatePct),
      status: statusFor('reorder', latestReorderRate),
    },
  ];

  return c.json({
    latestWeek: latestWeek ? { weekStart: latestWeek.weekStart.toISOString().split('T')[0], ...latestWeekCalc } : null,
    latestCohort: latestCohort ? {
      cohortStartDate: latestCohort.cohortStartDate.toISOString().split('T')[0],
      newCustomersInCohort: latestCohort.newCustomersInCohort,
      reorderedCount: latestCohort.reorderedCount,
      reorderRatePct: latestReorderRate,
    } : null,
    guardrails,
  });
});
