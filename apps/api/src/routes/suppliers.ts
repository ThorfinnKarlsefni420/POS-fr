import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { getStoreContext } from '../middleware/store-context';

export const suppliersRouter = new Hono();

// List all suppliers
suppliersRouter.get('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const suppliers = await prisma.supplier.findMany({
    where: { storeId },
    orderBy: { name: 'asc' },
  });

  return c.json(suppliers);
});

// Create supplier
suppliersRouter.post('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const body = await c.req.json<{
    name: string;
    phone?: string;
    email?: string;
    isConsignment?: boolean;
    defaultType?: 'FIXED_COST' | 'PERCENTAGE_COMMISSION';
    defaultRate?: number;
  }>();

  if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400);

  const supplier = await prisma.supplier.create({
    data: {
      storeId,
      name: body.name.trim(),
      phone: body.phone ?? null,
      email: body.email ?? null,
      isConsignment: body.isConsignment ?? false,
      defaultType: body.defaultType ?? 'FIXED_COST',
      defaultRate: body.defaultRate ?? 0,
    },
  });

  return c.json(supplier, 201);
});

// Update supplier
suppliersRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    name?: string;
    phone?: string;
    email?: string;
    isConsignment?: boolean;
    defaultType?: 'FIXED_COST' | 'PERCENTAGE_COMMISSION';
    defaultRate?: number;
  }>();

  const supplier = await prisma.supplier.update({
    where: { id },
    data: {
      name: body.name?.trim(),
      phone: body.phone,
      email: body.email,
      isConsignment: body.isConsignment,
      defaultType: body.defaultType,
      defaultRate: body.defaultRate,
    },
  });

  return c.json(supplier);
});

// Delete supplier (if no active consignment sales)
suppliersRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');

  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: { consignmentSales: true },
  });

  if (!supplier) return c.json({ error: 'Supplier not found' }, 404);
  if (supplier.consignmentSales.length > 0) {
    return c.json({ error: 'Cannot delete supplier with active consignment sales' }, 400);
  }

  await prisma.supplier.delete({ where: { id } });
  return c.json({ success: true });
});

// GET /me: Fetch data for the authenticated supplier
suppliersRouter.get('/me', async (c) => {
  const { supplierId } = await getStoreContext(c);
  if (!supplierId) return c.json({ error: 'Supplier not authenticated' }, 401);

  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    include: {
      items: true,
      consignmentSales: {
        include: {
          lineItem: { include: { item: { select: { name: true } } } },
        },
      },
      settlements: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!supplier) return c.json({ error: 'Supplier not found' }, 404);

  return c.json(supplier);
});
