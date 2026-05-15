import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { getStoreContext } from '../middleware/store-context';

export const reportsRouter = new Hono();

function dateRange(fromParam: string | undefined, toParam: string | undefined) {
  const to = toParam ? new Date(toParam) : new Date();
  to.setHours(23, 59, 59, 999);
  const from = fromParam ? new Date(fromParam) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

// ─── Sales Report ─────────────────────────────────────────────────────────────

reportsRouter.get('/sales', async (c) => {
  const { storeId } = await getStoreContext(c);
  const { from, to } = dateRange(c.req.query('from'), c.req.query('to'));

  const transactions = await prisma.transaction.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      status: 'COMPLETED',
      ...(storeId ? { storeId } : {}),
    },
    include: {
      lineItems: { include: { item: { select: { name: true, category: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const totalRevenue = transactions.reduce((s, t) => s + Number(t.totalAmount), 0);
  const transactionCount = transactions.length;

  const paymentBreakdown: Record<string, number> = { CASH: 0, CARD: 0, MPESA: 0, CREDIT: 0 };
  transactions.forEach(t => {
    paymentBreakdown[t.paymentType] = (paymentBreakdown[t.paymentType] ?? 0) + Number(t.totalAmount);
  });

  const productMap = new Map<string, { name: string; category: string; qty: number; revenue: number }>();
  transactions.forEach(t => {
    t.lineItems.forEach(li => {
      if (li.isReturned) return;
      const cur = productMap.get(li.itemId) ?? { name: li.item.name, category: li.item.category, qty: 0, revenue: 0 };
      cur.qty += Number(li.quantity);
      cur.revenue += Number(li.soldPrice) * Number(li.quantity);
      productMap.set(li.itemId, cur);
    });
  });
  const topProducts = [...productMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  const dailyMap = new Map<string, { revenue: number; transactions: number }>();
  transactions.forEach(t => {
    const date = t.createdAt.toISOString().split('T')[0];
    const cur = dailyMap.get(date) ?? { revenue: 0, transactions: 0 };
    cur.revenue += Number(t.totalAmount);
    cur.transactions++;
    dailyMap.set(date, cur);
  });
  const daily = [...dailyMap.entries()]
    .map(([date, d]) => ({ date, ...d }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return c.json({
    from: from.toISOString(),
    to: to.toISOString(),
    totalRevenue,
    transactionCount,
    avgTransaction: transactionCount > 0 ? totalRevenue / transactionCount : 0,
    paymentBreakdown,
    topProducts,
    daily,
  });
});

// ─── Shifts Report ────────────────────────────────────────────────────────────

reportsRouter.get('/shifts', async (c) => {
  const { storeId } = await getStoreContext(c);
  const { from, to } = dateRange(c.req.query('from'), c.req.query('to'));

  const shifts = await prisma.shift.findMany({
    where: {
      startTime: { gte: from, lte: to },
      ...(storeId ? { storeId } : {}),
    },
    include: {
      user: { select: { name: true } },
      cashLogs: true,
      transactions: { where: { status: 'COMPLETED' }, select: { totalAmount: true, paymentType: true } },
    },
    orderBy: { startTime: 'desc' },
  });

  const result = shifts.map(shift => {
    const cashSales = shift.transactions.filter(t => t.paymentType === 'CASH').reduce((s, t) => s + Number(t.totalAmount), 0);
    const totalSales = shift.transactions.reduce((s, t) => s + Number(t.totalAmount), 0);
    const payIns = shift.cashLogs.filter(l => l.type === 'PAY_IN').reduce((s, l) => s + Number(l.amount), 0);
    const payOuts = shift.cashLogs.filter(l => l.type === 'PAY_OUT').reduce((s, l) => s + Number(l.amount), 0);
    const expectedCash = Number(shift.startingCash) + cashSales + payIns - payOuts;
    const actualCash = shift.actualCash !== null ? Number(shift.actualCash) : null;

    return {
      id: shift.id,
      user: shift.user.name,
      startTime: shift.startTime.toISOString(),
      endTime: shift.endTime?.toISOString() ?? null,
      startingCash: Number(shift.startingCash),
      cashSales,
      totalSales,
      payIns,
      payOuts,
      expectedCash,
      actualCash,
      variance: actualCash !== null ? actualCash - expectedCash : null,
      transactionCount: shift.transactions.length,
    };
  });

  return c.json({ shifts: result });
});

// ─── Inventory Report ─────────────────────────────────────────────────────────

reportsRouter.get('/inventory', async (c) => {
  const { storeId } = await getStoreContext(c);
  const [items, adjustments] = await Promise.all([
    prisma.item.findMany({
      where: storeId ? { storeId } : {},
      select: { id: true, name: true, category: true, unit: true, currentStock: true, costPrice: true, sellingPrice: true },
    }),
    prisma.inventoryAdjustment.findMany({
      where: storeId ? { item: { storeId } } : {},
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { item: { select: { name: true } } },
    }),
  ]);

  const totalCostValue = items.reduce((s, i) => s + Number(i.costPrice) * Math.max(Number(i.currentStock), 0), 0);
  const totalRetailValue = items.reduce((s, i) => s + Number(i.sellingPrice) * Math.max(Number(i.currentStock), 0), 0);

  const lowStock = items
    .filter(i => Number(i.currentStock) > 0 && Number(i.currentStock) <= 5)
    .map(i => ({ id: i.id, name: i.name, category: i.category, currentStock: Number(i.currentStock), unit: i.unit }))
    .sort((a, b) => a.currentStock - b.currentStock);

  const outOfStock = items
    .filter(i => Number(i.currentStock) <= 0)
    .map(i => ({ id: i.id, name: i.name, category: i.category }));

  const categoryMap = new Map<string, { count: number; value: number }>();
  items.forEach(i => {
    const cat = i.category || 'Uncategorized';
    const cur = categoryMap.get(cat) ?? { count: 0, value: 0 };
    cur.count++;
    cur.value += Number(i.costPrice) * Math.max(Number(i.currentStock), 0);
    categoryMap.set(cat, cur);
  });
  const byCategory = [...categoryMap.entries()]
    .map(([category, d]) => ({ category, ...d }))
    .sort((a, b) => b.value - a.value);

  return c.json({
    totalProducts: items.length,
    totalCostValue,
    totalRetailValue,
    lowStockCount: lowStock.length,
    outOfStockCount: outOfStock.length,
    lowStock,
    outOfStock,
    byCategory,
    recentAdjustments: adjustments.map(a => ({
      itemName: a.item.name,
      quantity: Number(a.quantity),
      reasonCode: a.reasonCode,
      note: a.note ?? '',
      createdAt: a.createdAt.toISOString(),
    })),
  });
});

// ─── VAT Report ───────────────────────────────────────────────────────────────

reportsRouter.get('/vat', async (c) => {
  const { storeId } = await getStoreContext(c);
  const { from, to } = dateRange(c.req.query('from'), c.req.query('to'));

  const transactions = await prisma.transaction.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      status: 'COMPLETED',
      ...(storeId ? { storeId } : {}),
    },
    select: {
      id: true,
      totalAmount: true,
      taxAmount: true,
      totalZeroKes: true,
      totalExemptKes: true,
      submittedToEtims: true,
      createdAt: true,
      lineItems: {
        select: {
          soldPrice: true,
          quantity: true,
          vatRate: true,
          vatAmount: true,
          netAmount: true,
          etimsCode: true,
          item: { select: { category: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Top-level totals
  let totalOutputVat = 0;     // VAT collected on Standard 16% sales
  let totalZeroRated = 0;     // Zero-Rated sales value
  let totalExempt = 0;        // Exempt sales value
  let totalTaxableSales = 0;  // Standard 16% line totals (incl. VAT)
  let pendingEtims = 0;

  // Per-category VAT breakdown
  const catMap = new Map<string, { taxable: number; vat: number; zero: number; exempt: number }>();

  for (const tx of transactions) {
    totalOutputVat  += Number(tx.taxAmount);
    totalZeroRated  += Number(tx.totalZeroKes);
    totalExempt     += Number(tx.totalExemptKes);
    if (!tx.submittedToEtims) pendingEtims++;

    for (const li of tx.lineItems) {
      const lineTotal = Number(li.soldPrice) * Number(li.quantity);
      const lineVat   = Number(li.vatAmount) * Number(li.quantity);
      const cat = li.item.category || 'Uncategorized';
      const cur = catMap.get(cat) ?? { taxable: 0, vat: 0, zero: 0, exempt: 0 };

      if (li.etimsCode === 'VAT') {
        totalTaxableSales += lineTotal;
        cur.taxable += lineTotal;
        cur.vat     += lineVat;
      } else if (li.etimsCode === 'ZERO') {
        cur.zero += lineTotal;
      } else {
        cur.exempt += lineTotal;
      }
      catMap.set(cat, cur);
    }
  }

  // Monthly breakdown for VAT return filing
  const monthMap = new Map<string, { outputVat: number; taxableSales: number; zeroRated: number; exempt: number; txCount: number }>();
  for (const tx of transactions) {
    const month = tx.createdAt.toISOString().slice(0, 7); // 'YYYY-MM'
    const cur = monthMap.get(month) ?? { outputVat: 0, taxableSales: 0, zeroRated: 0, exempt: 0, txCount: 0 };
    cur.outputVat    += Number(tx.taxAmount);
    cur.taxableSales += Number(tx.totalAmount) - Number(tx.totalZeroKes) - Number(tx.totalExemptKes);
    cur.zeroRated    += Number(tx.totalZeroKes);
    cur.exempt       += Number(tx.totalExemptKes);
    cur.txCount++;
    monthMap.set(month, cur);
  }

  const byCategory = [...catMap.entries()]
    .map(([category, d]) => ({ category, ...d }))
    .sort((a, b) => b.vat - a.vat);

  const byMonth = [...monthMap.entries()]
    .map(([month, d]) => ({ month, ...d }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return c.json({
    from: from.toISOString(),
    to: to.toISOString(),
    transactionCount: transactions.length,
    // VAT return figures
    totalOutputVat:    Math.round(totalOutputVat    * 100) / 100,
    totalTaxableSales: Math.round(totalTaxableSales * 100) / 100,
    totalZeroRated:    Math.round(totalZeroRated    * 100) / 100,
    totalExempt:       Math.round(totalExempt       * 100) / 100,
    netVatPayable:     Math.round(totalOutputVat    * 100) / 100, // input VAT claimable added once supplier invoices tracked
    pendingEtims,
    byCategory,
    byMonth,
  });
});

// ─── CSV Export ───────────────────────────────────────────────────────────────

reportsRouter.get('/export/sales', async (c) => {
  const { storeId } = await getStoreContext(c);
  const { from, to } = dateRange(c.req.query('from'), c.req.query('to'));

  const transactions = await prisma.transaction.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      status: 'COMPLETED',
      ...(storeId ? { storeId } : {}),
    },
    include: {
      lineItems: { include: { item: { select: { name: true, category: true, sku: true } } } },
      user: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const header = ['Date', 'Transaction ID', 'Cashier', 'Payment', 'SKU', 'Product', 'Category', 'Qty', 'Unit Price', 'Line Total', 'Returned'];
  const rows = transactions.flatMap(t =>
    t.lineItems.map(li => [
      t.createdAt.toISOString(),
      t.id,
      t.user.name,
      t.paymentType,
      li.item.sku,
      `"${li.item.name.replace(/"/g, '""')}"`,
      `"${li.item.category.replace(/"/g, '""')}"`,
      Number(li.quantity),
      Number(li.soldPrice),
      (Number(li.quantity) * Number(li.soldPrice)).toFixed(2),
      li.isReturned ? 'Yes' : 'No',
    ])
  );

  const csv = [header, ...rows].map(r => r.join(',')).join('\n');
  c.header('Content-Type', 'text/csv');
  c.header('Content-Disposition', `attachment; filename="sales-${from.toISOString().split('T')[0]}.csv"`);
  return c.text(csv);
});

// ─── Accounting Journal Export (QuickBooks / Xero compatible) ────────────────
// One journal line per transaction: debit the payment account, credit Sales Revenue.
// VAT is split into a separate VAT Payable credit line when taxAmount > 0.
// Import into QuickBooks via Company → Journal Entries → Import, or Xero → Manual Journals.

reportsRouter.get('/export/journal', async (c) => {
  const { storeId } = await getStoreContext(c);
  const { from, to } = dateRange(c.req.query('from'), c.req.query('to'));

  const transactions = await prisma.transaction.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      status: 'COMPLETED',
      ...(storeId ? { storeId } : {}),
    },
    select: {
      id: true,
      createdAt: true,
      totalAmount: true,
      taxAmount: true,
      paymentType: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  // Chart of accounts mapping
  const debitAccount: Record<string, string> = {
    CASH:  '1010-Cash',
    CARD:  '1020-Card Receivable',
    MPESA: '1030-M-Pesa Receivable',
    CREDIT:'1040-Vendor Credit Receivable',
  };

  const header = ['Date', 'Journal No', 'Account', 'Debit (KES)', 'Credit (KES)', 'Description'];
  const rows: (string | number)[][] = [];

  transactions.forEach((t) => {
    const date = t.createdAt.toISOString().split('T')[0];
    const ref = `TXN-${t.id.slice(-8).toUpperCase()}`;
    const net = Number(t.totalAmount) - Number(t.taxAmount);

    // Debit: payment account (full amount)
    rows.push([date, ref, debitAccount[t.paymentType] ?? '1010-Cash', Number(t.totalAmount).toFixed(2), '', ref]);

    // Credit: sales revenue (net of VAT)
    rows.push([date, ref, '4000-Sales Revenue', '', net.toFixed(2), ref]);

    // Credit: VAT payable (if any)
    if (Number(t.taxAmount) > 0) {
      rows.push([date, ref, '2200-VAT Payable', '', Number(t.taxAmount).toFixed(2), ref]);
    }
  });

  const csv = [header, ...rows].map(r => r.join(',')).join('\n');
  c.header('Content-Type', 'text/csv');
  c.header('Content-Disposition', `attachment; filename="journal-${from.toISOString().split('T')[0]}.csv"`);
  return c.text(csv);
});
