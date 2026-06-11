import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient(); // { adapter }

export async function warmUpDb(): Promise<void> {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    console.log('  ✓ DB connection ready');
  } catch (err) {
    console.warn('  ⚠ DB warmup failed — first request may be slow:', (err as Error).message);
  }
}
