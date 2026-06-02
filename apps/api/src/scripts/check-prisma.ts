import { PrismaClient } from '@prisma/client';

console.log('DATABASE_URL:', process.env.DATABASE_URL);

const prisma = new PrismaClient();

async function main() {
  const stores = await prisma.store.findMany();
  console.log('Stores:', stores.length);
}

main().catch(console.error).finally(() => prisma.$disconnect());
