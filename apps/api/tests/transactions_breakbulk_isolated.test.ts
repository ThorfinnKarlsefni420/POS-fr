import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE = 'http://localhost:3001/api';
const SLUG = `iso-trans-breakbulk-${Date.now()}`;

let storeId: string;
let adminId: string;
let shiftId: string;

async function req(
  path: string,
  init?: RequestInit & { userId?: string; storeId?: string },
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init?.userId) headers['X-User-Id'] = init.userId;
  if (init?.storeId) headers['X-Store-Id'] = init.storeId;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

describe('Transactions Break-bulk Isolated Tests', { concurrency: false }, () => {

  before(async () => {
    // 1. Create a store
    const { body: s } = await req('/stores', {
      method: 'POST',
      body: JSON.stringify({ name: 'Iso Breakbulk Store', slug: SLUG }),
    });
    storeId = (s as any).id;

    // 2. Create an admin
    const { body: u } = await req('/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'Iso Admin', pin: '1234', role: 'ADMIN', storeId }),
    });
    adminId = (u as any).id;

    // 3. Start a shift
    const { body: sh } = await req('/shifts', {
      method: 'POST',
      storeId,
      body: JSON.stringify({ userId: adminId, startingCash: 1000 }),
    });
    shiftId = (sh as any).id;
  });

  after(async () => {
    if (storeId) {
      await req(`/stores/${storeId}`, { method: 'DELETE' });
    }
  });

  it('should deduct fractional stock from parent when child is sold', async () => {
    // 1. Create parent
    const { body: parent } = await req('/products', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({ name: 'Parent', sku: 'P-001', currentStock: 10, sellingPrice: 100 }),
    });
    const parentId = (parent as any).id;

    // 2. Create child with boxQty 10
    const { body: child } = await req('/products', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({ name: 'Child', sku: 'C-001', currentStock: 100, sellingPrice: 20, parentItemId: parentId, boxQty: 10 }),
    });
    const childId = (child as any).id;

    // 3. Sell 20 units of child
    await req('/transactions', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({
        items: [{ id: childId, quantity: 20, originalPrice: 20, soldPrice: 20 }],
        totalAmount: 400,
        taxAmount: 0,
        paymentType: 'CASH',
        userId: adminId,
        shiftId,
      }),
    });

    // 4. Verify parent stock: 10 - (20/10) = 8
    const { body: updatedParent } = await req(`/products/${parentId}`, { storeId });
    assert.equal(Number((updatedParent as any).currentStock), 8);
  });

  it('should not deduct if parent relationship missing or boxQty is 0', async () => {
    // 1. Create parent
    const { body: parent } = await req('/products', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({ name: 'Parent2', sku: 'P-002', currentStock: 10, sellingPrice: 100 }),
    });
    const parentId = (parent as any).id;

    // 2. Create child with boxQty 0
    const { body: invalidChild } = await req('/products', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({ name: 'InvalidChild', sku: 'C-002', currentStock: 100, sellingPrice: 20, parentItemId: parentId, boxQty: 0 }),
    });
    const childId = (invalidChild as any).id;

    // 3. Sell 20 units
    await req('/transactions', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({
        items: [{ id: childId, quantity: 20, originalPrice: 20, soldPrice: 20 }],
        totalAmount: 400,
        taxAmount: 0,
        paymentType: 'CASH',
        userId: adminId,
        shiftId,
      }),
    });

    // 4. Verify parent stock remains 10
    const { body: updatedParent } = await req(`/products/${parentId}`, { storeId });
    assert.equal(Number((updatedParent as any).currentStock), 10);
  });
});
