import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { getStoreContext } from '../middleware/store-context';
import { submitEtimsInvoice } from '../lib/etims';

export const transactionsRouter = new Hono();

transactionsRouter.post('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const body = await c.req.json<{
    items: Array<{ id: string; quantity: number; originalPrice: number; soldPrice: number; discountReason?: string }>;
    totalAmount: number;
    taxAmount: number;
    paymentType: 'CASH' | 'CARD' | 'MPESA' | 'CREDIT';
    userId?: string;
    shiftId?: string;
    // Required when paymentType === 'CREDIT'
    vendorId?: string;
    termDays?: number; // defaults to 14
  }>();

  if (body.paymentType === 'CREDIT' && !body.vendorId) {
    return c.json({ error: 'vendorId is required for credit sales' }, 400);
  }

  // Optimistic locking: snapshot stock before checkout commits (Phase 1.4)
  const preCheckStocks = await prisma.item.findMany({
    where: { id: { in: body.items.map((i) => i.id) } },
    select: { id: true, name: true, currentStock: true },
  });
  const stockMap = new Map(preCheckStocks.map((s) => [s.id, s]));

  // Items whose stock changed (went below requested qty) since the cart was filled
  const stockDiscrepancies = body.items
    .map((item) => {
      const snap = stockMap.get(item.id);
      return snap && Number(snap.currentStock) < item.quantity
        ? { id: item.id, name: snap.name, available: Number(snap.currentStock), requested: item.quantity }
        : null;
    })
    .filter(Boolean);

  // Use session userId/shiftId when provided, fall back to auto-create for backward compat
  let user = body.userId
    ? await prisma.user.findUnique({ where: { id: body.userId } })
    : null;
  if (!user) {
    user = await prisma.user.findFirst({ where: { storeId } });
    if (!user) {
      user = await prisma.user.create({
        data: { name: 'Admin', pin: '0000', role: 'ADMIN', storeId },
      });
    }
  }

  let shift = body.shiftId
    ? await prisma.shift.findUnique({ where: { id: body.shiftId } })
    : null;
  if (!shift) {
    shift = await prisma.shift.findFirst({ where: { endTime: null, storeId } });
    if (!shift) {
      shift = await prisma.shift.create({
        data: { userId: user.id, startingCash: 0, storeId },
      });
    }
  }

  const transaction = await prisma.transaction.create({
    data: {
      storeId,
      userId: user.id,
      shiftId: shift.id,
      totalAmount: body.totalAmount,
      taxAmount: body.taxAmount,
      paymentType: body.paymentType,
      status: 'COMPLETED',
      lineItems: {
        create: body.items.map((item) => ({
          itemId: item.id,
          quantity: item.quantity,
          originalPrice: item.originalPrice,
          soldPrice: item.soldPrice,
          discountReason: item.discountReason ?? null,
        })),
      },
    },
    include: { lineItems: true },
  });

  // For credit sales, create a CreditSale record linked to this transaction
  if (body.paymentType === 'CREDIT' && body.vendorId) {
    const termDays = body.termDays ?? 14;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + termDays);

    await prisma.creditSale.create({
      data: {
        vendorId: body.vendorId,
        transactionId: transaction.id,
        amountOwed: body.totalAmount,
        dueDate,
      },
    });
  }

  // Fetch parent relationships for break-bulk (Phase 2.1)
  const itemMeta = await prisma.item.findMany({
    where: { id: { in: body.items.map((i) => i.id) } },
    select: { id: true, parentItemId: true, boxQty: true },
  });
  const metaMap = new Map(itemMeta.map((m) => [m.id, m]));

  // Deduct stock — intentionally allows going negative (Phase 1.2 Negative Stock Rule)
  const updatedItems = await Promise.all(
    body.items.map((item) =>
      prisma.item.update({
        where: { id: item.id },
        data: { currentStock: { decrement: item.quantity } },
        select: { id: true, name: true, currentStock: true },
      })
    )
  );

  // Break-bulk: deduct fractional stock from parent item (Phase 2.1)
  await Promise.all(
    body.items.flatMap((item) => {
      const meta = metaMap.get(item.id);
      if (!meta?.parentItemId || !meta.boxQty) return [];
      const boxSize = Number(meta.boxQty);
      if (!boxSize) return [];
      return [
        prisma.item.update({
          where: { id: meta.parentItemId },
          data: { currentStock: { decrement: item.quantity / boxSize } },
        }),
      ];
    })
  );

  // Flag items that landed below zero — backend "Requires Recount" signal
  const negativeStockItems = updatedItems
    .filter((i) => Number(i.currentStock) < 0)
    .map((i) => ({ id: i.id, name: i.name, stock: Number(i.currentStock) }));

  // KRA eTIMS — fire-and-forget, never blocks the POS response
  submitEtimsInvoice({
    transactionId: transaction.id,
    storeId,
    totalAmount: body.totalAmount,
    taxAmount: body.taxAmount,
    paymentType: body.paymentType,
    issuedAt: transaction.createdAt,
    items: body.items.map((item) => ({
      itemName: stockMap.get(item.id)?.name ?? item.id,
      quantity: item.quantity,
      unitPrice: item.soldPrice,
      taxRate: 0, // TODO: pull from Item.taxRate once eTIMS is live
    })),
  }).catch((err) => console.error('[eTIMS] submission error:', err));

  return c.json({ ...transaction, stockDiscrepancies, negativeStockItems }, 201);
});

