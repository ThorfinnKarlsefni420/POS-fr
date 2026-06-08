import { prisma } from '../lib/prisma';

async function main() {
  console.log('Adding Hasan as a supplier...');
  
  // Hasan's user is 'cmpav444k0000ckv9cnvoxz5u' in store 'store_hasans'
  const hasanUser = await prisma.user.findFirst({ where: { name: 'Hasan' } });
  
  if (!hasanUser) {
    console.error('Hasan user not found');
    process.exit(1);
  }

  const supplier = await prisma.supplier.create({
    data: {
      storeId: hasanUser.storeId!,
      name: 'Hasan',
      phone: '0700000000', // Example
      email: 'hasan@example.com',
      isConsignment: true,
      defaultType: 'FIXED_COST',
      defaultRate: 0,
    }
  });

  await prisma.user.update({
    where: { id: hasanUser.id },
    data: { supplierId: supplier.id }
  });

  console.log(`Added Hasan as supplier with ID: ${supplier.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await (prisma as any).$disconnect();
  });
