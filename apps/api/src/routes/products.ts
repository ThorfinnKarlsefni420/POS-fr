import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { prisma } from '../lib/prisma';
import { getStoreContext } from '../middleware/store-context';
import { resolveVatClass, VatClassData } from '../lib/vat-engine';

export const productsRouter = new Hono();

// Load all CategoryVat rows once and return a category → effective etimsCode map
async function loadCatVatMap() {
  const rows = await prisma.categoryVat.findMany({
    include: { vatClass: { select: { id: true, code: true, rate: true, etimsCode: true } } },
  });
  return new Map(rows.map((r) => [r.category, r.vatClass]));
}

function toVc(vc: { id: string; code: string; rate: unknown; etimsCode: string } | null): VatClassData | null {
  if (!vc) return null;
  return { id: vc.id, code: vc.code as VatClassData['code'], rate: Number(vc.rate), etimsCode: vc.etimsCode };
}

function withEtimsCode<T extends { category: string; vatClass: { id: string; code: string; rate: unknown; etimsCode: string } | null }>(
  item: T,
  catVatMap: Map<string, { id: string; code: string; rate: unknown; etimsCode: string } | null>,
): Omit<T, 'vatClass'> & { etimsCode: string } {
  const vc = resolveVatClass(toVc(item.vatClass), toVc(catVatMap.get(item.category) ?? null));
  const { vatClass: _vc, ...rest } = item;
  return { ...rest, etimsCode: vc.etimsCode };
}

const TIER_SELECT = {
  id: true, name: true, level: true, quantityInBase: true,
  costPrice: true, sellingPriceOverride: true, barcode: true, isBaseUnit: true,
};

// List all items
productsRouter.get('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  const [items, catVatMap] = await Promise.all([
    prisma.item.findMany({
      where: storeId ? { storeId } : {},
      include: {
        vatClass: { select: { id: true, code: true, rate: true, etimsCode: true } },
        packagingTiers: { select: TIER_SELECT, orderBy: { level: 'asc' } },
      },
      orderBy: { category: 'asc' },
    }),
    loadCatVatMap(),
  ]);
  return c.json(items.map((item) => withEtimsCode(item, catVatMap)));
});

// VAT pending — items flagged for manual classification review
productsRouter.get('/vat-pending', async (c) => {
  const { storeId } = await getStoreContext(c);
  const [items, catVatMap] = await Promise.all([
    prisma.item.findMany({
      where: { needsVatConfirmation: true, ...(storeId ? { storeId } : {}) },
      include: { vatClass: { select: { id: true, code: true, rate: true, etimsCode: true } } },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    }),
    loadCatVatMap(),
  ]);

  const VAT_CLASSES = {
    standard: { id: 'vatcls_standard', label: 'Standard 16%', etimsCode: 'VAT' },
    zero:     { id: 'vatcls_zero',     label: 'Zero-Rated',   etimsCode: 'ZERO' },
    exempt:   { id: 'vatcls_exempt',   label: 'Exempt',       etimsCode: 'NONTAXABLE' },
  };

  return c.json(items.map((item) => {
    const catVc = toVc(catVatMap.get(item.category) ?? null);
    const effectiveVc = resolveVatClass(toVc(item.vatClass), catVc);

    // Derive flag reason + suggested class from name/category patterns
    const name = item.name.toLowerCase();
    const cat  = item.category.toLowerCase();
    let flagReason = 'Requires VAT classification review';
    let suggested  = VAT_CLASSES.standard;

    if (cat === 'water') {
      flagReason = 'Bottled/mineral/sparkling water is Standard 16% — tap/natural water is Exempt';
      suggested  = VAT_CLASSES.standard;
    } else if (cat === 'cakes & baked goods' && (name.includes('bread') || name.includes('loaf'))) {
      flagReason = 'Plain ordinary bread is Zero-Rated — cakes/pastries/buns remain Standard 16%';
      suggested  = VAT_CLASSES.zero;
    } else if (cat === 'dairy & milk') {
      flagReason = 'Flavoured milk drinks and yoghurt may be Standard 16% — fresh milk is Zero-Rated';
      suggested  = VAT_CLASSES.standard;
    }

    const { vatClass: _vc, ...rest } = item;
    return {
      ...rest,
      etimsCode:          effectiveVc.etimsCode,
      currentVatLabel:    effectiveVc.code === 'STANDARD' ? 'Standard 16%' : effectiveVc.code === 'ZERO' ? 'Zero-Rated' : 'Exempt',
      currentEtimsCode:   effectiveVc.etimsCode,
      flagReason,
      suggestedVatClassId: suggested.id,
      suggestedEtimsCode:  suggested.etimsCode,
      suggestedLabel:      suggested.label,
    };
  }));
});

