import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { getStoreContext } from '../middleware/store-context';

export const customersRouter = new Hono();

// List customers with outstanding mkopo balance
customersRouter.get('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  const q = c.req.query('q')?.trim();

  const customers = await prisma.customer.findMany({
    where: {
      ...(storeId ? { storeId } : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
    },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { mkopoSales: true } },
      mkopoSales: {
        where: { status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] } },
        select: { amountOwed: true, amountPaid: true },
      },
    },
  });

  return c.json(
    customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      creditLimit: c.creditLimit,
      totalSales: c._count.mkopoSales,
      outstandingBalance: c.mkopoSales.reduce(
        (sum, ms) => sum + (Number(ms.amountOwed) - Number(ms.amountPaid)),
        0
      ),
    }))
  );
});

// Search by phone (used for inline lookup at checkout)
customersRouter.get('/search', async (c) => {
  const { storeId } = await getStoreContext(c);
  const q = c.req.query('q')?.trim();
  if (!q) return c.json([]);

  const customers = await prisma.customer.findMany({
    where: {
      ...(storeId ? { storeId } : {}),
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ],
    },
    take: 10,
    orderBy: { name: 'asc' },
    select: { id: true, name: true, phone: true, creditLimit: true },
  });

  return c.json(customers);
});

// Create customer
customersRouter.post('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const body = await c.req.json<{
    name: string;
    phone?: string;
    email?: string;
    creditLimit?: number;
  }>();

  if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400);

  const customer = await prisma.customer.create({
    data: {
      storeId,
      name: body.name.trim(),
      phone: body.phone?.trim() ?? null,
      email: body.email?.trim() ?? null,
      creditLimit: body.creditLimit ?? 0,
    },
  });

  return c.json(customer, 201);
});

// Overdue mkopo — must be before /:id
customersRouter.get('/overdue', async (c) => {
  const { storeId } = await getStoreContext(c);
  const now = new Date();

  await prisma.mkopoSale.updateMany({
    where: {
      dueDate: { lt: now },
      status: { in: ['UNPAID', 'PARTIAL'] },
      ...(storeId ? { customer: { storeId } } : {}),
    },
    data: { status: 'OVERDUE' },
  });

  const overdue = await prisma.mkopoSale.findMany({
    where: {
      status: 'OVERDUE',
      ...(storeId ? { customer: { storeId } } : {}),
    },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      transaction: { select: { id: true, createdAt: true, totalAmount: true } },
    },
    orderBy: { dueDate: 'asc' },
  });

  return c.json(overdue);
});

// Customer detail with mkopo history
customersRouter.get('/:id', async (c) => {
  const id = c.req.param('id');

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      mkopoSales: {
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

  if (!customer) return c.json({ error: 'Customer not found' }, 404);
  return c.json(customer);
});

// Update customer
customersRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    name?: string;
    phone?: string;
    email?: string;
    creditLimit?: number;
  }>();

  const customer = await prisma.customer.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.phone !== undefined && { phone: body.phone.trim() || null }),
      ...(body.email !== undefined && { email: body.email.trim() || null }),
      ...(body.creditLimit !== undefined && { creditLimit: body.creditLimit }),
    },
  });

  return c.json(customer);
});

// Record a mkopo payment
customersRouter.post('/:id/payments', async (c) => {
  const customerId = c.req.param('id');
  const body = await c.req.json<{
    mkopoSaleId: string;
    amount: number;
    method: 'CASH' | 'MPESA' | 'BANK_TRANSFER';
    recordedById: string;
    note?: string;
  }>();

  if (!body.amount || body.amount <= 0) return c.json({ error: 'amount must be positive' }, 400);

  const mkopoSale = await prisma.mkopoSale.findFirst({
    where: { id: body.mkopoSaleId, customerId },
  });

  if (!mkopoSale) return c.json({ error: 'Mkopo sale not found for this customer' }, 404);
  if (mkopoSale.status === 'PAID') return c.json({ error: 'Already fully paid' }, 400);

  const newAmountPaid = Number(mkopoSale.amountPaid) + body.amount;
  const newStatus = newAmountPaid >= Number(mkopoSale.amountOwed) ? 'PAID' : 'PARTIAL';

  const [payment, updated] = await prisma.$transaction([
    prisma.mkopoPayment.create({
      data: {
        mkopoSaleId: body.mkopoSaleId,
        amount: body.amount,
        method: body.method,
        recordedById: body.recordedById,
        note: body.note ?? null,
      },
    }),
    prisma.mkopoSale.update({
      where: { id: body.mkopoSaleId },
      data: { amountPaid: newAmountPaid, status: newStatus },
    }),
  ]);

  return c.json({ payment, mkopoSale: updated }, 201);
});
