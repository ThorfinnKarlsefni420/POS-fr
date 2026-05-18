import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { getStoreContext } from '../middleware/store-context';

export const locationsRouter = new Hono();

// ── Stock Locations CRUD ──────────────────────────────────────────────────────

locationsRouter.get('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const locations = await prisma.stockLocation.findMany({
    where: { storeId },
    include: {
      _count: { select: { itemStocks: true } },
      itemStocks: { select: { quantity: true } },
    },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });

  return c.json(
    locations.map((loc) => ({
      id: loc.id,
      name: loc.name,
      type: loc.type,
      description: loc.description,
      isActive: loc.isActive,
      itemCount: loc._count.itemStocks,
      totalUnits: loc.itemStocks.reduce((s, is) => s + Number(is.quantity), 0),
      createdAt: loc.createdAt,
    }))
  );
});

locationsRouter.post('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);
  const body = await c.req.json();
  if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400);

  const location = await prisma.stockLocation.create({
    data: {
      storeId,
      name: body.name.trim(),
      type: body.type ?? 'WAREHOUSE',
      description: body.description ?? null,
    },
  });
  return c.json(location, 201);
});

locationsRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await prisma.stockLocation.findUnique({ where: { id } });
  if (!existing) return c.json({ error: 'Location not found' }, 404);
  const body = await c.req.json();
  const location = await prisma.stockLocation.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.type !== undefined && { type: body.type }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.isActive !== undefined && { isActive: Boolean(body.isActive) }),
    },
  });
  return c.json(location);
});

locationsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await prisma.stockLocation.findUnique({
    where: { id },
    include: { itemStocks: { where: { quantity: { gt: 0 } }, take: 1 } },
  });
  if (!existing) return c.json({ error: 'Location not found' }, 404);
  if (existing.itemStocks.length > 0) {
    return c.json({ error: 'Cannot delete a location that still holds stock. Transfer or write off stock first.' }, 409);
  }
  // Soft-delete: mark inactive rather than hard-delete (preserves transfer history)
  await prisma.stockLocation.update({ where: { id }, data: { isActive: false } });
  return c.json({ ok: true });
});

// ── Per-item stock breakdown ───────────────────────────────────────────────────

locationsRouter.get('/item/:itemId', async (c) => {
  const itemId = c.req.param('itemId');
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { id: true, currentStock: true, name: true },
  });
  if (!item) return c.json({ error: 'Item not found' }, 404);

  const stocks = await prisma.itemStock.findMany({
    where: { itemId },
    include: { location: { select: { id: true, name: true, type: true, isActive: true } } },
    orderBy: { location: { name: 'asc' } },
  });

  const allocated = stocks.reduce((s, is) => s + Number(is.quantity), 0);
  const unallocated = Number(item.currentStock) - allocated;

  return c.json({
    itemId,
    totalStock: Number(item.currentStock),
    unallocated: Math.max(0, unallocated),
    locations: stocks.map((is) => ({
      id: is.id,
      locationId: is.locationId,
      locationName: is.location.name,
      locationType: is.location.type,
      locationActive: is.location.isActive,
      quantity: Number(is.quantity),
    })),
  });
});

// ── Stock Transfer ─────────────────────────────────────────────────────────────

