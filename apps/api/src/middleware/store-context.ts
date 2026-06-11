import { Context } from 'hono';
import { prisma } from '../lib/prisma';

export interface StoreContext {
  storeId: string | null;
  role: string;
  userId: string | null;
  supplierId: string | null;
}

export async function getStoreContext(c: Context): Promise<StoreContext> {
  const userId = c.req.header('X-User-Id');
  if (!userId) return { storeId: null, role: '', userId: null, supplierId: null };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { storeId: true, role: true, supplierId: true },
  });

  if (!user) return { storeId: null, role: '', userId, supplierId: null };

  if (user.role === 'SUPERADMIN') {
    // SUPERADMIN can scope to a specific store via X-Store-Id; without it storeId is null
    // (routes that need a storeId for SUPERADMIN should check themselves)
    const overrideStoreId = c.req.header('X-Store-Id') ?? null;
    return { storeId: overrideStoreId, role: 'SUPERADMIN', userId, supplierId: null };
  }

  return {
    storeId: user.storeId ?? null,
    role: user.role,
    userId,
    supplierId: user.supplierId ?? null,
  };
}