// Get single item
productsRouter.get('/:id', async (c) => {
  const [item, catVatMap] = await Promise.all([
    prisma.item.findUnique({
      where: { id: c.req.param('id') },
      include: {
        vatClass: { select: { id: true, code: true, rate: true, etimsCode: true } },
        packagingTiers: { select: TIER_SELECT, orderBy: { level: 'asc' } },
      },
    }),
    loadCatVatMap(),
  ]);
  if (!item) return c.json({ error: 'Not found' }, 404);
  return c.json(withEtimsCode(item, catVatMap));
});

// ── Packaging Tier CRUD ───────────────────────────────────────────────────────

// List tiers for an item
productsRouter.get('/:id/packaging', async (c) => {
  const id = c.req.param('id');
  const existing = await prisma.item.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return c.json({ error: 'Item not found' }, 404);
  const tiers = await prisma.packagingTier.findMany({
    where: { itemId: id },
    orderBy: { level: 'asc' },
  });
  return c.json(tiers);
});

// Create a tier
productsRouter.post('/:id/packaging', async (c) => {
  const id = c.req.param('id');
  const existing = await prisma.item.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return c.json({ error: 'Item not found' }, 404);
  const body = await c.req.json();
  if (!body.name || body.level === undefined || body.quantityInBase === undefined) {
    return c.json({ error: 'name, level, and quantityInBase are required' }, 400);
  }
  // If this tier is being marked as base unit, clear isBaseUnit on all others first
  if (body.isBaseUnit) {
    await prisma.packagingTier.updateMany({ where: { itemId: id }, data: { isBaseUnit: false } });
  }
  const tier = await prisma.packagingTier.create({
    data: {
      itemId: id,
      name: body.name,
      level: Number(body.level),
      quantityInBase: Number(body.quantityInBase),
      costPrice: Number(body.costPrice ?? 0),
      sellingPriceOverride: body.sellingPriceOverride != null ? Number(body.sellingPriceOverride) : null,
      barcode: body.barcode ?? null,
      isBaseUnit: Boolean(body.isBaseUnit ?? false),
    },
  });
  return c.json(tier, 201);
});

// Update a tier
productsRouter.patch('/:id/packaging/:tierId', async (c) => {
  const { id, tierId } = c.req.param();
  const existing = await prisma.packagingTier.findUnique({ where: { id: tierId } });
  if (!existing || existing.itemId !== id) return c.json({ error: 'Tier not found' }, 404);
  const body = await c.req.json();
  if (body.isBaseUnit) {
    await prisma.packagingTier.updateMany({ where: { itemId: id, id: { not: tierId } }, data: { isBaseUnit: false } });
  }
  const tier = await prisma.packagingTier.update({
    where: { id: tierId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.level !== undefined && { level: Number(body.level) }),
      ...(body.quantityInBase !== undefined && { quantityInBase: Number(body.quantityInBase) }),
      ...(body.costPrice !== undefined && { costPrice: Number(body.costPrice) }),
      ...(body.sellingPriceOverride !== undefined && {
        sellingPriceOverride: body.sellingPriceOverride !== null ? Number(body.sellingPriceOverride) : null,
      }),
      ...(body.barcode !== undefined && { barcode: body.barcode }),
      ...(body.isBaseUnit !== undefined && { isBaseUnit: Boolean(body.isBaseUnit) }),
    },
  });
  return c.json(tier);
});

