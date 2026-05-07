import { Hono } from 'hono';
import { prisma } from '../lib/prisma';

export const superadminRouter = new Hono();

// GET /superadmin/dashboard — aggregate stats across all stores
superadminRouter.get('/dashboard', async (c) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  // Always fetch stores — this must never be blocked by a metrics failure
  const stores = await prisma.store.findMany({ orderBy: { name: 'asc' } });

  // Metrics queries are best-effort: if any fail the stores still appear with zero stats
  const [txTodayResult, txWeekResult, shiftsResult] = await Promise.allSettled([
    prisma.transaction.findMany({
      where: { status: 'COMPLETED', createdAt: { gte: todayStart, lte: todayEnd } },
      select: {
        storeId: true,
        totalAmount: true,
        lineItems: {
          select: {
            itemId: true,
            quantity: true,
            item: { select: { name: true } },
          },
        },
      },
    }),
    prisma.transaction.findMany({
      where: { status: 'COMPLETED', createdAt: { gte: weekStart } },
      select: { storeId: true, totalAmount: true },
    }),
    prisma.shift.findMany({
      where: { endTime: null },
      select: { storeId: true },
    }),
  ]);

  const todayTransactions = txTodayResult.status === 'fulfilled' ? txTodayResult.value : [];
  const weekTransactions  = txWeekResult.status  === 'fulfilled' ? txWeekResult.value  : [];
  const activeShifts      = shiftsResult.status  === 'fulfilled' ? shiftsResult.value  : [];

  // Aggregate per store
  const storeStats = stores.map((store) => {
    const storeToday = todayTransactions.filter(t => t.storeId === store.id);
    const storeWeek = weekTransactions.filter(t => t.storeId === store.id);
    const storeActiveShifts = activeShifts.filter(s => s.storeId === store.id).length;

    const revenueToday = storeToday.reduce((s, t) => s + Number(t.totalAmount), 0);
    const revenueWeek = storeWeek.reduce((s, t) => s + Number(t.totalAmount), 0);
    const transactionsToday = storeToday.length;

    // Top product today
    const productQty = new Map<string, { name: string; qty: number }>();
    storeToday.forEach(t => {
      t.lineItems.forEach(li => {
        const cur = productQty.get(li.itemId) ?? { name: li.item.name, qty: 0 };
        cur.qty += Number(li.quantity);
        productQty.set(li.itemId, cur);
      });
    });
    const topProduct = [...productQty.values()].sort((a, b) => b.qty - a.qty)[0]?.name ?? null;

    return {
      id: store.id,
      name: store.name,
      slug: store.slug,
      isActive: store.isActive,
      revenueToday,
      revenueWeek,
      transactionsToday,
      activeShifts: storeActiveShifts,
      topProduct,
    };
  });

  const totalRevenueToday = storeStats.reduce((s, st) => s + st.revenueToday, 0);
  const totalTransactionsToday = storeStats.reduce((s, st) => s + st.transactionsToday, 0);
  const totalActiveShifts = storeStats.reduce((s, st) => s + st.activeShifts, 0);
  const activeStoreCount = storeStats.filter(st => st.isActive).length;

  return c.json({
    summary: {
      totalRevenueToday,
      totalTransactionsToday,
      activeStores: activeStoreCount,
      totalStores: stores.length,
      activeShifts: totalActiveShifts,
    },
    stores: storeStats,
  });
});
