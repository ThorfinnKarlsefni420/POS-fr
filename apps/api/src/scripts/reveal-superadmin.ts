import { prisma } from '../lib/prisma.ts';

async function main() {
  const superadmin = await (prisma as any).user.findFirst({
    where: { role: 'SUPERADMIN' },
    select: { id: true, name: true, pin: true }
  });
  console.log('Superadmin:', JSON.stringify(superadmin, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await (prisma as any).$disconnect();
  });
