import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { getStoreContext } from '../middleware/store-context';

export const promosRouter = new Hono();

// List all promos for the store
promosRouter.get('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  const activeOnly = c.req.query('active') === 'true';

  const promos = await prisma.promo.findMany({
    where: {
      ...(storeId ? { storeId } : {}),
      ...(activeOnly ? { isActive: true } : {}),
    },
    include: {
      item: { select: { id: true, name: true, sku: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return c.json(promos);
});

// Create promo
promosRouter.post('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const body = await c.req.json<{
    name: string;
    type: 'PERCENT_OFF' | 'FIXED_OFF' | 'BOGO';
    value: number;
    scope?: 'ALL' | 'CATEGORY' | 'ITEM';
    categoryName?: string;
    itemId?: string;
    minQty?: number;
    minAmount?: number;
    buyQty?: number;
    getQty?: number;
    startDate?: string;
    endDate?: string;
  }>();

  if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400);
  if (body.value == null || body.value < 0) return c.json({ error: 'value must be >= 0' }, 400);
  if (body.scope === 'CATEGORY' && !body.categoryName) return c.json({ error: 'categoryName required for CATEGORY scope' }, 400);
  if (body.scope === 'ITEM' && !body.itemId) return c.json({ error: 'itemId required for ITEM scope' }, 400);
  if (body.type === 'BOGO' && (!body.buyQty || !body.getQty)) return c.json({ error: 'buyQty and getQty required for BOGO' }, 400);

  const promo = await prisma.promo.create({
    data: {
      storeId,
      name: body.name.trim(),
      type: body.type,
      value: body.value,
      scope: body.scope ?? 'ALL',
      categoryName: body.categoryName ?? null,
      itemId: body.itemId ?? null,
      minQty: body.minQty ?? 1,
      minAmount: body.minAmount ?? 0,
      buyQty: body.buyQty ?? null,
      getQty: body.getQty ?? null,
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
    },
    include: { item: { select: { id: true, name: true, sku: true } } },
  });

  return c.json(promo, 201);
});

// Update promo
promosRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    name?: string;
    value?: number;
    minQty?: number;
    minAmount?: number;
    startDate?: string | null;
    endDate?: string | null;
    isActive?: boolean;
  }>();

  const promo = await prisma.promo.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.value !== undefined && { value: body.value }),
      ...(body.minQty !== undefined && { minQty: body.minQty }),
      ...(body.minAmount !== undefined && { minAmount: body.minAmount }),
      ...(body.startDate !== undefined && { startDate: body.startDate ? new Date(body.startDate) : null }),
      ...(body.endDate !== undefined && { endDate: body.endDate ? new Date(body.endDate) : null }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
    include: { item: { select: { id: true, name: true, sku: true } } },
  });

  return c.json(promo);
});

// Delete promo
promosRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await prisma.promo.delete({ where: { id } });
  return c.json({ ok: true });
});

// Apply — given cart lines, return which promos apply and what the discounted prices are
promosRouter.post('/apply', async (c) => {
  const { storeId } = await getStoreContext(c);
  const body = await c.req.json<{
    lines: Array<{ itemId: string; category: string; quantity: number; price: number }>;
    cartTotal: number;
  }>();

  const now = new Date();
  const promos = await prisma.promo.findMany({
    where: {
      ...(storeId ? { storeId } : {}),
      isActive: true,
      OR: [{ startDate: null }, { startDate: { lte: now } }],
      AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
    },
    include: { item: { select: { id: true, name: true } } },
  });

  const results: Array<{
    promoId: string;
    promoName: string;
    type: string;
    appliedToLineIndex: number;
    discountedPrice: number;
    saving: number;
  }> = [];

  for (const promo of promos) {
    for (let i = 0; i < body.lines.length; i++) {
      const line = body.lines[i];

      // Scope check
      if (promo.scope === 'ITEM' && promo.itemId !== line.itemId) continue;
      if (promo.scope === 'CATEGORY' && promo.categoryName !== line.category) continue;

      // MinQty / minAmount check
      if (line.quantity < promo.minQty) continue;
      if (Number(promo.minAmount) > 0 && body.cartTotal < Number(promo.minAmount)) continue;

      if (promo.type === 'PERCENT_OFF') {
        const discountedPrice = line.price * (1 - Number(promo.value));
        results.push({
          promoId: promo.id,
          promoName: promo.name,
          type: promo.type,
          appliedToLineIndex: i,
          discountedPrice,
          saving: (line.price - discountedPrice) * line.quantity,
        });
      } else if (promo.type === 'FIXED_OFF') {
        const discountedPrice = Math.max(0, line.price - Number(promo.value));
        results.push({
          promoId: promo.id,
          promoName: promo.name,
          type: promo.type,
          appliedToLineIndex: i,
          discountedPrice,
          saving: Number(promo.value) * line.quantity,
        });
      } else if (promo.type === 'BOGO') {
        const buyQty = promo.buyQty ?? 1;
        const getQty = promo.getQty ?? 1;
        if (line.quantity >= buyQty + getQty) {
          const freeUnits = Math.floor(line.quantity / (buyQty + getQty)) * getQty;
          const paidUnits = line.quantity - freeUnits;
          const effectivePrice = (line.price * paidUnits) / line.quantity;
          results.push({
            promoId: promo.id,
            promoName: promo.name,
            type: promo.type,
            appliedToLineIndex: i,
            discountedPrice: effectivePrice,
            saving: line.price * freeUnits,
          });
        }
      }
    }
  }

  return c.json(results);
});
