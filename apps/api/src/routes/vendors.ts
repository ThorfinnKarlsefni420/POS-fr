import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { getStoreContext } from '../middleware/store-context';
import { sendVendorWelcome } from '../lib/email';

export const vendorsRouter = new Hono();

// List all vendors with outstanding balance summary
vendorsRouter.get('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  const vendors = await prisma.vendor.findMany({
    where: storeId ? { storeId } : {},
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { creditSales: true } },
      creditSales: {
        where: { status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] } },
        select: { amountOwed: true, amountPaid: true },
      },
    },
  });

  const result = vendors.map((v) => ({
    id: v.id,
    name: v.name,
    phone: v.phone,
    email: v.email,
    creditLimit: v.creditLimit,
    totalSales: v._count.creditSales,
    outstandingBalance: v.creditSales.reduce(
      (sum, cs) => sum + (Number(cs.amountOwed) - Number(cs.amountPaid)),
      0
    ),
  }));

  return c.json(result);
});

// Create vendor
vendorsRouter.post('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const body = await c.req.json<{
    name: string;
    phone?: string;
    email?: string;
    creditLimit?: number;
  }>();

  if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400);

  const [vendor, store] = await Promise.all([
    prisma.vendor.create({
      data: {
        storeId,
        name: body.name.trim(),
        phone: body.phone ?? null,
        email: body.email ?? null,
        creditLimit: body.creditLimit ?? 0,
      },
    }),
    prisma.store.findUnique({ where: { id: storeId }, select: { name: true } }),
  ]);

  if (vendor.email) {
    sendVendorWelcome({
      name: vendor.name,
      email: vendor.email,
      storeName: store?.name ?? 'NomadBite',
    }).catch((err) => console.error('[email] vendor welcome failed:', err));
  }

  return c.json(vendor, 201);
});

// All overdue credit sales — must be defined before /:id to avoid route clash
vendorsRouter.get('/overdue', async (c) => {
  const { storeId } = await getStoreContext(c);
  const now = new Date();

  // Promote UNPAID/PARTIAL past due date to OVERDUE
  await prisma.creditSale.updateMany({
    where: {
      dueDate: { lt: now },
      status: { in: ['UNPAID', 'PARTIAL'] },
      ...(storeId ? { vendor: { storeId } } : {}),
    },
    data: { status: 'OVERDUE' },
  });

  const overdue = await prisma.creditSale.findMany({
    where: {
      status: 'OVERDUE',
      ...(storeId ? { vendor: { storeId } } : {}),
    },
    include: {
      vendor: { select: { id: true, name: true, phone: true } },
      transaction: { select: { id: true, createdAt: true, totalAmount: true } },
    },
    orderBy: { dueDate: 'asc' },
  });

  return c.json(overdue);
});

// Vendor detail with full credit history
vendorsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');

  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: {
      creditSales: {
        include: {
          transaction: { select: { id: true, createdAt: true, totalAmount: true } },
          payments: {
            include: { recordedBy: { select: { id: true, name: true } } },
            orderBy: { paidAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!vendor) return c.json({ error: 'Vendor not found' }, 404);
  return c.json(vendor);
});

// Record a payment against one of this vendor's credit sales
vendorsRouter.post('/:id/payments', async (c) => {
  const vendorId = c.req.param('id');
  const body = await c.req.json<{
    creditSaleId: string;
    amount: number;
    method: 'CASH' | 'MPESA' | 'BANK_TRANSFER';
    recordedById: string;
    note?: string;
  }>();

  if (!body.amount || body.amount <= 0) return c.json({ error: 'amount must be positive' }, 400);

  const creditSale = await prisma.creditSale.findFirst({
    where: { id: body.creditSaleId, vendorId },
  });

  if (!creditSale) return c.json({ error: 'Credit sale not found for this vendor' }, 404);
  if (creditSale.status === 'PAID') return c.json({ error: 'Credit sale is already fully paid' }, 400);

  const newAmountPaid = Number(creditSale.amountPaid) + body.amount;
  const newStatus = newAmountPaid >= Number(creditSale.amountOwed) ? 'PAID' : 'PARTIAL';

  const [payment, updatedCreditSale] = await prisma.$transaction([
    prisma.vendorPayment.create({
      data: {
        creditSaleId: body.creditSaleId,
        amount: body.amount,
        method: body.method,
        recordedById: body.recordedById,
        note: body.note ?? null,
      },
    }),
    prisma.creditSale.update({
      where: { id: body.creditSaleId },
      data: { amountPaid: newAmountPaid, status: newStatus },
    }),
  ]);

  return c.json({ payment, creditSale: updatedCreditSale }, 201);
});