locationsRouter.post('/item/:itemId/transfer', async (c) => {
  const { storeId, userId } = await getStoreContext(c);
  const itemId = c.req.param('itemId');

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { packagingTiers: { select: { id: true, quantityInBase: true, name: true } } },
  });
  if (!item) return c.json({ error: 'Item not found' }, 404);

  const body = await c.req.json<{
    fromLocationId?: string | null;
    toLocationId?: string | null;
    quantity: number;
    tierId?: string;
    reason?: string;
    notes?: string;
  }>();

  if (!body.quantity || body.quantity <= 0) return c.json({ error: 'quantity must be > 0' }, 400);
  if (body.fromLocationId === undefined && body.toLocationId === undefined) {
    return c.json({ error: 'at least one of fromLocationId or toLocationId must be provided' }, 400);
  }

  // Resolve base quantity from tier if provided
  let quantityBase = body.quantity;
  let tierId: string | null = null;
  let quantityInTier: number | null = null;

  if (body.tierId) {
    const tier = item.packagingTiers.find((t) => t.id === body.tierId);
    if (!tier) return c.json({ error: 'Packaging tier not found for this item' }, 404);
    quantityBase = body.quantity * Number(tier.quantityInBase);
    tierId = tier.id;
    quantityInTier = body.quantity;
  }

  // Validate source location has enough stock
  if (body.fromLocationId) {
    const fromStock = await prisma.itemStock.findUnique({
      where: { itemId_locationId: { itemId, locationId: body.fromLocationId } },
    });
    const available = fromStock ? Number(fromStock.quantity) : 0;
    if (available < quantityBase) {
      return c.json(
        { error: `Insufficient stock at source. Available: ${available}, requested: ${quantityBase}` },
        409
      );
    }
  }

  // Execute transfer in a transaction
  await prisma.$transaction(async (tx) => {
    // Deduct from source location
    if (body.fromLocationId) {
      await tx.itemStock.upsert({
        where: { itemId_locationId: { itemId, locationId: body.fromLocationId } },
        create: { itemId, locationId: body.fromLocationId, quantity: -quantityBase },
        update: { quantity: { decrement: quantityBase } },
      });
    }

    // Add to destination location
    if (body.toLocationId) {
      await tx.itemStock.upsert({
        where: { itemId_locationId: { itemId, locationId: body.toLocationId } },
        create: { itemId, locationId: body.toLocationId, quantity: quantityBase },
        update: { quantity: { increment: quantityBase } },
      });
    }

    // Update Item.currentStock: only changes for supplier receives (+) or disposals (-)
    const stockDelta =
      !body.fromLocationId ? quantityBase   // receive from supplier
      : !body.toLocationId ? -quantityBase  // dispose / write-off
      : 0;                                  // internal transfer — total unchanged

    if (stockDelta !== 0) {
      await tx.item.update({
        where: { id: itemId },
        data: { currentStock: { increment: stockDelta } },
      });
      // Also create an InventoryAdjustment for the audit trail
      if (stockDelta !== 0) {
        await tx.inventoryAdjustment.create({
          data: {
            itemId,
            quantity: stockDelta,
            reasonCode: !body.fromLocationId ? 'RESTOCK' : 'DAMAGED',
            note: body.notes ?? body.reason ?? null,
          },
        });
      }
    }

    // Record transfer
    await tx.stockTransfer.create({
      data: {
        storeId: storeId!,
        itemId,
        fromLocationId: body.fromLocationId ?? null,
        toLocationId: body.toLocationId ?? null,
        quantityBase,
        packagingTierId: tierId,
        quantityInTier,
        reason: body.reason ?? null,
        notes: body.notes ?? null,
        performedById: userId ?? null,
      },
    });
  });

  // Return updated stock breakdown
  const stocks = await prisma.itemStock.findMany({
    where: { itemId },
    include: { location: { select: { id: true, name: true, type: true } } },
  });
  const updatedItem = await prisma.item.findUnique({ where: { id: itemId }, select: { currentStock: true } });

  return c.json({
    ok: true,
    totalStock: Number(updatedItem!.currentStock),
    locations: stocks.map((is) => ({
      locationId: is.locationId,
      locationName: is.location.name,
      quantity: Number(is.quantity),
    })),
  });
});

// ── Shelf replenishment alerts ────────────────────────────────────────────────
// Returns items that have warehouse stock but low/no shelf or display stock.

