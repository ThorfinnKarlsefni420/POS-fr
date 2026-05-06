import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { getStoreContext } from '../middleware/store-context';

export const shiftsRouter = new Hono();

// Get current open shift (optionally filtered by userId)
shiftsRouter.get('/current', async (c) => {
  const { storeId } = await getStoreContext(c);
  const userId = c.req.query('userId');
  const shift = await prisma.shift.findFirst({
    where: {
      endTime: null,
      ...(userId ? { userId } : {}),
      ...(storeId ? { storeId } : {}),
    },
    include: {
      cashLogs: { orderBy: { createdAt: 'asc' } },
      user: { select: { id: true, name: true } },
    },
    orderBy: { startTime: 'desc' },
  });
  return c.json(shift ?? null);
});

// Start a shift
shiftsRouter.post('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);
  const body = await c.req.json<{ userId: string; startingCash: number }>();
  const shift = await prisma.shift.create({
    data: { storeId, userId: body.userId, startingCash: body.startingCash },
    include: { cashLogs: true },
  });
  return c.json(shift, 201);
});

// Add a cash log entry (pay-in / pay-out)
shiftsRouter.post('/:id/cashlog', async (c) => {
  const body = await c.req.json<{ amount: number; type: 'PAY_IN' | 'PAY_OUT'; reason: string }>();
  const log = await prisma.cashLog.create({
    data: {
      shiftId: c.req.param('id'),
      amount: body.amount,
      type: body.type,
      reason: body.reason,
    },
  });
  return c.json(log, 201);
});

// Close a shift — calculates expected vs. actual cash variance
shiftsRouter.post('/:id/close', async (c) => {
  const body = await c.req.json<{ actualCash: number }>();
  const shift = await prisma.shift.findUnique({
    where: { id: c.req.param('id') },
    include: {
      cashLogs: true,
      transactions: { where: { paymentType: 'CASH', status: 'COMPLETED' } },
    },
  });
  if (!shift) return c.json({ error: 'Shift not found' }, 404);

  const cashSales = shift.transactions.reduce((s, t) => s + Number(t.totalAmount), 0);
  const payIns = shift.cashLogs.filter((l) => l.type === 'PAY_IN').reduce((s, l) => s + Number(l.amount), 0);
  const payOuts = shift.cashLogs.filter((l) => l.type === 'PAY_OUT').reduce((s, l) => s + Number(l.amount), 0);
  const expectedCash = Number(shift.startingCash) + cashSales + payIns - payOuts;

  const closed = await prisma.shift.update({
    where: { id: c.req.param('id') },
    data: { endTime: new Date(), actualCash: body.actualCash, endingCash: expectedCash },
  });
  return c.json({ ...closed, expectedCash, variance: body.actualCash - expectedCash });
});