// Delete a tier
productsRouter.delete('/:id/packaging/:tierId', async (c) => {
  const { id, tierId } = c.req.param();
  const existing = await prisma.packagingTier.findUnique({ where: { id: tierId } });
  if (!existing || existing.itemId !== id) return c.json({ error: 'Tier not found' }, 404);
  await prisma.packagingTier.delete({ where: { id: tierId } });
  return c.json({ ok: true });
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
      sellingPrice: body.sellingPrice ?? 0,
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
  const id = c.req.param('id');

  const existing = await prisma.item.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return c.json({ error: 'Item not found' }, 404);

  const body = await c.req.json();
  const item = await prisma.item.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.sku !== undefined && { sku: body.sku }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.subCategory !== undefined && { subCategory: body.subCategory }),
      ...(body.unit !== undefined && { unit: body.unit }),
      ...(body.boxQty !== undefined && { boxQty: body.boxQty }),
      ...(body.costPrice !== undefined && { costPrice: Number(body.costPrice) }),
      ...(body.sellingPrice !== undefined && { sellingPrice: Number(body.sellingPrice) }),
      ...(body.nomadBitePrice !== undefined && { nomadBitePrice: Number(body.nomadBitePrice) }),
      ...(body.taxRate !== undefined && { taxRate: Number(body.taxRate) }),
      ...(body.vatClassId !== undefined && {
        vatClassId: body.vatClassId,
        // Keep legacy taxRate in sync so old code reading it stays consistent
        taxRate: ({ vatcls_standard: 16, vatcls_zero: 0, vatcls_exempt: 0 } as Record<string, number>)[body.vatClassId] ?? 0,
      }),
      ...(body.vatOverrideReason !== undefined && { vatOverrideReason: body.vatOverrideReason }),
      ...(body.needsVatConfirmation !== undefined && { needsVatConfirmation: Boolean(body.needsVatConfirmation) }),
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
      ...(body.description !== undefined && { description: body.description }),
      ...(body.barcode !== undefined && { barcode: body.barcode || null }),
      ...(body.supplierName !== undefined && { supplierName: body.supplierName || null }),
      ...(body.supplierPhone !== undefined && { supplierPhone: body.supplierPhone || null }),
      ...(body.leadTimeDays !== undefined && { leadTimeDays: body.leadTimeDays !== '' ? Number(body.leadTimeDays) : null }),
      ...(body.reorderPoint !== undefined && { reorderPoint: body.reorderPoint !== '' ? Number(body.reorderPoint) : null }),
      ...(body.reorderQty !== undefined && { reorderQty: body.reorderQty !== '' ? Number(body.reorderQty) : null }),
    },
  });
  return c.json(item);
});