locationsRouter.get('/replenishment', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  // All active warehouse stocks for this store
  const warehouseRows = await prisma.itemStock.findMany({
    where: {
      quantity: { gt: 0 },
      location: { storeId, isActive: true, type: 'WAREHOUSE' },
    },
    select: {
      itemId: true,
      locationId: true,
      quantity: true,
      location: { select: { id: true, name: true } },
    },
  });

  if (warehouseRows.length === 0) return c.json([]);

  const itemIds = [...new Set(warehouseRows.map((r) => r.itemId))];

  // Shelf / display stocks for those items
  const shelfRows = await prisma.itemStock.findMany({
    where: {
      itemId: { in: itemIds },
      location: { storeId, isActive: true, type: { in: ['SHELF', 'DISPLAY'] } },
    },
    select: {
      itemId: true,
      locationId: true,
      quantity: true,
      location: { select: { id: true, name: true, type: true } },
    },
  });

  // Item details
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: {
      id: true, name: true, sku: true,
      packagingTiers: { select: { id: true, name: true, quantityInBase: true } },
    },
  });
  const itemMap = new Map(items.map((i) => [i.id, i]));

  // Group by item and decide which need replenishment
  const alerts: {
    itemId: string;
    itemName: string;
    itemSku: string;
    packagingTiers: { id: string; name: string; quantityInBase: number }[];
    warehouseQty: number;
    warehouseLocations: { id: string; name: string; qty: number }[];
    shelfQty: number;
    shelfLocations: { id: string; name: string; type: string; qty: number }[];
  }[] = [];

  for (const itemId of itemIds) {
    const wh = warehouseRows.filter((r) => r.itemId === itemId);
    const sh = shelfRows.filter((r) => r.itemId === itemId);
    const whTotal = wh.reduce((s, r) => s + Number(r.quantity), 0);
    const shTotal = sh.reduce((s, r) => s + Number(r.quantity), 0);

    // Flag if shelf is empty OR less than 20% of warehouse stock (min threshold 5 units)
    const threshold = Math.max(5, whTotal * 0.2);
    if (shTotal >= threshold) continue;

    const item = itemMap.get(itemId);
    if (!item) continue;

    alerts.push({
      itemId,
      itemName: item.name,
      itemSku: item.sku,
      packagingTiers: item.packagingTiers.map((t) => ({
        id: t.id,
        name: t.name,
        quantityInBase: Number(t.quantityInBase),
      })),
      warehouseQty: whTotal,
      warehouseLocations: wh.map((r) => ({ id: r.locationId, name: r.location.name, qty: Number(r.quantity) })),
      shelfQty: shTotal,
      shelfLocations: sh.map((r) => ({ id: r.locationId, name: r.location.name, type: r.location.type, qty: Number(r.quantity) })),
    });
  }

  // Sort: empty shelf first, then by warehouse qty descending
  alerts.sort((a, b) => (a.shelfQty === 0 ? -1 : 1) || b.warehouseQty - a.warehouseQty);

  return c.json(alerts);
});

// ── Transfer history for store ────────────────────────────────────────────────

locationsRouter.get('/transfers', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const itemId = c.req.query('itemId');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);

  const transfers = await prisma.stockTransfer.findMany({
    where: { storeId, ...(itemId ? { itemId } : {}) },
    include: {
      item: { select: { name: true, sku: true } },
      fromLocation: { select: { name: true, type: true } },
      toLocation: { select: { name: true, type: true } },
      packagingTier: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return c.json(
    transfers.map((t) => ({
      id: t.id,
      itemId: t.itemId,
      itemName: t.item.name,
      itemSku: t.item.sku,
      from: t.fromLocation ? t.fromLocation.name : 'Supplier',
      to: t.toLocation ? t.toLocation.name : 'Disposed',
      quantityBase: Number(t.quantityBase),
      tierName: t.packagingTier?.name ?? null,
      quantityInTier: t.quantityInTier ? Number(t.quantityInTier) : null,
      reason: t.reason,
      notes: t.notes,
      createdAt: t.createdAt,
    }))
  );
});
