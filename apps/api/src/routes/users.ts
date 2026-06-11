import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { getStoreContext } from '../middleware/store-context';

export const usersRouter = new Hono();

usersRouter.get('/', async (c) => {
  const { storeId, role } = await getStoreContext(c);
  const users = await prisma.user.findMany({
    where: role === 'SUPERADMIN' && !storeId ? {} : { storeId: storeId ?? undefined },
    select: { id: true, name: true, role: true, storeId: true },
    orderBy: { name: 'asc' },
  });
  return c.json(users);
});

usersRouter.post('/', async (c) => {
  const body = await c.req.json<{
    name: string;
    pin: string;
    role?: 'ADMIN' | 'CASHIER' | 'SUPERADMIN';
    storeId?: string;
  }>();

  // Default role is CASHIER in schema
  const role = body.role ?? 'CASHIER';
  
  // Use storeId from body if provided. 
  // For SUPERADMIN, it can be null. For others, it should ideally be provided.
  const storeId = body.storeId ?? (role === 'SUPERADMIN' ? null : undefined);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: body.name,
        pin: body.pin,
        role,
        storeId,
      },
      select: { id: true, name: true, role: true, storeId: true },
    });

    if (body.role === 'ADMIN') {
        await tx.supplier.create({
            data: {
                storeId,
                name: body.name, // Using admin name as supplier name
                phone: `+254700${Math.floor(Math.random() * 900000)}`, // Random placeholder
                email: `supplier.${Date.now()}@example.com`, // Random placeholder
                isConsignment: true, // Default to consignment for vendors
                defaultType: 'FIXED_COST',
                defaultRate: 0,
            }
        });
    }

    return user;
  });

  return c.json(result, 201);
});

// Verify a specific user's PIN (for login)
usersRouter.post('/verify', async (c) => {
  const body = await c.req.json<{ userId: string; pin: string }>();
  const user = await prisma.user.findUnique({
    where: { id: body.userId },
    select: { id: true, name: true, role: true, pin: true, storeId: true },
  });
  // TODO: replace plain comparison with bcrypt.compare() before production
  if (!user || user.pin !== body.pin) {
    return c.json({ error: 'Invalid PIN' }, 401);
  }
  return c.json({ id: user.id, name: user.name, role: user.role, storeId: user.storeId });
});

// Update a user (name, pin, role, storeId)
usersRouter.patch('/:id', async (c) => {
  const body = await c.req.json<{
    name?: string;
    pin?: string;
    role?: 'ADMIN' | 'CASHIER' | 'SUPERADMIN';
    storeId?: string | null;
  }>();
  const user = await prisma.user.update({
    where: { id: c.req.param('id') },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.pin  !== undefined && { pin:  body.pin  }),
      ...(body.role !== undefined && { role: body.role }),
      ...(body.storeId !== undefined && { storeId: body.storeId }),
    },
    select: { id: true, name: true, role: true, storeId: true },
  });
  return c.json(user);
});

// Delete a user — blocked if user has any shifts or transactions (audit trail)
usersRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const [shifts, txs] = await Promise.all([
    prisma.shift.count({ where: { userId: id } }),
    prisma.transaction.count({ where: { userId: id } }),
  ]);
  if (shifts > 0 || txs > 0) {
    return c.json({ error: 'Cannot delete a user who has transaction history.' }, 409);
  }
  await prisma.user.delete({ where: { id } });
  return c.json({ ok: true });
});

// Verify any admin PIN (for the admin PIN gate)
usersRouter.post('/verify-admin', async (c) => {
  const body = await c.req.json<{ pin: string }>();
  // TODO: replace plain comparison with bcrypt.compare() before production
  const admin = await prisma.user.findFirst({
    where: { role: { in: ['ADMIN', 'SUPERADMIN'] }, pin: body.pin },
    select: { id: true, name: true, role: true },
  });
  if (!admin) return c.json({ error: 'Invalid admin PIN' }, 401);
  return c.json(admin);
});
