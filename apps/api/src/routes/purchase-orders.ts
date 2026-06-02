import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { getStoreContext } from '../middleware/store-context';
import { decryptCredentials } from '../lib/credentials-crypto';
import {
  parseD365Credentials,
  pushPurchaseOrderToD365,
  pushGoodsReceiptToD365,
  type D365Credentials,
} from '../lib/dynamics365';

async function getD365CredsForStore(storeId: string): Promise<D365Credentials | null> {
  const integration = await prisma.warehouseIntegration.findFirst({
    where: { storeId, integrationType: 'DYNAMICS_365', isActive: true },
    select: { credentials: true },
  });
  if (!integration) return null;
  return parseD365Credentials(decryptCredentials(integration.credentials));
}

export const purchaseOrdersRouter = new Hono();

const PO_INCLUDE = {
  lines: {
    include: {
      item: { select: { id: true, name: true, sku: true, unit: true, costPrice: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
};

// List POs (optionally filtered by status)
purchaseOrdersRouter.get('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  const status = c.req.query('status') as string | undefined;

  const pos = await prisma.purchaseOrder.findMany({
    where: {
      ...(storeId ? { storeId } : {}),
      ...(status ? { status: status as never } : {}),
    },
    include: {
      _count: { select: { lines: true } },
      lines: { select: { orderedQty: true, receivedQty: true, unitCost: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return c.json(
    pos.map((po) => ({
      id: po.id,
      referenceNo: po.referenceNo,
      vendorName: po.vendorName,
      status: po.status,
      expectedAt: po.expectedAt,
      notes: po.notes,
      lineCount: po._count.lines,
      totalCost: po.lines.reduce((s, l) => s + Number(l.unitCost) * Number(l.orderedQty), 0),
      receivedPct:
        po.lines.length > 0
          ? po.lines.reduce((s, l) => s + Number(l.receivedQty), 0) /
            po.lines.reduce((s, l) => s + Number(l.orderedQty), 0)
          : 0,
      createdAt: po.createdAt,
      updatedAt: po.updatedAt,
    }))
  );
});

// Create PO (with lines)
purchaseOrdersRouter.post('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const body = await c.req.json<{
    referenceNo?: string;
    vendorName?: string;
    expectedAt?: string;
    notes?: string;
    lines: Array<{ itemId: string; tierId?: string; orderedQty: number; unitCost: number; notes?: string }>;
  }>();

  if (!body.lines?.length) return c.json({ error: 'At least one line required' }, 400);

  const po = await prisma.purchaseOrder.create({
    data: {
      storeId,
      referenceNo: body.referenceNo?.trim() ?? null,
      vendorName: body.vendorName?.trim() ?? null,
      expectedAt: body.expectedAt ? new Date(body.expectedAt) : null,
      notes: body.notes?.trim() ?? null,
      status: 'DRAFT',
      lines: {
        create: body.lines.map((l) => ({
          itemId: l.itemId,
          tierId: l.tierId ?? null,
          orderedQty: l.orderedQty,
          unitCost: l.unitCost,
          notes: l.notes ?? null,
        })),
      },
    },
    include: PO_INCLUDE,
  });

  return c.json(po, 201);
});

// Get PO detail
purchaseOrdersRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: PO_INCLUDE });
  if (!po) return c.json({ error: 'PO not found' }, 404);
  return c.json(po);
});

// Update PO metadata / status
purchaseOrdersRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    referenceNo?: string;
    vendorName?: string;
    expectedAt?: string | null;
    notes?: string;
    status?: string;
  }>();

  // Read existing PO before update so we can detect ORDERED transition
  const existing = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: {
      status: true,
      storeId: true,
      referenceNo: true,
      vendorName: true,
      expectedAt: true,
      notes: true,
      lines: {
        include: { item: { select: { sku: true, unit: true } } },
        orderBy: { createdAt: 'asc' as const },
      },
    },
  });
  if (!existing) return c.json({ error: 'PO not found' }, 404);

  const po = await prisma.purchaseOrder.update({
    where: { id },
    data: {
      ...(body.referenceNo !== undefined && { referenceNo: body.referenceNo }),
      ...(body.vendorName !== undefined && { vendorName: body.vendorName }),
      ...(body.expectedAt !== undefined && { expectedAt: body.expectedAt ? new Date(body.expectedAt) : null }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.status !== undefined && { status: body.status as never }),
    },
    include: PO_INCLUDE,
  });

  // Fire-and-forget D365 PO push on first transition to ORDERED
  if (body.status === 'ORDERED' && existing.status !== 'ORDERED') {
    getD365CredsForStore(existing.storeId)
      .then(async (creds) => {
        if (!creds) return;
        const d365PoNumber = await pushPurchaseOrderToD365(creds, {
          referenceNo: existing.referenceNo ?? id,
          vendorAccountNumber: existing.vendorName ?? 'UNKNOWN',
          currencyCode: 'KES',
          deliveryDate: existing.expectedAt
            ? existing.expectedAt.toISOString()
            : new Date().toISOString(),
          lines: existing.lines.map((l, i) => ({
            lineNumber: i + 1,
            itemNumber: l.item.sku,
            quantity: Number(l.orderedQty),
            unitPrice: Number(l.unitCost),
            unit: l.item.unit ?? undefined,
          })),
        });
        // Store D365 PO number in notes for goods-receipt lookup
        const notesBase = body.notes ?? existing.notes ?? '';
        await prisma.purchaseOrder.update({
          where: { id },
          data: {
            notes: notesBase
              ? `${notesBase}\n[D365_PO: ${d365PoNumber}]`
              : `[D365_PO: ${d365PoNumber}]`,
          },
        });
        console.info(`[D365] PO ${id} pushed → ${d365PoNumber}`);
      })
      .catch((err: Error) => console.error('[D365 PO push]', err.message));
  }

  return c.json(po);
});

