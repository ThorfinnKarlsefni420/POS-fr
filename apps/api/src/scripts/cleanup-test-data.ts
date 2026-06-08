import { prisma } from '../lib/prisma';

async function main() {
  const usersToRemoveNames = ['Consignment Admin', 'Validation Admin', 'NoStore User'];
  const suppliersToRemoveNames = ['Test Supplier', 'E2E Test Supplier', 'Invalid Supplier'];

  console.log('Starting thorough cleanup...');

  // 1. Find IDs
  const users = await prisma.user.findMany({
    where: { name: { in: usersToRemoveNames } },
    select: { id: true }
  });
  const userIds = users.map(u => u.id);
  
  const suppliers = await prisma.supplier.findMany({
    where: { name: { in: suppliersToRemoveNames } },
    select: { id: true }
  });
  const supplierIds = suppliers.map(s => s.id);

  console.log('Users to remove:', userIds);
  console.log('Suppliers to remove:', supplierIds);

  // 2. Delete Dependents for Suppliers
  const sales = await prisma.consignmentSale.findMany({ where: { supplierId: { in: supplierIds } }, select: { id: true, lineItemId: true } });
  await prisma.consignmentSale.deleteMany({ where: { supplierId: { in: supplierIds } } });
  // Also clean up LineItems related to these sales if needed? Actually, LineItems belong to Transactions.
  // Maybe just ignore them, as they are not the main issue.
  await prisma.consignmentSettlement.deleteMany({ where: { supplierId: { in: supplierIds } } });

  // 3. Delete Dependents for Users
  const shifts = await prisma.shift.findMany({
    where: { userId: { in: userIds } },
    select: { id: true }
  });
  const shiftIds = shifts.map(s => s.id);
  
  const transactions = await prisma.transaction.findMany({ where: { OR: [{ userId: { in: userIds } }, { shiftId: { in: shiftIds } }] }, select: { id: true } });
  const transactionIds = transactions.map(t => t.id);

  await prisma.cashLog.deleteMany({ where: { shiftId: { in: shiftIds } } });
  await prisma.transactionPayment.deleteMany({ where: { transactionId: { in: transactionIds } } });
  await prisma.lineItem.deleteMany({ where: { transactionId: { in: transactionIds } } });
  await prisma.creditSale.deleteMany({ where: { transactionId: { in: transactionIds } } });
  await prisma.mkopoSale.deleteMany({ where: { transactionId: { in: transactionIds } } });
  await prisma.transaction.deleteMany({ where: { id: { in: transactionIds } } });
  await prisma.shift.deleteMany({ where: { id: { in: shiftIds } } });
  
  await prisma.vendorPayment.deleteMany({ where: { recordedById: { in: userIds } } });
  await prisma.mkopoPayment.deleteMany({ where: { recordedById: { in: userIds } } });

  // 4. Delete Users and Suppliers
  await prisma.supplier.deleteMany({ where: { id: { in: supplierIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  
  console.log('Cleanup complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await (prisma as any).$disconnect();
  });
