import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { prisma } from '../lib/prisma';
import { getStoreContext } from '../middleware/store-context';

export const productsRouter = new Hono();

// List all items
productsRouter.get('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  const items = await prisma.item.findMany({
    where: storeId ? { storeId } : {},
    orderBy: { category: 'asc' },
  });
  return c.json(items);
});

// Get single item
productsRouter.get('/:id', async (c) => {
  const item = await prisma.item.findUnique({ where: { id: c.req.param('id') } });
  if (!item) return c.json({ error: 'Not found' }, 404);
  return c.json(item);
});

// Create item
productsRouter.post('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);
  const body = await c.req.json();
  const item = await prisma.item.create({
    data: {
      storeId,
      name: body.name,
      sku: body.sku,
      category: body.category ?? '',
      subCategory: body.subCategory ?? '',
      unit: body.unit ?? '',
      boxQty: body.boxQty ?? '',
      costPrice: body.costPrice ?? 0,
      nomadBitePrice: body.nomadBitePrice ?? 0,
      taxRate: body.taxRate ?? 0,
      isFractional: body.isFractional ?? false,
      currentStock: body.currentStock ?? 0,
      description: body.description,
      notes: body.notes,
      imageUrl: body.imageUrl,
      manufacturingDate: body.manufacturingDate ? new Date(body.manufacturingDate) : null,
      expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
    },
  });
  return c.json(item, 201);
});

// Update item
productsRouter.patch('/:id', async (c) => {
  const body = await c.req.json();
  const item = await prisma.item.update({
    where: { id: c.req.param('id') },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.sku !== undefined && { sku: body.sku }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.subCategory !== undefined && { subCategory: body.subCategory }),
      ...(body.unit !== undefined && { unit: body.unit }),
      ...(body.boxQty !== undefined && { boxQty: body.boxQty }),
      ...(body.costPrice !== undefined && { costPrice: Number(body.costPrice) }),
      ...(body.nomadBitePrice !== undefined && { nomadBitePrice: Number(body.nomadBitePrice) }),
      ...(body.taxRate !== undefined && { taxRate: Number(body.taxRate) }),
      ...(body.isFractional !== undefined && { isFractional: body.isFractional }),
      ...(body.currentStock !== undefined && { currentStock: Number(body.currentStock) }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl }),
      ...(body.manufacturingDate !== undefined && {
        manufacturingDate: body.manufacturingDate ? new Date(body.manufacturingDate) : null,
      }),
      ...(body.expiryDate !== undefined && {
        expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
      }),
    },
  });
  return c.json(item);
});

// Delete item
productsRouter.delete('/:id', async (c) => {
  await prisma.item.delete({ where: { id: c.req.param('id') } });
  return c.json({ ok: true });
});

// Bulk import — upsert by SKU
productsRouter.post(
  '/import',
  bodyLimit({ maxSize: 20 * 1024 * 1024 }), // 20 MB — enough for ~50k items
  async (c) => {
    const { storeId } = await getStoreContext(c);
    if (!storeId) return c.json({ error: 'storeId required' }, 400);

    const body = await c.req.json<{ products: Array<Record<string, unknown>>; replace?: boolean }>();

    if (body.replace) {
      await prisma.inventoryAdjustment.deleteMany({ where: { item: { storeId } } });
      await prisma.lineItem.deleteMany({ where: { item: { storeId } } });
      await prisma.item.deleteMany({ where: { storeId } });
    }

    const toRow = (p: Record<string, unknown>) => ({
      storeId,
      name: String(p.name),
      sku: String(p.sku),
      category: String(p.category ?? ''),
      subCategory: String(p.subCategory ?? ''),
      unit: String(p.unit ?? ''),
      boxQty: String(p.boxQty ?? ''),
      costPrice: Number(p.costPrice ?? 0),
      nomadBitePrice: Number(p.nomadBitePrice ?? 0),
      taxRate: Number(p.taxRate ?? 0),
      isFractional: Boolean(p.isFractional),
      currentStock: Number(p.currentStock ?? 0),
      notes: p.notes ? String(p.notes) : null,
      imageUrl: p.imageUrl ? String(p.imageUrl) : null,
      manufacturingDate: p.manufacturingDate ? new Date(String(p.manufacturingDate)) : null,
      expiryDate: p.expiryDate ? new Date(String(p.expiryDate)) : null,
    });

    let succeeded = 0;
    let failed = 0;

    if (body.replace) {
      // After full delete, bulk-insert in chunks
      const CHUNK = 500;
      for (let i = 0; i < body.products.length; i += CHUNK) {
        try {
          const result = await prisma.item.createMany({
            data: body.products.slice(i, i + CHUNK).map(toRow),
            skipDuplicates: true,
          });
          succeeded += result.count;
        } catch {
          failed += Math.min(CHUNK, body.products.length - i);
        }
      }
    } else {
      // Upsert path: small chunks to avoid saturating the connection pool
      const CHUNK = 25;
      for (let i = 0; i < body.products.length; i += CHUNK) {
        const chunk = body.products.slice(i, i + CHUNK);
        const results = await Promise.allSettled(
          chunk.map((p) => {
            const row = toRow(p);
            return prisma.item.upsert({
              where: { storeId_sku: { storeId, sku: row.sku } },
              update: row,
              create: row,
            });
          })
        );
        succeeded += results.filter((r) => r.status === 'fulfilled').length;
        failed += results.filter((r) => r.status === 'rejected').length;
      }
    }

    return c.json({ succeeded, failed });
  }
);

// Adjust stock
productsRouter.post('/:id/adjust', async (c) => {
  const body = await c.req.json<{ delta: number; reasonCode: string; note?: string }>();
  const item = await prisma.item.update({
    where: { id: c.req.param('id') },
    data: { currentStock: { increment: body.delta } },
  });
  await prisma.inventoryAdjustment.create({
    data: {
      itemId: c.req.param('id'),
      quantity: body.delta,
      reasonCode: body.reasonCode as never,
      note: body.note,
    },
  });
  return c.json(item);
});
