import { prisma } from '../lib/prisma.ts';

async function main() {
  const usersToRemove = ['Test Admin', 'Jane Cashier'];
  
  // Find IDs
  const users = await (prisma as any).user.findMany({
    where: { name: { in: usersToRemove } },
    select: { id: true }
  });
  const userIds = users.map((u: any) => u.id);
  
  console.log(`Removing users with IDs: ${userIds.join(', ')}`);

  // We need to delete records in a way that respects FK constraints.
  // The error indicated 'CashLog_shiftId_fkey'.
  // Shift depends on User. CashLog depends on Shift.
  // Order of deletion must be the reverse of dependency graph:
  // CashLog -> Shift -> [User]

  // Find shifts related to these users
  const shifts = await (prisma as any).shift.findMany({
    where: { userId: { in: userIds } },
    select: { id: true }
  });
  const shiftIds = shifts.map((s: any) => s.id);

  // 1. Delete CashLogs for these shifts
  await (prisma as any).cashLog.deleteMany({ where: { shiftId: { in: shiftIds } } });
  // 2. Delete Shifts
  await (prisma as any).shift.deleteMany({ where: { userId: { in: userIds } } });
  
  // Also delete other references:
  await (prisma as any).transaction.deleteMany({ where: { userId: { in: userIds } } });
  await (prisma as any).vendorPayment.deleteMany({ where: { recordedById: { in: userIds } } });
  await (prisma as any).mkopoPayment.deleteMany({ where: { recordedById: { in: userIds } } });

  const result = await (prisma as any).user.deleteMany({
    where: { id: { in: userIds } }
  });
  
  console.log(`Deleted ${result.count} users.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await (prisma as any).$disconnect();
  });
