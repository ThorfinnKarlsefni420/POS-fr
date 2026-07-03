import { prisma } from '../lib/prisma.ts';

async function main() {
  const slug = 'grain-industries';

  const existing = await (prisma as any).store.findUnique({ where: { slug } });
  if (existing) {
    console.log('Store already exists:', JSON.stringify(existing, null, 2));
    return;
  }

  const store = await (prisma as any).store.create({
    data: {
      name: 'Grain Industries Limited',
      slug,
      phone: '+254202304629',
      email: 'Customercare@Grainindustries.com',
      address: 'Beira Street, Shimanzi, Mombasa Kenya. P.O. BOX 43362-80100, Mombasa',
    },
  });

  console.log('Store created:', JSON.stringify(store, null, 2));

  const admin = await (prisma as any).user.create({
    data: {
      name: 'Admin',
      pin: '1234',
      role: 'ADMIN',
      storeId: store.id,
    },
    select: { id: true, name: true, role: true, storeId: true },
  });

  console.log('Admin user created:', JSON.stringify(admin, null, 2));
  console.log('\nDone. PIN is 1234 — change it after first login.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await (prisma as any).$disconnect();
  });
