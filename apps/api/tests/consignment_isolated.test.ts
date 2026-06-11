import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { req, createTestStore, createAdminUser, createSuperadminUser } from './harness';

const SLUG = `iso-consignment-${Date.now()}`;

let storeId: string;
let adminId: string;
let superadminId: string;
let shiftId: string;

describe('Consignment Isolated Logic', { concurrency: false }, () => {

  before(async () => {
    const store = await createTestStore('Isolated Consignment Store', SLUG);
    storeId = store.id;

    const admin = await createAdminUser(storeId, 'Iso Admin');
    adminId = admin.id;

    const superadmin = await createSuperadminUser('Iso Superadmin');
    superadminId = superadmin.id;

    // Enable master switch — required by spec before any ConsignmentSale is created
    await req('/settings', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({ consignmentEnabled: true }),
    });

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

  it('Supplier FIXED_COST: ConsignmentSale should match costPrice', async () => {
    const { body: supplier } = await req('/suppliers', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({
        name: 'Fixed Cost Supplier',
        isConsignment: true,
        defaultType: 'FIXED_COST',
      }),
    });
    const supplierId = (supplier as any).id;

    const { body: item } = await req('/products', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({
        name: 'Fixed Cost Item',
        sku: 'FC-001',
        costPrice: 80,
        sellingPrice: 120,
        currentStock: 100,
        supplierId,
      }),
    });
    const itemId = (item as any).id;

    await req('/transactions', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({
        items: [{ id: itemId, quantity: 2, originalPrice: 120, soldPrice: 120 }],
        totalAmount: 240,
        taxAmount: 0,
        paymentType: 'CASH',
        userId: adminId,
        shiftId,
      }),
    });

    const { body: pending } = await req('/consignment/pending', { storeId, userId: adminId });
    assert.ok(Array.isArray(pending));
    const group = (pending as any[]).find(g => g.supplier.id === supplierId);
    assert.ok(group);
    assert.equal(group.sales.length, 1);
    assert.equal(Number(group.sales[0].supplierAmount), 160);   // 80 * 2
    assert.equal(Number(group.sales[0].superadminAmount), 80);  // 240 - 160
  });

  it('Supplier PERCENTAGE_COMMISSION: ConsignmentSale should match rate', async () => {
    const { body: supplier } = await req('/suppliers', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({
        name: 'Percent Supplier',
        isConsignment: true,
        defaultType: 'PERCENTAGE_COMMISSION',
        defaultRate: 0.80,
      }),
    });
    const supplierId = (supplier as any).id;

    const { body: item } = await req('/products', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({
        name: 'Percent Item',
        sku: 'PC-001',
        costPrice: 50,
        sellingPrice: 100,
        currentStock: 100,
        supplierId,
      }),
    });
    const itemId = (item as any).id;

    await req('/transactions', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({
        items: [{ id: itemId, quantity: 1, originalPrice: 100, soldPrice: 90 }],
        totalAmount: 90,
        taxAmount: 0,
        paymentType: 'CASH',
        userId: adminId,
        shiftId,
      }),
    });

    const { body: pending } = await req('/consignment/pending', { storeId, userId: adminId });
    assert.ok(Array.isArray(pending));
    const group = (pending as any[]).find(g => g.supplier.id === supplierId);
    assert.ok(group);
    assert.equal(Number(group.sales[0].supplierAmount), 72);    // 90 * 0.80
    assert.equal(Number(group.sales[0].superadminAmount), 18);  // 90 * 0.20
  });

  it('Supplier rate overrides store-level consignment rate', async () => {
    // Store has consignmentRate=0.90 (set in before). Supplier has its own rate=0.70.
    // Supplier config always takes precedence per spec.
    const { body: supplier } = await req('/suppliers', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({
        name: 'Override Supplier',
        isConsignment: true,
        defaultType: 'PERCENTAGE_COMMISSION',
        defaultRate: 0.70,
      }),
    });
    const supplierId = (supplier as any).id;

    const { body: item } = await req('/products', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({
        name: 'Override Item',
        sku: 'OR-001',
        costPrice: 50,
        sellingPrice: 100,
        currentStock: 100,
        supplierId,
      }),
    });
    const itemId = (item as any).id;

    await req('/transactions', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({
        items: [{ id: itemId, quantity: 1, originalPrice: 100, soldPrice: 100 }],
        totalAmount: 100,
        taxAmount: 0,
        paymentType: 'CASH',
        userId: adminId,
        shiftId,
      }),
    });

    const { body: pending } = await req('/consignment/pending', { storeId, userId: adminId });
    assert.ok(Array.isArray(pending));
    const group = (pending as any[]).find(g => g.supplier.id === supplierId);
    assert.ok(group);
    assert.equal(Number(group.sales[0].supplierAmount), 70);    // 100 * 0.70 (not 0.90)
    assert.equal(Number(group.sales[0].superadminAmount), 30);  // 100 * 0.30
  });

  it('Settlement calculation accuracy across multiple transactions', async () => {
    const { body: supplier } = await req('/suppliers', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({
        name: 'Settlement Accuracy Supplier',
        isConsignment: true,
        defaultType: 'PERCENTAGE_COMMISSION',
        defaultRate: 0.50,
      }),
    });
    const supplierId = (supplier as any).id;

    const { body: item } = await req('/products', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({
        name: 'Accuracy Item',
        sku: 'ACC-001',
        costPrice: 10,
        sellingPrice: 20,
        currentStock: 100,
        supplierId,
      }),
    });
    const itemId = (item as any).id;

    // Transaction 1: 1 unit at 20 → supplierAmount=10, superadminAmount=10
    await req('/transactions', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({
        items: [{ id: itemId, quantity: 1, originalPrice: 20, soldPrice: 20 }],
        totalAmount: 20,
        taxAmount: 0,
        paymentType: 'CASH',
        userId: adminId,
        shiftId,
      }),
    });

    // Transaction 2: 2 units at 15 (discounted) → soldTotal=30, supplierAmount=15, superadminAmount=15
    await req('/transactions', {
      method: 'POST',
      storeId,
      userId: adminId,
      body: JSON.stringify({
        items: [{ id: itemId, quantity: 2, originalPrice: 20, soldPrice: 15 }],
        totalAmount: 30,
        taxAmount: 0,
        paymentType: 'CASH',
        userId: adminId,
        shiftId,
      }),
    });

    const { body: pending } = await req('/consignment/pending', { storeId, userId: adminId });
    assert.ok(Array.isArray(pending));
    const group = (pending as any[]).find(g => g.supplier.id === supplierId);
    assert.ok(group);
    const saleIds = group.sales.map((s: any) => s.id);

    const { body: settlement } = await req('/consignment/settle', {
      method: 'POST',
      userId: superadminId,
      storeId,
      body: JSON.stringify({ supplierId, saleIds }),
    });

    // totalAmount = sum of payoutAmount = sum of supplierAmount = 10 + 15 = 25
    assert.equal(Number((settlement as any).totalAmount), 25);
    assert.equal(Number((settlement as any).supplierAmount), 25);
    assert.equal(Number((settlement as any).superadminAmount), 25);
  });

  it('Error: settle with non-existent supplier returns 404', async () => {
    const { status } = await req('/consignment/settle', {
      method: 'POST',
      userId: superadminId,
      storeId,
      body: JSON.stringify({ supplierId: 'non-existent', saleIds: ['bad-id'] }),
    });
    assert.equal(status, 404);
  });

  it('Error: non-superadmin cannot settle', async () => {
    const { status } = await req('/consignment/settle', {
      method: 'POST',
      userId: adminId,
      storeId,
      body: JSON.stringify({ supplierId: 'some-id', saleIds: [] }),
    });
    assert.equal(status, 403);
  });

});
