import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({
    connectionString: url,
    connectionTimeoutMillis: 20_000,
    idleTimeoutMillis: 30_000, // evict before PgBouncer's server_idle_timeout (~60s)
    max: 5,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });
  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({ adapter });

  // Retry once on ETIMEDOUT — happens when PgBouncer closes a stale socket
  // and Prisma tries to reuse it before the pool evicts it.
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          try {
            return await query(args);
          } catch (err: any) {
            if (err?.code === 'ETIMEDOUT') return await query(args);
            throw err;
          }
        },
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;
const globalForPrisma = globalThis as unknown as { prisma: ExtendedPrismaClient };
export const prisma = globalForPrisma.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export async function warmUpDb(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('  ✓ DB connection ready');
  } catch (err) {
    console.warn('  ⚠ DB warmup failed — first request may be slow:', (err as Error).message);
  }
}
