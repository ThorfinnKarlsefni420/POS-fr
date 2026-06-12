import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { getStoreContext } from '../middleware/store-context';

export const superadminRouter = new Hono();

// Guard — all superadmin routes require SUPERADMIN role
superadminRouter.use('*', async (c, next) => {
  const { role } = await getStoreContext(c);
  if (role !== 'SUPERADMIN') return c.json({ error: 'Forbidden' }, 403);
  return next();
});

// GET /superadmin/consignment/pending — aggregate all pending payouts across all stores
superadminRouter.get('/consignment/pending', async (c) => {
  const pendingSales = await prisma.consignmentSale.findMany({
    where: { status: 'PENDING' },
    include: {
      supplier: { include: { store: { select: { name: true } } } },
      lineItem: { include: { item: { select: { name: true } } } },
    },
  });

  const grouped = pendingSales.reduce((acc, sale) => {
    const storeId = sale.supplier.storeId;
    if (!acc[storeId]) {
      acc[storeId] = {
        storeName: sale.supplier.store.name,
        totalPayout: 0,
        salesCount: 0,
      };
    }
    acc[storeId].totalPayout += Number(sale.payoutAmount);
    acc[storeId].salesCount += 1;
    return acc;
  }, {} as Record<string, any>);

  return c.json({
    stores: Object.values(grouped),
    totalPendingPayout: pendingSales.reduce((sum, s) => sum + Number(s.payoutAmount), 0),
  });
});

// GET /superadmin/dashboard — aggregate stats across all stores
superadminRouter.get('/dashboard', async (c) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  const stores = await prisma.store.findMany({ orderBy: { name: 'asc' } });

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

  const storeStats = stores.map((store) => {
    const storeToday = todayTransactions.filter(t => t.storeId === store.id);
    const storeWeek  = weekTransactions.filter(t => t.storeId === store.id);
    const storeActiveShifts = activeShifts.filter(s => s.storeId === store.id).length;

    const revenueToday       = storeToday.reduce((s, t) => s + Number(t.totalAmount), 0);
    const revenueWeek        = storeWeek.reduce((s, t) => s + Number(t.totalAmount), 0);
    const transactionsToday  = storeToday.length;

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

  return c.json({
    summary: {
      totalRevenueToday:        storeStats.reduce((s, st) => s + st.revenueToday, 0),
      totalTransactionsToday:   storeStats.reduce((s, st) => s + st.transactionsToday, 0),
      activeStores:             storeStats.filter(st => st.isActive).length,
      totalStores:              stores.length,
      activeShifts:             storeStats.reduce((s, st) => s + st.activeShifts, 0),
    },
    stores: storeStats,
  });
});

// GET /superadmin/inventory — unique products across all stores (deduplicated by name)
superadminRouter.get('/inventory', async (c) => {
  const storeIdFilter = c.req.query('storeId');
  const search = c.req.query('search');

  const items = await prisma.item.findMany({
    where: {
      ...(storeIdFilter ? { storeId: storeIdFilter } : {}),
      ...(search
        ? { OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
            { category: { contains: search, mode: 'insensitive' } },
          ] }
        : {}),
    },
    include: { store: { select: { id: true, name: true } } },
    orderBy: [{ store: { name: 'asc' } }, { category: 'asc' }, { name: 'asc' }],
  });

  type MappedItem = {
    id: string; name: string; sku: string; category: string; subCategory: string;
    unit: string; costPrice: number; sellingPrice: number; nomadBitePrice: number;
    taxRate: number; currentStock: number; imageUrl: string | null;
    storeId: string; storeName: string; storeCount: number;
  };

  const grouped = new Map<string, MappedItem>();

  for (const item of items) {
    const key = item.name.toLowerCase().trim();
    const mapped: MappedItem = {
      id: item.id,
      name: item.name,
      sku: item.sku,
      category: item.category,
      subCategory: item.subCategory ?? '',
      unit: item.unit,
      costPrice: Number(item.costPrice),
      sellingPrice: Number(item.sellingPrice),
      nomadBitePrice: Number(item.nomadBitePrice),
      taxRate: Number(item.taxRate),
      currentStock: Number(item.currentStock),
      imageUrl: item.imageUrl ?? null,
      storeId: item.store.id,
      storeName: item.store.name,
      storeCount: 1,
    };

    if (!grouped.has(key)) {
      grouped.set(key, mapped);
    } else {
      const ex = grouped.get(key)!;
      // Prefer the representative that already has an image
      const rep = !ex.imageUrl && mapped.imageUrl ? mapped : ex;
      grouped.set(key, {
        ...rep,
        currentStock: ex.currentStock + mapped.currentStock,
        storeCount: ex.storeCount + 1,
      });
    }
  }

  return c.json([...grouped.values()]);
});

