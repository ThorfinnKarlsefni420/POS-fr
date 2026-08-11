import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { getStoreContext } from '../middleware/store-context';

export const supplierItemsRouter = new Hono();

// List purchasing terms, filtered by supplierId and/or itemId
supplierItemsRouter.get('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const supplierId = c.req.query('supplierId');
  const itemId = c.req.query('itemId');

  const rows = await prisma.supplierItem.findMany({
    where: {
      ...(supplierId ? { supplierId } : {}),
      ...(itemId ? { itemId } : {}),
      supplier: { storeId },
    },
    include: {
      item: { select: { id: true, name: true, sku: true, unit: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return c.json(rows);
});

// Create or update the terms for a (supplier, item) pair — upsert, since the
// natural key is the pairing itself, not a separately-chosen id.
supplierItemsRouter.post('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const body = await c.req.json<{
    supplierId: string;
    itemId: string;
    supplierSku?: string;
    minOrderQty?: number | null;
    orderMultiple?: number | null;
    leadTimeDays?: number | null;
    isPreferred?: boolean;
  }>();

  if (!body.supplierId || !body.itemId) {
    return c.json({ error: 'supplierId and itemId are required' }, 400);
  }

  const [supplier, item] = await Promise.all([
    prisma.supplier.findUnique({ where: { id: body.supplierId }, select: { storeId: true } }),
    prisma.item.findUnique({ where: { id: body.itemId }, select: { storeId: true } }),
  ]);
  if (!supplier || supplier.storeId !== storeId) return c.json({ error: 'Supplier not found' }, 404);
  if (!item || item.storeId !== storeId) return c.json({ error: 'Item not found' }, 404);

  const row = await prisma.supplierItem.upsert({
    where: { supplierId_itemId: { supplierId: body.supplierId, itemId: body.itemId } },
    create: {
      supplierId: body.supplierId,
      itemId: body.itemId,
      supplierSku: body.supplierSku ?? null,
      minOrderQty: body.minOrderQty ?? null,
      orderMultiple: body.orderMultiple ?? null,
      leadTimeDays: body.leadTimeDays ?? null,
      isPreferred: body.isPreferred ?? false,
    },
    update: {
      ...(body.supplierSku !== undefined && { supplierSku: body.supplierSku }),
      ...(body.minOrderQty !== undefined && { minOrderQty: body.minOrderQty }),
      ...(body.orderMultiple !== undefined && { orderMultiple: body.orderMultiple }),
      ...(body.leadTimeDays !== undefined && { leadTimeDays: body.leadTimeDays }),
      ...(body.isPreferred !== undefined && { isPreferred: body.isPreferred }),
    },
    include: { item: { select: { id: true, name: true, sku: true, unit: true } } },
  });

  return c.json(row, 201);
});

supplierItemsRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    supplierSku?: string | null;
    minOrderQty?: number | null;
    orderMultiple?: number | null;
    leadTimeDays?: number | null;
    isPreferred?: boolean;
  }>();

  const existing = await prisma.supplierItem.findUnique({ where: { id } });
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const row = await prisma.supplierItem.update({
    where: { id },
    data: {
      ...(body.supplierSku !== undefined && { supplierSku: body.supplierSku }),
      ...(body.minOrderQty !== undefined && { minOrderQty: body.minOrderQty }),
      ...(body.orderMultiple !== undefined && { orderMultiple: body.orderMultiple }),
      ...(body.leadTimeDays !== undefined && { leadTimeDays: body.leadTimeDays }),
      ...(body.isPreferred !== undefined && { isPreferred: body.isPreferred }),
    },
    include: { item: { select: { id: true, name: true, sku: true, unit: true } } },
  });

  return c.json(row);
});

supplierItemsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await prisma.supplierItem.findUnique({ where: { id } });
  if (!existing) return c.json({ error: 'Not found' }, 404);
  await prisma.supplierItem.delete({ where: { id } });
  return c.json({ ok: true });
});