// Receive against a PO — update receivedQty per line, adjust stock, update PO status
purchaseOrdersRouter.post('/:id/receive', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    lines: Array<{ lineId: string; receivedQty: number }>;
    notes?: string;
  }>();

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      lines: {
        include: { item: { select: { sku: true } } },
      },
    },
  });
  if (!po) return c.json({ error: 'PO not found' }, 404);
  if (po.status === 'RECEIVED' || po.status === 'CANCELLED') {
    return c.json({ error: `Cannot receive against a ${po.status} PO` }, 400);
  }

  // Apply received quantities
  await Promise.all(
    body.lines.map(async ({ lineId, receivedQty }) => {
      const line = po.lines.find((l) => l.id === lineId);
      if (!line || receivedQty <= 0) return;

      const newReceived = Number(line.receivedQty) + receivedQty;

      // If a tier was specified, convert received tier units to base units for stock
      let baseQty = receivedQty;
      if (line.tierId) {
        const tier = await prisma.packagingTier.findUnique({
          where: { id: line.tierId },
          select: { quantityInBase: true, roundingPrecision: true },
        });
        if (tier) {
          const raw = receivedQty * Number(tier.quantityInBase);
          const prec = Number(tier.roundingPrecision ?? 0.001);
          baseQty = prec > 0 ? Math.round(raw / prec) * prec : raw;
        }
      }

      await prisma.$transaction([
        prisma.pOLine.update({
          where: { id: lineId },
          data: { receivedQty: newReceived },
        }),
        prisma.item.update({
          where: { id: line.itemId },
          data: { currentStock: { increment: baseQty } },
        }),
        prisma.inventoryAdjustment.create({
          data: {
            itemId: line.itemId,
            quantity: baseQty,
            reasonCode: 'RESTOCK',
            note: `PO ${po.referenceNo ?? id}${body.notes ? ` — ${body.notes}` : ''}`,
          },
        }),
      ]);
    })
  );

  // Recompute PO status
  const updatedLines = await prisma.pOLine.findMany({ where: { poId: id } });
  const allReceived = updatedLines.every((l) => Number(l.receivedQty) >= Number(l.orderedQty));
  const anyReceived = updatedLines.some((l) => Number(l.receivedQty) > 0);
  const newStatus = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL' : 'ORDERED';

  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: newStatus },
    include: PO_INCLUDE,
  });

  // Fire-and-forget D365 goods receipt push if this PO was previously pushed to D365
  const d365PoMatch = (updated.notes ?? '').match(/\[D365_PO:\s*([^\]]+)\]/);
  if (d365PoMatch) {
    const d365PoNumber = d365PoMatch[1].trim();
    getD365CredsForStore(po.storeId)
      .then(async (creds) => {
        if (!creds) return;
        const receiptLines = body.lines
          .filter((l) => l.receivedQty > 0)
          .flatMap((l, i) => {
            const line = po.lines.find((pl) => pl.id === l.lineId);
            if (!line) return [];
            return [{ lineNumber: i + 1, itemNumber: line.item.sku, receivedQty: l.receivedQty }];
          });
        if (receiptLines.length === 0) return;
        await pushGoodsReceiptToD365(creds, {
          purchaseOrderNumber: d365PoNumber,
          receiptNumber: `GR-${id}-${Date.now()}`,
          receiptDate: new Date().toISOString(),
          lines: receiptLines,
        });
        console.info(`[D365] Goods receipt for PO ${id} (D365: ${d365PoNumber}) pushed`);
      })
      .catch((err: Error) => console.error('[D365 goods receipt]', err.message));
  }

  return c.json(updated);
});