// POST /superadmin/broadcast-image — set imageUrl on all items sharing the same name
superadminRouter.post('/broadcast-image', async (c) => {
  const body = await c.req.json<{ name: string; imageUrl: string }>();
  if (!body.name?.trim() || !body.imageUrl?.trim()) {
    return c.json({ error: 'name and imageUrl are required' }, 400);
  }
  const result = await prisma.item.updateMany({
    where: { name: { equals: body.name.trim(), mode: 'insensitive' } },
    data: { imageUrl: body.imageUrl.trim() },
  });
  return c.json({ updated: result.count });
});

// GET /superadmin/settings — global settings (markup % + cloudinary config)
superadminRouter.get('/settings', async (c) => {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: ['globalMarkupPercent', 'cloudinaryCloudName', 'cloudinaryUploadPreset'] } },
  });
  const get = (key: string) => rows.find((r) => r.key === key)?.value;
  return c.json({
    globalMarkupPercent:   get('globalMarkupPercent') !== undefined ? Number(get('globalMarkupPercent')) : 16.5,
    cloudinaryCloudName:   get('cloudinaryCloudName')   ?? '',
    cloudinaryUploadPreset: get('cloudinaryUploadPreset') ?? '',
  });
});

// POST /superadmin/settings — save global settings
superadminRouter.post('/settings', async (c) => {
  const body = await c.req.json<{
    globalMarkupPercent?: number;
    cloudinaryCloudName?: string;
    cloudinaryUploadPreset?: string;
  }>();

  if (body.globalMarkupPercent !== undefined) {
    const val = Number(body.globalMarkupPercent);
    if (isNaN(val) || val < 0 || val > 1000) {
      return c.json({ error: 'globalMarkupPercent must be a number between 0 and 1000' }, 400);
    }
    await prisma.systemSetting.upsert({
      where: { key: 'globalMarkupPercent' },
      update: { value: String(val) },
      create: { key: 'globalMarkupPercent', value: String(val) },
    });
  }

  for (const key of ['cloudinaryCloudName', 'cloudinaryUploadPreset'] as const) {
    if (body[key] !== undefined) {
      await prisma.systemSetting.upsert({
        where:  { key },
        update: { value: body[key]! },
        create: { key, value: body[key]! },
      });
    }
  }

  return c.json({ ok: true });
});

// POST /superadmin/set-vendor-prices — set sellingPrice = costPrice × (1 + markup%) with optional rounding
superadminRouter.post('/set-vendor-prices', async (c) => {
  const body = await c.req.json<{ markupPercent: number; roundTo?: number; onlyUnset?: boolean }>();
  const { markupPercent, roundTo = 0, onlyUnset = false } = body;
  if (isNaN(markupPercent) || markupPercent < 0) {
    return c.json({ error: 'markupPercent is required and must be >= 0' }, 400);
  }

  const allItems = await prisma.item.findMany({
    where: {
      costPrice: { gt: 0 },
      ...(onlyUnset ? { sellingPrice: { lte: 0 } } : {}),
    },
    select: { id: true, costPrice: true },
  });

  const CHUNK = 200;
  let updated = 0;
  for (let i = 0; i < allItems.length; i += CHUNK) {
    const chunk = allItems.slice(i, i + CHUNK);
    await Promise.all(chunk.map((item) => {
      let price = Number(item.costPrice) * (1 + markupPercent / 100);
      if (roundTo > 0) price = Math.ceil(price / roundTo) * roundTo;
      else price = Math.round(price * 100) / 100;
      return prisma.item.update({ where: { id: item.id }, data: { sellingPrice: price } });
    }));
    updated += chunk.length;
  }
  return c.json({ updated });
});

// POST /superadmin/recalculate-prices — apply global markup to ALL items across ALL stores
superadminRouter.post('/recalculate-prices', async (c) => {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'globalMarkupPercent' } });
  const markupPercent = row ? Number(row.value) : 16.5;

  const result = await prisma.$executeRaw`
    UPDATE "Item"
    SET "nomadBitePrice" = ROUND(CAST("sellingPrice" * (1 + ${markupPercent} / 100.0) AS NUMERIC), 2)
    WHERE "sellingPrice" > 0
  `;

  return c.json({ updated: result, markupPercent });
});