// Refund / return (Phase 2.3)
transactionsRouter.post('/:id/refund', async (c) => {
  const txId = c.req.param('id');
  const body = await c.req.json<{
    items: Array<{ lineItemId: string; isDamaged: boolean }>;
  }>();

  const lineItems = await prisma.lineItem.findMany({
    where: { id: { in: body.items.map((i) => i.lineItemId) }, transactionId: txId },
    select: { id: true, itemId: true, quantity: true },
  });

  await Promise.all(
    body.items.map(async ({ lineItemId, isDamaged }) => {
      const li = lineItems.find((l) => l.id === lineItemId);
      if (!li) return;

      await prisma.lineItem.update({
        where: { id: lineItemId },
        data: { isReturned: true, isDamaged },
      });

      if (!isDamaged) {
        // Restore stock only if item is not damaged
        await prisma.item.update({
          where: { id: li.itemId },
          data: { currentStock: { increment: Number(li.quantity) } },
        });
      } else {
        // Log as shrinkage
        await prisma.inventoryAdjustment.create({
          data: {
            itemId: li.itemId,
            quantity: -Number(li.quantity),
            reasonCode: 'DAMAGED',
            note: `Returned damaged — from transaction ${txId}`,
          },
        });
      }
    })
  );

  await prisma.transaction.update({
    where: { id: txId },
    data: { status: 'REFUNDED' },
  });

  return c.json({ ok: true });
});

// Void transaction
transactionsRouter.delete('/:id/void', async (c) => {
  const txId = c.req.param('id');

  const tx = await prisma.transaction.findUnique({
    where: { id: txId },
    select: { id: true, status: true },
  });

  if (!tx) return c.json({ error: 'Transaction not found' }, 404);
  if (tx.status !== 'COMPLETED') {
    return c.json({ error: `Cannot void a ${tx.status} transaction` }, 400);
  }

  const voided = await prisma.transaction.update({
    where: { id: txId },
    data: { status: 'VOIDED' },
    include: { lineItems: { include: { item: true } }, user: { select: { id: true, name: true } } },
  });

  return c.json(voided);
});

transactionsRouter.get('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  const transactions = await prisma.transaction.findMany({
    where: storeId ? { storeId } : {},
    include: { lineItems: { include: { item: true } }, user: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return c.json(transactions);
});
