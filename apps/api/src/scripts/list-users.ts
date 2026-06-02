import { prisma } from '../lib/prisma.ts';

async function main() {
  const users = await (prisma as any).user.findMany({
    select: { id: true, name: true, role: true }
  });
  console.log('Users:', JSON.stringify(users, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await (prisma as any).$disconnect();
  });
