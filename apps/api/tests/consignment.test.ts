import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { req, createTestStore, createAdminUser, createSuperadminUser, seedConsignmentSettings } from './harness';

const SLUG = `test-consignment-${Date.now()}`;

let storeId: string;
let adminId: string;
let superadminId: string;
let productId: string;
let supplierId: string;
let shiftId: string;

describe('Consignment Module Integration', { concurrency: false }, () => {

  before(async () => {
    // 1. Create a store
    const store = await createTestStore('Consignment Test Store', SLUG);
    storeId = store.id;

    // 2. Create an admin
    const admin = await createAdminUser(storeId, 'Test Admin');
    adminId = admin.id;

    // 3. Create a superadmin (simulated)
    const superadmin = await createSuperadminUser('Test Superadmin');
    superadminId = superadmin.id;

    // 4. Create a consignment supplier (PERCENTAGE_COMMISSION, 90%)
    const { body: sup } = await req('/suppliers', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({
        name: 'Test Consignment Supplier',
        isConsignment: true,
        defaultType: 'PERCENTAGE_COMMISSION',
        defaultRate: 0.90,
      }),
    });
    supplierId = (sup as any).id;

    // 5. Create a product and attach it to the consignment supplier
    const { body: p } = await req('/products', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({
        name: 'Consignment Item',
        sku: 'CONS-001',
        costPrice: 100,
        sellingPrice: 150,
        currentStock: 10,
        supplierId,
      }),
    });
    productId = (p as any).id;

    // 6. Start a shift
    const { body: sh } = await req('/shifts', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({ userId: adminId, startingCash: 1000 }),
    });
    shiftId = (sh as any).id;
  });

  after(async () => {
    if (storeId) {
      await req(`/stores/${storeId}`, { method: 'DELETE' });
    }
  });

  it('Initial state: Consignment should be disabled', async () => {
    const { body: settings } = await req('/settings', { storeId, userId: adminId });
    assert.equal((settings as any).consignmentEnabled, false);
  });

  it('Transaction with consignment DISABLED should NOT create ConsignmentSale', async () => {
    const { status } = await req('/transactions', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({
        items: [{ id: productId, quantity: 1, originalPrice: 150, soldPrice: 150 }],
        totalAmount: 150,
        taxAmount: 0,
        paymentType: 'CASH',
        userId: adminId,
        shiftId,
      }),
    });
    assert.equal(status, 201);

    // Master switch is off — no ConsignmentSale should be created even though supplier.isConsignment=true
    const { body: pending } = await req('/consignment/pending', { storeId, userId: adminId });
    assert.ok(Array.isArray(pending));
    assert.equal((pending as any[]).length, 0);
  });

  it('Enable Consignment module in settings', async () => {
    const status = await seedConsignmentSettings(storeId, true, 0.90, superadminId);
    assert.equal(status, 200);

    const { body: settings } = await req('/settings', { storeId, userId: adminId });
    assert.equal((settings as any).consignmentEnabled, true);
    assert.equal((settings as any).consignmentRate, 0.90);
  });

  it('Transaction with consignment ENABLED should create ConsignmentSale for Supplier', async () => {
    await req('/transactions', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({
        items: [{ id: productId, quantity: 1, originalPrice: 150, soldPrice: 150 }],
        totalAmount: 150,
        taxAmount: 0,
        paymentType: 'CASH',
        userId: adminId,
        shiftId,
      }),
    });

    const { body: pending } = await req('/consignment/pending', { storeId, userId: adminId });
    assert.ok(Array.isArray(pending));
    const groups = pending as any[];
    assert.equal(groups.length, 1);
    assert.equal(groups[0].supplier.name, 'Test Consignment Supplier');
    assert.equal(groups[0].sales.length, 1);
    assert.equal(Number(groups[0].sales[0].payoutAmount), 135);      // 150 * 0.90
    assert.equal(Number(groups[0].sales[0].superadminAmount), 15);   // 150 * 0.10
  });

  it('Refund of consignment transaction should VOID the ConsignmentSale', async () => {
    // 1. Create a new transaction to refund
    const { body: tx } = await req('/transactions', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({
        items: [{ id: productId, quantity: 1, originalPrice: 150, soldPrice: 150 }],
        totalAmount: 150,
        taxAmount: 0,
        paymentType: 'CASH',
        userId: adminId,
        shiftId,
      }),
    });
    const txId = (tx as any).id;
    const lineItemId = (tx as any).lineItems[0].id;

    // 2. Refund it
    const { status: refundStatus } = await req(`/transactions/${txId}/refund`, {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({
        items: [{ lineItemId, isDamaged: false }],
      }),
    });
    assert.equal(refundStatus, 200);

    // 3. The refunded sale should be VOIDED — only 1 pending sale should remain (from previous test)
    const { body: pending } = await req('/consignment/pending', { storeId, userId: adminId });
    const groups = pending as any[];
    assert.equal(groups[0].sales.length, 1);
  });

  it('Settle pending sales (SUPERADMIN only)', async () => {
    const { body: pending } = await req('/consignment/pending', { storeId, userId: superadminId });
    const group = (pending as any[])[0];
    const saleIds = group.sales.map((s: any) => s.id);

    // Admin attempt — should fail
    const { status: adminSettleStatus } = await req('/consignment/settle', {
      method: 'POST',
      userId: adminId,
      storeId,
      body: JSON.stringify({ supplierId: group.supplier.id, saleIds }),
    });
    assert.equal(adminSettleStatus, 403);

    // Superadmin attempt — should succeed
    const { status: saSettleStatus, body: settlement } = await req('/consignment/settle', {
      method: 'POST',
      userId: superadminId,
      storeId,
      body: JSON.stringify({ supplierId: group.supplier.id, saleIds }),
    });
    assert.equal(saSettleStatus, 201);
    assert.equal((settlement as any).status, 'UNPAID');
    assert.equal(Number((settlement as any).totalAmount), 135);
  });

  it('Pay settlement (SUPERADMIN only)', async () => {
    const { body: settlements } = await req('/consignment/settlements', { userId: adminId, storeId });
    const settlementId = (settlements as any[])[0].id;

    // Admin attempt — should fail
    const { status: adminPayStatus } = await req(`/consignment/settlements/${settlementId}/pay`, {
      method: 'PATCH',
      userId: adminId,
      storeId,
    });
    assert.equal(adminPayStatus, 403);

    // Superadmin attempt — should succeed
    const { status: saPayStatus, body: paidSettlement } = await req(`/consignment/settlements/${settlementId}/pay`, {
      method: 'PATCH',
      userId: superadminId,
      storeId,
    });
    assert.equal(saPayStatus, 200);
    assert.equal((paidSettlement as any).status, 'PAID');
    assert.ok((paidSettlement as any).paidAt);
  });

});
