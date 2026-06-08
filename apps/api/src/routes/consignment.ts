import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { getStoreContext } from '../middleware/store-context';

export const consignmentRouter = new Hono();

// GET /pending: Find all ConsignmentSale records with status = PENDING grouped by supplier.
// Accessible by ADMIN and SUPERADMIN (Read-only for Admin)
consignmentRouter.get('/pending', async (c) => {
  const { storeId, role } = await getStoreContext(c);
  if (!storeId && role !== 'SUPERADMIN') return c.json({ error: 'storeId required' }, 400);

  const pendingSales = await prisma.consignmentSale.findMany({
    where: {
      ...(role !== 'SUPERADMIN' ? { supplier: { storeId } } : {}),
      status: 'PENDING',
    },
    include: {
      supplier: { include: { store: true } },
      lineItem: {
        include: { item: true },
      },
    },
  });

  // Group by supplier
  const grouped = pendingSales.reduce((acc, sale) => {
    const supplierId = sale.supplierId;
    if (!acc[supplierId]) {
      acc[supplierId] = {
        supplier: sale.supplier,
        sales: [],
        totalPayout: 0,
      };
    }
    acc[supplierId].sales.push(sale);
    acc[supplierId].totalPayout += Number(sale.payoutAmount);
    return acc;
  }, {} as Record<string, any>);

  return c.json(Object.values(grouped));
});

// POST /settle: Take a list of pending ConsignmentSale IDs and create a new ConsignmentSettlement in UNPAID status.
// Restricted to SUPERADMIN
consignmentRouter.post('/settle', async (c) => {
  const { role } = await getStoreContext(c);
  if (role !== 'SUPERADMIN') return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    supplierId: string;
    saleIds: string[];
  }>();

  const supplier = await prisma.supplier.findUnique({
    where: { id: body.supplierId },
  });
  if (!supplier) return c.json({ error: 'Supplier not found' }, 404);

  const sales = await prisma.consignmentSale.findMany({
    where: {
      id: { in: body.saleIds },
      supplierId: body.supplierId,
      status: 'PENDING',
    },
  });

  if (sales.length !== body.saleIds.length) {
    return c.json({ error: 'Some sales not found or already settled' }, 400);
  }

  const totalAmount = sales.reduce((sum, sale) => sum + Number(sale.payoutAmount), 0);

  const settlement = await prisma.consignmentSettlement.create({
    data: {
      storeId: supplier.storeId,
      supplierId: body.supplierId,
      totalAmount,
      status: 'UNPAID',
      sales: {
        connect: body.saleIds.map((id) => ({ id })),
      },
    },
  });

  await prisma.consignmentSale.updateMany({
    where: { id: { in: body.saleIds } },
    data: { status: 'SETTLED', settlementId: settlement.id },
  });

  return c.json(settlement, 201);
});

// PATCH /settlements/:id/pay: Mark a specific ConsignmentSettlement as PAID and set paidAt = now().
// Restricted to SUPERADMIN
consignmentRouter.patch('/settlements/:id/pay', async (c) => {
  const { role } = await getStoreContext(c);
  if (role !== 'SUPERADMIN') return c.json({ error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const settlement = await prisma.consignmentSettlement.update({
    where: { id },
    data: {
      status: 'PAID',
      paidAt: new Date(),
    },
  });

  return c.json(settlement);
});