// Stock breakdown — convert qty of one item into another (e.g. 1×20L oil → 20×1L bottles)
productsRouter.post('/breakdown', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const body = await c.req.json<{
    sourceId: string;
    sourceQty: number;
    targetId: string;
    unitsPerSource: number;
    notes?: string;
  }>();

  const { sourceId, sourceQty, targetId, unitsPerSource } = body;
  if (!sourceId || !targetId || !(sourceQty > 0) || !(unitsPerSource > 0)) {
    return c.json({ error: 'sourceId, targetId, sourceQty > 0, and unitsPerSource > 0 are required' }, 400);
  }
  if (sourceId === targetId) {
    return c.json({ error: 'Source and target must be different items' }, 400);
  }

  const [source, target] = await Promise.all([
    prisma.item.findUnique({ where: { id: sourceId }, select: { id: true, name: true, currentStock: true, storeId: true } }),
    prisma.item.findUnique({ where: { id: targetId }, select: { id: true, name: true, storeId: true } }),
  ]);

  if (!source || source.storeId !== storeId) return c.json({ error: 'Source item not found' }, 404);
  if (!target || target.storeId !== storeId) return c.json({ error: 'Target item not found' }, 404);
  if (Number(source.currentStock) < sourceQty) {
    return c.json({ error: `Insufficient stock: only ${source.currentStock} units available` }, 400);
  }

  const targetQty = sourceQty * unitsPerSource;
  const noteOut = body.notes ?? `Breakdown: ${sourceQty} × ${source.name} → ${targetQty} × ${target.name}`;
  const noteIn  = `Breakdown from: ${sourceQty} × ${source.name}`;

  await prisma.$transaction([
    prisma.item.update({ where: { id: sourceId }, data: { currentStock: { decrement: sourceQty } } }),
    prisma.item.update({ where: { id: targetId }, data: { currentStock: { increment: targetQty } } }),
    prisma.inventoryAdjustment.create({ data: { itemId: sourceId, quantity: -sourceQty, reasonCode: 'RECOUNT', note: noteOut } }),
    prisma.inventoryAdjustment.create({ data: { itemId: targetId, quantity: targetQty,  reasonCode: 'RESTOCK', note: noteIn  } }),
  ]);

  return c.json({ sourceDeducted: sourceQty, targetAdded: targetQty });
});

// Delete item
productsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await prisma.item.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return c.json({ error: 'Item not found' }, 404);
  await prisma.item.delete({ where: { id } });
  return c.json({ ok: true });
});

// Bulk import — upsert by SKU
productsRouter.post(
  '/import',
  bodyLimit({ maxSize: 20 * 1024 * 1024 }),
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
      sellingPrice: Number(p.sellingPrice ?? 0),
      nomadBitePrice: Number(p.nomadBitePrice ?? 0),
      taxRate: Number(p.taxRate ?? 0),
      isFractional: Boolean(p.isFractional),
      currentStock: Number(p.currentStock ?? 0),
      notes: p.notes ? String(p.notes) : null,
      imageUrl: p.imageUrl ? String(p.imageUrl) : null,
      manufacturingDate: p.manufacturingDate ? new Date(String(p.manufacturingDate)) : null,
      expiryDate: p.expiryDate ? new Date(String(p.expiryDate)) : null,
    });

    const toTiers = (p: Record<string, unknown>) => {
      const tiers = (p.packagingTiers as any[]) ?? [];
      return tiers.map((t) => ({
        name: String(t.name),
        level: Number(t.level),
        quantityInBase: Number(t.quantityInBase),
        costPrice: Number(t.costPrice ?? 0),
        sellingPriceOverride: t.sellingPriceOverride != null ? Number(t.sellingPriceOverride) : null,
        barcode: t.barcode ? String(t.barcode) : null,
        isBaseUnit: Boolean(t.isBaseUnit),
      }));
    };

    let succeeded = 0;
    let failed = 0;
    const failureReasons: string[] = [];

    console.log(`[IMPORT DEBUG] storeId=${storeId} total=${body.products.length} replace=${body.replace}`);
    if (body.products.length > 0) {
      const first = body.products[0] as Record<string, unknown>;
      console.log(`[IMPORT DEBUG] First product sample: name="${first.name}" sku="${first.sku}" costPrice=${first.costPrice} sellingPrice=${first.sellingPrice} nomadBitePrice=${first.nomadBitePrice} unit="${first.unit}" tiers=${(first.packagingTiers as any[])?.length ?? 0}`);
    }

    // Use smaller chunks for transactions if tiers are present
    const CHUNK = 25;
    for (let i = 0; i < body.products.length; i += CHUNK) {
      const chunk = body.products.slice(i, i + CHUNK);
      const results = await Promise.allSettled(
        chunk.map(async (p) => {
          const row = toRow(p);
          const tiers = toTiers(p);

          return await prisma.$transaction(async (tx) => {
            const item = await tx.item.upsert({
              where: { storeId_sku: { storeId, sku: row.sku } },
              update: row,
              create: row,
            });

            if (tiers.length > 0) {
              // Replace tiers: delete old, create new
              await tx.packagingTier.deleteMany({ where: { itemId: item.id } });
              await tx.packagingTier.createMany({
                data: tiers.map((t) => ({ ...t, itemId: item.id })),
              });
            }
          });
        })
      );
      const chunkFailed = results.filter((r) => r.status === 'rejected');
      succeeded += results.filter((r) => r.status === 'fulfilled').length;
      failed += chunkFailed.length;
      chunkFailed.forEach((r, j) => {
        const reason = (r as PromiseRejectedResult).reason?.message ?? String((r as PromiseRejectedResult).reason);
        const p = chunk[j] as Record<string, unknown>;
        const msg = `chunk[${i + j}] name="${p?.name}" sku="${p?.sku}": ${reason}`;
        if (failureReasons.length < 20) failureReasons.push(msg);
        console.error(`[IMPORT ERROR] ${msg}`);
      });
    }

    console.log(`[IMPORT DEBUG] Done: succeeded=${succeeded} failed=${failed}`);
    if (failureReasons.length > 0) {
      console.error('[IMPORT FAILURES]', failureReasons.slice(0, 5).join('\n'));
    }

    return c.json({ succeeded, failed, firstErrors: failureReasons.slice(0, 5) });
  }
);

