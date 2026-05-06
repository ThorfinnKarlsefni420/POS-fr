import { Context } from 'hono';
import { prisma } from '../lib/prisma';

export async function getStoreContext(
  c: Context
): Promise<{ storeId: string | null; role: string; userId: string | null }> {
  const userId = c.req.header('X-User-Id');
  if (!userId) return { storeId: null, role: 'CASHIER', userId: null };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { storeId: true, role: true },
  });

  if (!user) return { storeId: null, role: 'CASHIER', userId };

  // SUPERADMIN can override storeId via X-Store-Id header
  if (user.role === 'SUPERADMIN') {
    const overrideStoreId = c.req.header('X-Store-Id') ?? null;
    return { storeId: overrideStoreId, role: 'SUPERADMIN', userId };
  }

  return { storeId: user.storeId, role: user.role, userId };
}
