import { Hono } from 'hono';
import { prisma } from '../lib/prisma';

export const storesRouter = new Hono();

// GET /stores — list all stores
storesRouter.get('/', async (c) => {
  const stores = await prisma.store.findMany({
    orderBy: { name: 'asc' },
  });
  return c.json(stores);
});

// POST /stores — create a new store
storesRouter.post('/', async (c) => {
  const body = await c.req.json<{
    name: string;
    slug: string;
    ownerName?: string;
    phone?: string;
    email?: string;
    address?: string;
  }>();

  if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400);
  if (!body.slug?.trim()) return c.json({ error: 'slug is required' }, 400);

  const existing = await prisma.store.findUnique({ where: { slug: body.slug } });
  if (existing) return c.json({ error: 'slug already in use' }, 409);

  const store = await prisma.store.create({
    data: {
      name: body.name.trim(),
      slug: body.slug.trim(),
      ownerName: body.ownerName ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      address: body.address ?? null,
    },
  });

  return c.json(store, 201);
});

// PATCH /stores/:id — update a store
storesRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    name?: string;
    slug?: string;
    ownerName?: string;
    phone?: string;
    email?: string;
    address?: string;
    isActive?: boolean;
  }>();

  const store = await prisma.store.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.slug !== undefined && { slug: body.slug }),
      ...(body.ownerName !== undefined && { ownerName: body.ownerName }),
      ...(body.phone !== undefined && { phone: body.phone }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.address !== undefined && { address: body.address }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  });

  return c.json(store);
});

// GET /stores/:id/stats — quick stats for a store
storesRouter.get('/:id/stats', async (c) => {
  const storeId = c.req.param('id');

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  const [todayTx, weekTx, activeShifts] = await Promise.all([
    prisma.transaction.findMany({
      where: { storeId, status: 'COMPLETED', createdAt: { gte: todayStart, lte: todayEnd } },
      select: { totalAmount: true, lineItems: { include: { item: { select: { name: true } } } } },
    }),
    prisma.transaction.findMany({
      where: { storeId, status: 'COMPLETED', createdAt: { gte: weekStart } },
      select: { totalAmount: true },
    }),
    prisma.shift.count({ where: { storeId, endTime: null } }),
  ]);

  const revenueToday = todayTx.reduce((s, t) => s + Number(t.totalAmount), 0);
  const revenueWeek = weekTx.reduce((s, t) => s + Number(t.totalAmount), 0);
  const transactionsToday = todayTx.length;

  // Top product today by quantity
  const productQty = new Map<string, { name: string; qty: number }>();
  todayTx.forEach(t => {
    t.lineItems.forEach(li => {
      const cur = productQty.get(li.itemId) ?? { name: li.item.name, qty: 0 };
      cur.qty += Number(li.quantity);
      productQty.set(li.itemId, cur);
    });
  });
  const topProduct = [...productQty.values()].sort((a, b) => b.qty - a.qty)[0]?.name ?? null;

  return c.json({
    storeId,
    revenueToday,
    revenueWeek,
    transactionsToday,
    activeShifts,
    topProduct,
  });
});

// DELETE /stores/:id — hard-delete a store and all its data (used by tests + admin)
storesRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const store = await prisma.store.findUnique({ where: { id } });
  if (!store) return c.json({ error: 'Store not found' }, 404);

  // Must delete in FK-dependency order (no cascade defined in schema)
  const shifts   = await prisma.shift.findMany({ where: { storeId: id }, select: { id: true } });
  const shiftIds = shifts.map((s) => s.id);
  const txs      = await prisma.transaction.findMany({ where: { storeId: id }, select: { id: true } });
  const txIds    = txs.map((t) => t.id);
  const items    = await prisma.item.findMany({ where: { storeId: id }, select: { id: true } });
  const itemIds  = items.map((i) => i.id);

  await prisma.vendorPayment.deleteMany({ where: { creditSale: { transactionId: { in: txIds } } } });
  await prisma.creditSale.deleteMany({ where: { transactionId: { in: txIds } } });
  // ConsignmentSale → LineItem → Transaction (must go before lineItem)
  await prisma.consignmentSale.deleteMany({ where: { lineItem: { transactionId: { in: txIds } } } });
  await prisma.lineItem.deleteMany({ where: { transactionId: { in: txIds } } });
  await prisma.transaction.deleteMany({ where: { storeId: id } });
  await prisma.cashLog.deleteMany({ where: { shiftId: { in: shiftIds } } });
  await prisma.shift.deleteMany({ where: { storeId: id } });
  await prisma.inventoryAdjustment.deleteMany({ where: { itemId: { in: itemIds } } });
  await prisma.item.deleteMany({ where: { storeId: id } });
  await prisma.storeSetting.deleteMany({ where: { storeId: id } });
  await prisma.vendor.deleteMany({ where: { storeId: id } });
  // ConsignmentSettlement → Supplier (must go before supplier)
  await prisma.consignmentSettlement.deleteMany({ where: { storeId: id } });
  await prisma.supplier.deleteMany({ where: { storeId: id } });
  await prisma.user.deleteMany({ where: { storeId: id } });
  await prisma.store.delete({ where: { id } });

  return c.json({ ok: true });
});