// Bulk set image URL on multiple items by ID
productsRouter.post('/bulk-image', async (c) => {
  const body = await c.req.json<{ ids: string[]; imageUrl: string }>();
  if (!body.ids?.length || !body.imageUrl?.trim()) {
    return c.json({ error: 'ids and imageUrl required' }, 400);
  }
  const result = await prisma.item.updateMany({
    where: { id: { in: body.ids } },
    data: { imageUrl: body.imageUrl.trim() },
  });
  return c.json({ updated: result.count });
});

// Item history — adjustments + transfers
productsRouter.get('/:id/history', async (c) => {
  const id = c.req.param('id');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);

  const [adjustments, transfers] = await Promise.all([
    prisma.inventoryAdjustment.findMany({
      where: { itemId: id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.stockTransfer.findMany({
      where: { itemId: id },
      include: {
        fromLocation: { select: { name: true } },
        toLocation: { select: { name: true } },
        packagingTier: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
  ]);

  return c.json({
    adjustments: adjustments.map((a) => ({
      id: a.id,
      quantity: Number(a.quantity),
      reasonCode: a.reasonCode,
      note: a.note,
      createdAt: a.createdAt,
    })),
    transfers: transfers.map((t) => ({
      id: t.id,
      from: t.fromLocation?.name ?? 'Supplier',
      to: t.toLocation?.name ?? 'Disposed',
      quantityBase: Number(t.quantityBase),
      tierName: t.packagingTier?.name ?? null,
      quantityInTier: t.quantityInTier ? Number(t.quantityInTier) : null,
      reason: t.reason,
      createdAt: t.createdAt,
    })),
  });
});

// Adjust stock — accepts delta in base units OR in a specific packaging tier
productsRouter.post('/:id/adjust', async (c) => {
  const id = c.req.param('id');
  const existing = await prisma.item.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return c.json({ error: 'Item not found' }, 404);

  const body = await c.req.json<{ delta: number; reasonCode: string; note?: string; tierId?: string }>();

  let deltaInBase = body.delta;
  if (body.tierId) {
    const tier = await prisma.packagingTier.findUnique({ where: { id: body.tierId } });
    if (!tier || tier.itemId !== id) return c.json({ error: 'Tier not found' }, 404);
    deltaInBase = body.delta * Number(tier.quantityInBase);
  }

  const item = await prisma.item.update({
    where: { id },
    data: { currentStock: { increment: deltaInBase } },
  });
  await prisma.inventoryAdjustment.create({
    data: {
      itemId: id,
      quantity: deltaInBase,
      reasonCode: body.reasonCode as never,
      note: body.note,
    },
  });
  return c.json(item);
});
