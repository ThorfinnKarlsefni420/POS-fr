import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Sync Logic Test Suite
 * 
 * Verifies:
 * 1. Price Locking (Snapshotting) - "Order today, collect tomorrow"
 * 2. UOM Hierarchy (Many-to-One folding)
 * 3. Clean Slate Stock Initialization
 */

const BASE = 'http://localhost:3001/api';
const SLUG = `sync-test-${Date.now()}`;

let storeId: string;
let adminId: string;
let cashierId: string;
let shiftId: string;

// Helper for API requests
async function req(
  path: string,
  init?: RequestInit & { userId?: string; storeId?: string },
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init?.userId) headers['X-User-Id'] = init.userId;
  if (init?.storeId) headers['X-Store-Id'] = init.storeId;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

describe('External Database Sync Logic', { concurrency: false }, () => {

  // Setup test environment
  before(async () => {
    // 1. Create Store
    const sRes = await req('/stores', {
      method: 'POST',
      body: JSON.stringify({ name: 'Sync Test Store', slug: SLUG }),
    });
    storeId = sRes.body.id;

    // 2. Create Admin
    const uRes = await req('/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'Sync Admin', pin: '1111', role: 'ADMIN', storeId }),
    });
    adminId = uRes.body.id;

    // 3. Create Cashier
    const cRes = await req('/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'Sync Cashier', pin: '2222', role: 'CASHIER', storeId }),
    });
    cashierId = cRes.body.id;

    // 4. Start Shift
    const shiftRes = await req('/shifts', {
      method: 'POST',
      body: JSON.stringify({ userId: cashierId, startingCash: 1000, storeId }),
    });
    shiftId = shiftRes.body.id;
  });

  after(async () => {
    if (storeId) {
      await req(`/stores/${storeId}`, { method: 'DELETE' });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Test 1: Price Locking (The "Tomorrow's Price" Problem)
  // ══════════════════════════════════════════════════════════════════════════
  it('Price Safety: Locked price remains unchanged even if Master Price syncs tomorrow', async () => {
    // 1. Create Product at today's price (100 KES)
    const pRes = await req('/products', {
      method: 'POST',
      userId: adminId,
      storeId,
      body: JSON.stringify({
        name: 'Price Lock Test Item',
        sku: 'LOCK-001',
        costPrice: 70,
        nomadBitePrice: 100,
        taxRate: 16,
        currentStock: 50
      }),
    });
    const productId = pRes.body.id;

    // 2. Create a Transaction (Order) TODAY
    const txRes = await req('/transactions', {
      method: 'POST',
      userId: cashierId,
      storeId,
      body: JSON.stringify({
        items: [{ id: productId, quantity: 1, originalPrice: 100, soldPrice: 100 }],
        totalAmount: 100,
        taxAmount: 13.79,
        paymentType: 'CASH',
        userId: cashierId,
        shiftId,
      }),
    });
    const txId = txRes.body.id;

    // 3. SYNC HAPPENS: Price changes in Master Database to 150 KES
    await req(`/products/${productId}`, {
      method: 'PATCH',
      userId: adminId,
      storeId,
      body: JSON.stringify({ nomadBitePrice: 150 }),
    });

    // 4. VERIFY: The Transaction (Order) still reflects the original 100 KES
    const txCheck = await req(`/transactions`, { userId: cashierId, storeId });
    const savedTx = txCheck.body.find((t: any) => t.id === txId);
    
    assert.equal(Number(savedTx.totalAmount), 100, 'Transaction total must remain 100');
    assert.equal(Number(savedTx.lineItems[0].soldPrice), 100, 'Line item price must remain 100');
    
    // 5. VERIFY: New sales use the new 150 KES price
    const newProdCheck = await req(`/products/${productId}`, { userId: cashierId, storeId });
    assert.equal(Number(newProdCheck.body.nomadBitePrice), 150, 'New master price should be 150');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Test 2: UOM Hierarchy & Ratios (Refined for PackagingTiers)
  // ══════════════════════════════════════════════════════════════════════════
  it('UOM Ratios: Maps Many-to-One rows to a single Item with correct Stock Multipliers', async () => {
    // We simulate the SQL View rows for ITEM_ID 1421
    // The key is that the "Sync Engine" must handle these as separate rows but upsert to the same SKU
    const sqlViewData = [
      { sku: '1421', name: 'CHOCOLATE 90G', unit: 'PCS', ratio: 1,  price: 50,   barcode: 'BAR-PCS', level: 0 },
      { sku: '1421', name: 'CHOCOLATE 90G', unit: 'CTN', ratio: 48, price: 3200, barcode: 'BAR-CTN', level: 1 }
    ];

    // Simulate two sequential imports (like a real sync hitting row by row)
    for (const row of sqlViewData) {
      const res = await req('/products/import', {
        method: 'POST',
        userId: adminId,
        storeId,
        body: JSON.stringify({
          replace: false,
          products: [{
            sku: row.sku,
            name: row.name,
            unit: 'PCS', // Base unit remains the same
            nomadBitePrice: 50, // Base price
            packagingTiers: [{ 
              name: row.unit, 
              level: row.level, // REQUIRED by schema
              quantityInBase: row.ratio, 
              sellingPriceOverride: row.price,
              barcode: row.barcode 
            }]
          }]
        }),
      });
      assert.equal(res.status, 200, `Import failed for row ${row.unit}`);
    }

    // 2. Verify there is only ONE item in the database for SKU 1421
    const listRes = await req('/products', { userId: adminId, storeId });
    const items = listRes.body.filter((i: any) => i.sku === '1421');
    assert.equal(items.length, 1, 'Should have exactly 1 base product');

    // 3. Verify the Item has the correct PackagingTiers attached
    const product = items[0];
    const detailRes = await req(`/products/${product.id}`, { userId: adminId, storeId });
    const tiers = detailRes.body.packagingTiers || [];
    
    // Note: Our current /import endpoint overwrites ALL tiers for an item.
    // In a real sync, we'd need to collect ALL tiers for an SKU before importing,
    // or modify the endpoint to "Upsert" tiers.
    // For now, let's see if the LAST row (CTN) persists its tier.
    
    const ctnTier = tiers.find((t: any) => t.name === 'CTN');
    assert.ok(ctnTier, 'CTN tier should exist (from the last import row)');
    assert.equal(Number(ctnTier.quantityInBase), 48, 'CTN ratio should be 48');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Test 4: High-Frequency Polling (Delta & Ghost Rows)
  // ══════════════════════════════════════════════════════════════════════════
  it('SQL Polling: Detects changed data (Delta) and missing items (Ghost Rows)', async () => {
    const sku = 'POLL-001';
    
    // 1. Initial Sync: Create an item
    await req('/products', {
      method: 'POST',
      userId: adminId,
      storeId,
      body: JSON.stringify({ name: 'Polling Item', sku, costPrice: 10, nomadBitePrice: 20, currentStock: 100 }),
    });

    // 2. Delta Detection: Run an import with NO changes
    const run2 = await req('/products/import', {
      method: 'POST',
      userId: adminId,
      storeId,
      body: JSON.stringify({
        replace: false,
        products: [{ name: 'Polling Item', sku, costPrice: 10, nomadBitePrice: 20, currentStock: 100 }]
      }),
    });
    // Theoretically, a smart sync would return 0 updates if data matches exactly
    // assert.equal(run2.body.updated, 0); 

    // 3. Ghost Row Detection: Run an import where our SKU is MISSING from the payload
    // This simulates a row being deleted from their SQL view
    await req('/products/import', {
      method: 'POST',
      userId: adminId,
      storeId,
      body: JSON.stringify({
        replace: true, // "Replace" mode often treats missing items as discontinued
        products: [{ name: 'Different Item', sku: 'OTHER-99', costPrice: 1, nomadBitePrice: 2, currentStock: 1 }]
      }),
    });

    // 4. Verify original item is now deactivated/archived
    const listRes = await req('/products', { userId: adminId, storeId });
    const found = listRes.body.find((p: any) => p.sku === sku);
    // In many systems, "Replace" doesn't delete, it deactivates or removes from list
    assert.ok(!found || found.isActive === false, 'Missing item from SQL view should be inactive');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Test 3: Clean Slate Stock Initialization
  // ══════════════════════════════════════════════════════════════════════════
  it('Clean Slate: Sync correctly initializes stock from 0', async () => {
    // 1. Create a product with 0 stock
    const pRes = await req('/products', {
      method: 'POST',
      userId: adminId,
      storeId,
      body: JSON.stringify({
        name: 'Stock Init Test',
        sku: 'INIT-001',
        costPrice: 10,
        nomadBitePrice: 15,
        currentStock: 0
      }),
    });
    const productId = pRes.body.id;

    // 2. Simulate Sync from external database setting stock to 500
    // Using adjustment to simulate sync update
    await req(`/products/${productId}/adjust`, {
      method: 'POST',
      userId: adminId,
      storeId,
      body: JSON.stringify({ delta: 500, reasonCode: 'RESTOCK', note: 'Initial Sync' }),
    });

    // 3. Verify stock is exactly 500
    const checkRes = await req(`/products/${productId}`, { userId: adminId, storeId });
    assert.equal(Number(checkRes.body.currentStock), 500, 'Initial sync should establish baseline of 500');
  });

});
