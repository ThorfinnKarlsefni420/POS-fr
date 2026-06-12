import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { getStoreContext } from '../middleware/store-context';
import { submitEtimsInvoice } from '../lib/etims';
import { resolveVatClass, calcLineVat, calcReceiptTotals, VatClassData } from '../lib/vat-engine';
import { pushTransactionToD365, parseD365Credentials } from '../lib/dynamics365';
import { decryptCredentials } from '../lib/credentials-crypto';
import { getSettings } from '../lib/settings';

export const transactionsRouter = new Hono();

transactionsRouter.post('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const body = await c.req.json<{
    items: Array<{ id: string; quantity: number; originalPrice: number; soldPrice: number; discountReason?: string }>;
    totalAmount: number;
    taxAmount: number;
    paymentType: 'CASH' | 'CARD' | 'MPESA' | 'CREDIT' | 'MKOPO' | 'SPLIT';
    userId?: string;
    shiftId?: string;
    // Required when paymentType === 'CREDIT'
    vendorId?: string;
    termDays?: number; // defaults to 14
    // Required when paymentType === 'MKOPO'
    customerId?: string;
    dueDate?: string;
  }>();

  if (body.paymentType === 'CREDIT' && !body.vendorId) {
    return c.json({ error: 'vendorId is required for credit sales' }, 400);
  }
  if (body.paymentType === 'MKOPO' && !body.customerId) {
    return c.json({ error: 'customerId is required for mkopo sales' }, 400);
  }

  // Load items: stock snapshot + VAT class for server-side VAT resolution
  const itemIds = body.items.map((i) => i.id);
  const itemRecords = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: {
      id: true,
      name: true,
      category: true,
      costPrice: true,
      sellingPrice: true,
      currentStock: true,
      vatClassId: true,
      vatClass: { select: { id: true, code: true, rate: true, etimsCode: true } },
      supplier: { select: { id: true, isConsignment: true, defaultType: true, defaultRate: true } },
    },
  });
  const stockMap = new Map(itemRecords.map((s) => [s.id, s]));

  // Load CategoryVat for every category that appears in this cart (one query)
  const categories = [...new Set(itemRecords.map((i) => i.category))];
  const categoryVats = await prisma.categoryVat.findMany({
    where: { category: { in: categories } },
    include: { vatClass: { select: { id: true, code: true, rate: true, etimsCode: true } } },
  });
  const catVatMap = new Map(categoryVats.map((cv) => [cv.category, cv.vatClass]));

  // Resolve VAT per line item
  const lineVatResults = body.items.map((item) => {
    const rec = stockMap.get(item.id);
    const itemVc = rec?.vatClass
      ? { ...rec.vatClass, code: rec.vatClass.code as VatClassData['code'], rate: Number(rec.vatClass.rate) }
      : null;
    const catVc = rec?.category && catVatMap.get(rec.category)
      ? (() => { const cv = catVatMap.get(rec.category)!; return { ...cv, code: cv.code as VatClassData['code'], rate: Number(cv.rate) }; })()
      : null;
    const vc = resolveVatClass(itemVc, catVc);
    return { item, vatResult: calcLineVat(item.soldPrice, item.quantity, vc) };
  });
  const receiptTotals = calcReceiptTotals(lineVatResults.map((l) => l.vatResult));

  // Items whose stock changed (went below requested qty) since the cart was filled
  const stockDiscrepancies = body.items
    .map((item) => {
      const snap = stockMap.get(item.id);
      return snap && Number(snap.currentStock) < item.quantity
        ? { id: item.id, name: snap.name, available: Number(snap.currentStock), requested: item.quantity }
        : null;
    })
    .filter(Boolean);

  // Server-computed VAT overrides any frontend-supplied taxAmount
  const computedTaxAmount = receiptTotals.totalVatKes;

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
      taxAmount: computedTaxAmount,
      totalZeroKes: receiptTotals.totalZeroKes,
      totalExemptKes: receiptTotals.totalExemptKes,
      paymentType: body.paymentType,
      status: 'COMPLETED',
      lineItems: {
        create: lineVatResults.map(({ item, vatResult }) => ({
          itemId: item.id,
          quantity: item.quantity,
          originalPrice: item.originalPrice,
          soldPrice: item.soldPrice,
          discountReason: item.discountReason ?? null,
          vatRate: vatResult.vatRate,
          etimsCode: vatResult.etimsCode,
          vatAmount: vatResult.vatAmount,
          netAmount: vatResult.netAmount,
        })),
      },
    },
    include: { lineItems: true },
  });

  // Consignment (Pay-on-Sell)
  // Master switch: consignmentEnabled must be true. Per-item supplier takes precedence;
  // if an item has no consignment supplier, the store's first consignment supplier is used
  // as a fallback with the store-level consignmentRate (PERCENTAGE_COMMISSION).
  const settings = await getSettings(storeId);
  if (settings.consignmentEnabled) {
    // Fetch store's default consignment supplier once — used as fallback for unlinked items
    const defaultSupplier = await prisma.supplier.findFirst({
      where: { storeId, isConsignment: true },
      select: { id: true, defaultType: true, defaultRate: true },
    });

    const consignmentSalesData = transaction.lineItems.flatMap((li) => {
      const itemRecord = stockMap.get(li.itemId);

      // Prefer item's own consignment supplier; fall back to store default
      const itemSupplier = itemRecord?.supplier?.isConsignment ? itemRecord.supplier : null;
      const supplier = itemSupplier ?? defaultSupplier;
      if (!supplier) return [];

      const soldTotal = Number(li.soldPrice) * Number(li.quantity);
      let supplierAmount = 0;
      let superadminAmount = 0;

      // When falling back to store default, use store-level rate (PERCENTAGE_COMMISSION)
      const settlementType = itemSupplier
        ? (supplier.defaultType as 'PERCENTAGE_COMMISSION' | 'VENDOR_SELL_PRICE' | 'MARGIN_SPLIT')
        : 'PERCENTAGE_COMMISSION';
      const settlementRate = itemSupplier
        ? Number(supplier.defaultRate)
        : Number(settings.consignmentRate ?? 0.9);

      if (settlementType === 'VENDOR_SELL_PRICE') {
        supplierAmount = Number(itemRecord?.sellingPrice ?? 0) * Number(li.quantity);
        superadminAmount = soldTotal - supplierAmount;
      } else if (settlementType === 'MARGIN_SPLIT') {
        const cost = Number(itemRecord?.costPrice ?? 0) * Number(li.quantity);
        const profit = soldTotal - cost;
        supplierAmount = cost + profit * settlementRate;
        superadminAmount = profit * (1 - settlementRate);
      } else {
        supplierAmount = soldTotal * settlementRate;
        superadminAmount = soldTotal * (1 - settlementRate);
      }

      return {
        lineItemId: li.id,
        supplierId: supplier.id,
        settlementType,
        settlementRate,
        payoutAmount: supplierAmount,
        supplierAmount,
        superadminAmount,
        status: 'PENDING' as const,
      };
    });

    if (consignmentSalesData.length > 0) {
      await prisma.consignmentSale.createMany({ data: consignmentSalesData });
    }
  }

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

  if (body.paymentType === 'MKOPO' && body.customerId) {
    await prisma.mkopoSale.create({
      data: {
        customerId: body.customerId,
        transactionId: transaction.id,
        amountOwed: body.totalAmount,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
      },
    });
  }

  if (body.paymentType === 'SPLIT' && body.payments?.length) {
    await prisma.$transaction([
      prisma.transactionPayment.createMany({
        data: body.payments.map((p) => ({
          transactionId: transaction.id,
          method: p.method,
          amount: p.amount,
        })),
      }),
      ...(body.splitChange != null && body.splitChange > 0
        ? [prisma.transaction.update({ where: { id: transaction.id }, data: { splitChange: body.splitChange } })]
        : []),
    ]);
  }

  // Fetch parent relationships for break-bulk (Phase 2.1)
  const itemMeta = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, parentItemId: true, boxQty: true },
  });
  const metaMap = new Map(itemMeta.map((m) => [m.id, m]));

  // Deduct stock and break-bulk in an atomic transaction
  const updatedItems = await prisma.$transaction(async (tx) => {
    const results = [];
    
    // 1. Deduct child items
    for (const item of body.items) {
      const updated = await tx.item.update({
        where: { id: item.id },
        data: { currentStock: { decrement: item.quantity } },
        select: { id: true, name: true, currentStock: true },
      });
      results.push(updated);
    }

    // 2. Break-bulk: deduct fractional stock from parent item
    for (const item of body.items) {
      const meta = metaMap.get(item.id);
      if (meta?.parentItemId && meta.boxQty) {
        const boxSize = Number(meta.boxQty);
        if (boxSize > 0) {
          await tx.item.update({
            where: { id: meta.parentItemId },
            data: { currentStock: { decrement: item.quantity / boxSize } },
          });
        }
      }
    }
    
    return results;
  });

  // Flag items that landed below zero — backend "Requires Recount" signal
  const negativeStockItems = updatedItems
    .filter((i) => Number(i.currentStock) < 0)
    .map((i) => ({ id: i.id, name: i.name, stock: Number(i.currentStock) }));

  // D365 push-back — fire-and-forget, never blocks the POS response
  prisma.warehouseIntegration.findFirst({
    where: { storeId, type: 'DYNAMICS_365' as never, isActive: true },
    select: { credentials: true },
  }).then(async (integration) => {
    if (!integration) return;
    try {
      const creds = parseD365Credentials(decryptCredentials(integration.credentials));
      if (!creds) {
        console.error(`[D365] Failed to decrypt credentials for store ${storeId}`);
        return;
      }
      const d365Items = body.items.map((item) => {
        const snap = stockMap.get(item.id);
        return { sku: snap?.name ?? item.id, qty: item.quantity, unitPrice: item.soldPrice };
      });
      await pushTransactionToD365(creds, {
        id: transaction.id,
        totalAmount: body.totalAmount,
        paymentType: body.paymentType,
        items: d365Items,
      });
      console.log(`[D365] Successfully pushed transaction ${transaction.id}`);
    } catch (err) {
      console.error(`[D365] transaction push error for tx ${transaction.id}:`, err);
    }
  }).catch((err) => console.error('[D365] Integration lookup error:', err));

  // KRA eTIMS — fire-and-forget, never blocks the POS response
  submitEtimsInvoice({
    transactionId: transaction.id,
    storeId,
    totalAmount: body.totalAmount,
    taxAmount: computedTaxAmount,
    totalZeroKes: receiptTotals.totalZeroKes,
    totalExemptKes: receiptTotals.totalExemptKes,
    paymentType: body.paymentType,
    issuedAt: transaction.createdAt,
    items: lineVatResults.map(({ item, vatResult }) => ({
      itemName: stockMap.get(item.id)?.name ?? item.id,
      quantity: item.quantity,
      unitPriceIncl: item.soldPrice,
      unitPriceNet: vatResult.netAmount,
      vatAmount: vatResult.vatAmount,
      taxType: vatResult.etimsCode,
    })),
  })
    .then(() => console.log(`[eTIMS] Successfully submitted tx ${transaction.id}`))
    .catch((err) => console.error(`[eTIMS] submission error for tx ${transaction.id}:`, err));

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

  // Void any pending ConsignmentSales for the returned line items
  const returnedLineItemIds = body.items.map(({ lineItemId }) => lineItemId);
  await prisma.consignmentSale.updateMany({
    where: { lineItemId: { in: returnedLineItemIds }, status: 'PENDING' },
    data: { status: 'VOIDED' },
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

  await prisma.consignmentSale.updateMany({
    where: { lineItemId: { in: voided.lineItems.map((li) => li.id) } },
    data: { status: 'VOIDED' },
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
