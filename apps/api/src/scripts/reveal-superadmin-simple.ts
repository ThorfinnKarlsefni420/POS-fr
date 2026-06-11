import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const superadmin = await prisma.user.findFirst({
    where: { role: 'SUPERADMIN' },
    select: { id: true, name: true, pin: true }
  });
  console.log('Superadmin:', JSON.stringify(superadmin, null, 2));
  await prisma.$disconnect();
}

main().catch(console.error);
