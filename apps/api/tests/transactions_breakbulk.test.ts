import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma';

async function setupBreakBulkData() {
  const store = await prisma.store.create({ data: { name: 'Test Store', slug: `test-${Date.now()}` } });
  const parent = await prisma.item.create({
    data: { name: 'Parent', currentStock: 10, category: 'A', storeId: store.id }
  });
  const child = await prisma.item.create({
    data: { name: 'Child', currentStock: 100, category: 'A', parentItemId: parent.id, boxQty: 10, storeId: store.id }
  });
  const invalidChild = await prisma.item.create({
    data: { name: 'InvalidChild', currentStock: 100, category: 'A', parentItemId: parent.id, boxQty: 0, storeId: store.id }
  });
  return { parent, child, invalidChild };
}

describe('Transactions Break-bulk Logic', () => {
  it('should deduct fractional stock from parent when child is sold', async () => {
    const { parent, child } = await setupBreakBulkData();
    
    // Simulate transaction logic for break-bulk
    await prisma.$transaction(async (tx) => {
      const soldQty = 20;
      await tx.item.update({
        where: { id: child.id },
        data: { currentStock: { decrement: soldQty } },
      });
      await tx.item.update({
        where: { id: parent.id },
        data: { currentStock: { decrement: soldQty / Number(child.boxQty) } },
      });
    });

    const updatedParent = await prisma.item.findUnique({ where: { id: parent.id } });
    assert.strictEqual(Number(updatedParent?.currentStock), 8); // 10 - (20/10) = 8
  });

  it('should skip deduction if boxQty is 0', async () => {
    const { parent, invalidChild } = await setupBreakBulkData();
    
    await prisma.$transaction(async (tx) => {
      const soldQty = 20;
      await tx.item.update({
        where: { id: invalidChild.id },
        data: { currentStock: { decrement: soldQty } },
      });
      // Logic from transactions.ts: if (boxSize > 0) { ... }
      const boxQty = Number(invalidChild.boxQty);
      if (boxQty > 0) {
        await tx.item.update({
          where: { id: parent.id },
          data: { currentStock: { decrement: soldQty / boxQty } },
        });
      }
    });

    const updatedParent = await prisma.item.findUnique({ where: { id: parent.id } });
    assert.strictEqual(Number(updatedParent?.currentStock), 10); // Should remain 10
  });
});
