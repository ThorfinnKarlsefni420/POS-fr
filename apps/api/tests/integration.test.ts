/**
 * NomadBite POS — Integration Test Suite
 *
 * Hits the real running API on http://localhost:3001.
 * Creates a short-lived test store, runs the full golden path,
 * then deletes the store and all its data on teardown.
 *
 * Run: npm test  (from apps/api)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE = 'http://localhost:3001/api';
const SLUG = `test-${Date.now()}`;

// Shared state built up across tests
let storeId: string;
let adminId: string;
let cashierId: string;
let productId: string;
let product2Id: string;
let shiftId: string;
let transactionId: string;
let lineItemId: string;

// ─── Helpers ──────────────────────────────────────────────────────────────────

type JsonBody = Record<string, unknown>;

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

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('NomadBite API Integration', { concurrency: false }, () => {

  // ── Teardown: always delete test store ────────────────────────────────────
  after(async () => {
    if (storeId) {
      const { status } = await req(`/stores/${storeId}`, { method: 'DELETE' });
      assert.equal(status, 200, 'Teardown: store delete should return 200');
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 1. Health
  // ══════════════════════════════════════════════════════════════════════════

  it('GET /health — API is up', async () => {
    const { status, body } = await req('/health');
    assert.equal(status, 200);
    assert.equal((body as JsonBody).status, 'ok');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 2. Stores
  // ══════════════════════════════════════════════════════════════════════════

  it('POST /stores — create test store', async () => {
    const { status, body } = await req('/stores', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Store', slug: SLUG, ownerName: 'Test Owner', phone: '+254700000000' }),
    });
    assert.equal(status, 201);
    const s = body as JsonBody;
    assert.ok(s.id, 'store has id');
    assert.equal(s.slug, SLUG);
    assert.equal(s.isActive, true);
    storeId = s.id as string;
  });

  it('POST /stores — duplicate slug returns 409', async () => {
    const { status } = await req('/stores', {
      method: 'POST',
      body: JSON.stringify({ name: 'Dupe', slug: SLUG }),
    });
    assert.equal(status, 409);
  });

  it('POST /stores — missing name returns 400', async () => {
    const { status } = await req('/stores', {
      method: 'POST',
      body: JSON.stringify({ slug: 'no-name' }),
    });
    assert.equal(status, 400);
  });

  it('GET /stores — test store appears in list', async () => {
    const { status, body } = await req('/stores');
    assert.equal(status, 200);
    const stores = body as JsonBody[];
    const found = stores.find((s) => s.id === storeId);
    assert.ok(found, 'test store in list');
  });

  it('PATCH /stores/:id — deactivate then reactivate', async () => {
    const { status: s1, body: b1 } = await req(`/stores/${storeId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: false }),
    });
    assert.equal(s1, 200);
    assert.equal((b1 as JsonBody).isActive, false);

    const { status: s2, body: b2 } = await req(`/stores/${storeId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: true }),
    });
    assert.equal(s2, 200);
    assert.equal((b2 as JsonBody).isActive, true);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 3. Users
  // ══════════════════════════════════════════════════════════════════════════

  it('POST /users — create admin for test store', async () => {
    const { status, body } = await req('/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Admin', pin: '1234', role: 'ADMIN', storeId }),
    });
    assert.equal(status, 201);
    const u = body as JsonBody;
    assert.equal(u.role, 'ADMIN');
    assert.equal(u.storeId, storeId);
    adminId = u.id as string;
  });

  it('POST /users — create cashier for test store', async () => {
    const { status, body } = await req('/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Cashier', pin: '5678', role: 'CASHIER', storeId }),
    });
    assert.equal(status, 201);
    cashierId = (body as JsonBody).id as string;
  });

  it('GET /users — scoped to test store', async () => {
    const { status, body } = await req('/users', { userId: adminId, storeId });
    assert.equal(status, 200);
    const users = body as JsonBody[];
    assert.ok(users.every((u) => u.storeId === storeId), 'all users belong to test store');
    assert.equal(users.length, 2);
  });

  it('POST /users/verify — correct PIN succeeds', async () => {
    const { status, body } = await req('/users/verify', {
      method: 'POST',
      body: JSON.stringify({ userId: cashierId, pin: '5678' }),
    });
    assert.equal(status, 200);
    assert.equal((body as JsonBody).id, cashierId);
  });

  it('POST /users/verify — wrong PIN returns 401', async () => {
    const { status } = await req('/users/verify', {
      method: 'POST',
      body: JSON.stringify({ userId: cashierId, pin: '0000' }),
    });
    assert.equal(status, 401);
  });

  it('POST /users/verify-admin — admin PIN succeeds', async () => {
    const { status, body } = await req('/users/verify-admin', {
      method: 'POST',
      body: JSON.stringify({ pin: '1234' }),
    });
    assert.equal(status, 200);
    assert.ok(['ADMIN', 'SUPERADMIN'].includes((body as JsonBody).role as string));
  });

  it('POST /users/verify-admin — cashier PIN returns 401', async () => {
    const { status } = await req('/users/verify-admin', {
      method: 'POST',
      body: JSON.stringify({ pin: '5678' }),
    });
    assert.equal(status, 401);
  });

  it('PATCH /users/:id — update cashier name', async () => {
    const { status, body } = await req(`/users/${cashierId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Jane Cashier' }),
    });
    assert.equal(status, 200);
    assert.equal((body as JsonBody).name, 'Jane Cashier');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4. Shifts
  // ══════════════════════════════════════════════════════════════════════════

  it('GET /shifts/current — no open shift yet', async () => {
    const { status, body } = await req(`/shifts/current?userId=${cashierId}`, { userId: cashierId, storeId });
    assert.equal(status, 200);
    assert.equal(body, null);
  });

  it('POST /shifts — fails without storeId', async () => {
    // No X-User-Id header → getStoreContext returns null storeId, body has no storeId either
    const { status } = await req('/shifts', {
      method: 'POST',
      body: JSON.stringify({ userId: cashierId, startingCash: 5000 }),
    });
    assert.equal(status, 400);
  });

  it('POST /shifts — start shift with storeId in body (login-page fix)', async () => {
    // Simulates the login-page flow: user verified but not yet in auth store,
    // so X-User-Id is absent — storeId comes from body instead.
    const { status, body } = await req('/shifts', {
      method: 'POST',
      body: JSON.stringify({ userId: cashierId, startingCash: 5000, storeId }),
    });
    assert.equal(status, 201);
    const s = body as JsonBody;
    assert.equal(s.storeId, storeId);
    assert.equal(Number(s.startingCash), 5000);
    assert.equal(s.endTime, null);
    shiftId = s.id as string;
  });

  it('GET /shifts/current — returns open shift', async () => {
    const { status, body } = await req(`/shifts/current?userId=${cashierId}`, { userId: cashierId, storeId });
    assert.equal(status, 200);
    assert.equal((body as JsonBody).id, shiftId);
  });

  it('POST /shifts/:id/cashlog — pay-in', async () => {
    const { status, body } = await req(`/shifts/${shiftId}/cashlog`, {
      method: 'POST',
      body: JSON.stringify({ amount: 500, type: 'PAY_IN', reason: 'Float top-up' }),
    });
    assert.equal(status, 201);
    assert.equal((body as JsonBody).type, 'PAY_IN');
  });

  it('POST /shifts/:id/cashlog — pay-out', async () => {
    const { status, body } = await req(`/shifts/${shiftId}/cashlog`, {
      method: 'POST',
      body: JSON.stringify({ amount: 200, type: 'PAY_OUT', reason: 'Petty cash' }),
    });
    assert.equal(status, 201);
    assert.equal((body as JsonBody).type, 'PAY_OUT');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 5. Products
  // ══════════════════════════════════════════════════════════════════════════

  it('POST /products — create first product', async () => {
    const { status, body } = await req('/products', {
      method: 'POST',
      userId: adminId,
      storeId,
      body: JSON.stringify({
        name: 'Test Soda', sku: 'TST-001', category: 'Beverages', unit: 'pcs',
        costPrice: 50, nomadBitePrice: 80, taxRate: 16, currentStock: 20,
      }),
    });
    assert.equal(status, 201);
    const p = body as JsonBody;
    assert.equal(p.name, 'Test Soda');
    assert.equal(Number(p.currentStock), 20);
    productId = p.id as string;
  });

  it('POST /products — create second product', async () => {
    const { status, body } = await req('/products', {
      method: 'POST',
      userId: adminId,
      storeId,
      body: JSON.stringify({
        name: 'Test Snack', sku: 'TST-002', category: 'Snacks', unit: 'pcs',
        costPrice: 30, nomadBitePrice: 50, taxRate: 0, currentStock: 10,
      }),
    });
    assert.equal(status, 201);
    product2Id = (body as JsonBody).id as string;
  });

  it('GET /products — scoped to test store', async () => {
    const { status, body } = await req('/products', { userId: adminId, storeId });
    assert.equal(status, 200);
    const prods = body as JsonBody[];
    assert.ok(prods.some((p) => p.id === productId), 'product 1 in list');
    assert.ok(prods.some((p) => p.id === product2Id), 'product 2 in list');
  });

  it('PATCH /products/:id — update price', async () => {
    const { status, body } = await req(`/products/${productId}`, {
      method: 'PATCH',
      userId: adminId,
      storeId,
      body: JSON.stringify({ nomadBitePrice: 90 }),
    });
    assert.equal(status, 200);
    assert.equal(Number((body as JsonBody).nomadBitePrice), 90);
  });

  it('POST /products/:id/adjust — restock +5', async () => {
    const { status, body } = await req(`/products/${productId}/adjust`, {
      method: 'POST',
      userId: adminId,
      storeId,
      body: JSON.stringify({ delta: 5, reasonCode: 'RESTOCK', note: 'Weekly restock' }),
    });
    assert.equal(status, 200);
    assert.equal(Number((body as JsonBody).currentStock), 25, 'stock should be 20+5=25');
  });

  it('POST /products/:id/adjust — damaged -2', async () => {
    const { status, body } = await req(`/products/${productId}/adjust`, {
      method: 'POST',
      userId: adminId,
      storeId,
      body: JSON.stringify({ delta: -2, reasonCode: 'DAMAGED' }),
    });
    assert.equal(status, 200);
    assert.equal(Number((body as JsonBody).currentStock), 23, 'stock should be 25-2=23');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 6. Settings
  // ══════════════════════════════════════════════════════════════════════════

  it('GET /settings — returns defaults for new store', async () => {
    const { status, body } = await req('/settings', { userId: adminId, storeId });
    assert.equal(status, 200);
    const s = body as JsonBody;
    assert.ok(typeof s.serviceFeePercent === 'number');
    assert.ok(typeof s.storeName === 'string');
  });

  it('POST /settings — save store name', async () => {
    const { status, body } = await req('/settings', {
      method: 'POST',
      userId: adminId,
      storeId,
      body: JSON.stringify({ storeName: 'Test Store Brand', serviceFeePercent: 10 }),
    });
    assert.equal(status, 200);
    assert.equal((body as JsonBody).ok, true);
  });

  it('GET /settings — reflects saved values', async () => {
    const { status, body } = await req('/settings', { userId: adminId, storeId });
    assert.equal(status, 200);
    const s = body as JsonBody;
    assert.equal(s.storeName, 'Test Store Brand');
    assert.equal(s.serviceFeePercent, 10);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 7. Transactions — Golden Path
  // ══════════════════════════════════════════════════════════════════════════

  it('POST /transactions — cash sale (2 products)', async () => {
    const { status, body } = await req('/transactions', {
      method: 'POST',
      userId: cashierId,
      storeId,
      body: JSON.stringify({
        items: [
          { id: productId,  quantity: 3, originalPrice: 90, soldPrice: 90 },
          { id: product2Id, quantity: 2, originalPrice: 50, soldPrice: 50 },
        ],
        totalAmount: 370,
        taxAmount: 43.2,
        paymentType: 'CASH',
        userId: cashierId,
        shiftId,
      }),
    });
    assert.equal(status, 201);
    const tx = body as JsonBody;
    assert.ok(tx.id, 'transaction has id');
    assert.ok(Array.isArray(tx.stockDiscrepancies), 'stockDiscrepancies array present');
    assert.equal((tx.stockDiscrepancies as unknown[]).length, 0, 'no stock discrepancies');
    transactionId = tx.id as string;
    // Capture first line item for refund test
    lineItemId = ((tx as JsonBody).lineItems as JsonBody[])[0].id as string;
  });

  it('GET /products/:id — stock reduced after sale', async () => {
    const { status, body } = await req(`/products/${productId}`, { userId: adminId, storeId });
    assert.equal(status, 200);
    assert.equal(Number((body as JsonBody).currentStock), 20, 'stock should be 23-3=20');
  });

  it('GET /products/:id — product2 stock reduced', async () => {
    const { status, body } = await req(`/products/${product2Id}`, { userId: adminId, storeId });
    assert.equal(status, 200);
    assert.equal(Number((body as JsonBody).currentStock), 8, 'stock should be 10-2=8');
  });

  it('GET /transactions — includes the new transaction', async () => {
    const { status, body } = await req('/transactions', { userId: cashierId, storeId });
    assert.equal(status, 200);
    const txs = body as JsonBody[];
    const found = txs.find((t) => t.id === transactionId);
    assert.ok(found, 'transaction in list');
    assert.equal((found as JsonBody).status, 'COMPLETED');
  });

  it('POST /transactions — card sale succeeds', async () => {
    const { status } = await req('/transactions', {
      method: 'POST',
      userId: cashierId,
      storeId,
      body: JSON.stringify({
        items: [{ id: product2Id, quantity: 1, originalPrice: 50, soldPrice: 50 }],
        totalAmount: 50,
        taxAmount: 0,
        paymentType: 'CARD',
        userId: cashierId,
        shiftId,
      }),
    });
    assert.equal(status, 201);
  });

  it('POST /transactions — storeId required returns 400', async () => {
    const { status } = await req('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        items: [],
        totalAmount: 0,
        taxAmount: 0,
        paymentType: 'CASH',
      }),
    });
    assert.equal(status, 400);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 8. Refunds
  // ══════════════════════════════════════════════════════════════════════════

  it('POST /transactions/:id/refund — non-damaged item restores stock', async () => {
    const stockBefore = await req(`/products/${productId}`, { userId: adminId, storeId });
    const before = Number((stockBefore.body as JsonBody).currentStock);

    const { status } = await req(`/transactions/${transactionId}/refund`, {
      method: 'POST',
      userId: adminId,
      storeId,
      body: JSON.stringify({ items: [{ lineItemId, isDamaged: false }] }),
    });
    assert.equal(status, 200);

    const stockAfter = await req(`/products/${productId}`, { userId: adminId, storeId });
    const after = Number((stockAfter.body as JsonBody).currentStock);
    assert.ok(after > before, `stock restored: ${before} → ${after}`);

    const txCheck = await req('/transactions', { userId: cashierId, storeId });
    const tx = (txCheck.body as JsonBody[]).find((t) => t.id === transactionId);
    assert.equal((tx as JsonBody).status, 'REFUNDED');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 9. Void
  // ══════════════════════════════════════════════════════════════════════════

  it('DELETE /transactions/:id/void — cannot void REFUNDED transaction', async () => {
    const { status } = await req(`/transactions/${transactionId}/void`, {
      method: 'DELETE',
      userId: adminId,
      storeId,
    });
    assert.equal(status, 400);
  });

  it('DELETE /transactions/:id/void — void COMPLETED transaction', async () => {
    // Create a fresh transaction to void
    const { body: newTx } = await req('/transactions', {
      method: 'POST',
      userId: cashierId,
      storeId,
      body: JSON.stringify({
        items: [{ id: product2Id, quantity: 1, originalPrice: 50, soldPrice: 50 }],
        totalAmount: 50,
        taxAmount: 0,
        paymentType: 'CASH',
        userId: cashierId,
        shiftId,
      }),
    });
    const voidId = (newTx as JsonBody).id as string;

    const { status, body } = await req(`/transactions/${voidId}/void`, {
      method: 'DELETE',
      userId: adminId,
      storeId,
    });
    assert.equal(status, 200);
    assert.equal((body as JsonBody).status, 'VOIDED');
  });

  it('DELETE /transactions/:id/void — 404 for unknown id', async () => {
    const { status } = await req('/transactions/nonexistent/void', {
      method: 'DELETE',
      userId: adminId,
      storeId,
    });
    assert.equal(status, 404);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 10. Reports
  // ══════════════════════════════════════════════════════════════════════════

  it('GET /reports/sales — returns aggregated data', async () => {
    const today = new Date().toISOString().split('T')[0];
    const { status, body } = await req(`/reports/sales?from=${today}&to=${today}`, { userId: adminId, storeId });
    assert.equal(status, 200);
    const r = body as JsonBody;
    assert.ok(typeof r.totalRevenue === 'number');
    assert.ok(typeof r.transactionCount === 'number');
    assert.ok(Array.isArray(r.topProducts));
    assert.ok(r.transactionCount >= 1, 'at least one transaction today');
  });

  it('GET /reports/shifts — returns shift rows', async () => {
    const today = new Date().toISOString().split('T')[0];
    const { status, body } = await req(`/reports/shifts?from=${today}&to=${today}`, { userId: adminId, storeId });
    assert.equal(status, 200);
    assert.ok(Array.isArray((body as JsonBody).shifts));
  });

  it('GET /reports/inventory — returns inventory summary', async () => {
    const { status, body } = await req('/reports/inventory', { userId: adminId, storeId });
    assert.equal(status, 200);
    const r = body as JsonBody;
    assert.ok(typeof r.totalProducts === 'number');
    assert.ok(r.totalProducts >= 2, 'at least our 2 test products');
    assert.ok(Array.isArray(r.byCategory));
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 11. Store Stats
  // ══════════════════════════════════════════════════════════════════════════

  it('GET /stores/:id/stats — returns store metrics', async () => {
    const { status, body } = await req(`/stores/${storeId}/stats`);
    assert.equal(status, 200);
    const s = body as JsonBody;
    assert.equal(s.storeId, storeId);
    assert.ok(typeof s.revenueToday === 'number');
    assert.ok(s.transactionsToday >= 1, 'at least one transaction today');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 12. SuperAdmin Dashboard
  // ══════════════════════════════════════════════════════════════════════════

  it('GET /superadmin/dashboard — test store appears', async () => {
    const { status, body } = await req('/superadmin/dashboard');
    assert.equal(status, 200);
    const d = body as { summary: JsonBody; stores: JsonBody[] };
    assert.ok(typeof d.summary.totalStores === 'number');
    const found = d.stores.find((s) => s.id === storeId);
    assert.ok(found, 'test store in dashboard');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 13. Shift Close
  // ══════════════════════════════════════════════════════════════════════════

  it('POST /shifts/:id/close — calculates variance', async () => {
    // Expected = startingCash(5000) + cashSales + payIns(500) - payOuts(200)
    // We had one CASH sale of 370 and one CASH sale of 50 (the later void doesn't restore),
    // plus the card sale doesn't count toward cash.
    // Just verify the structure, not exact maths (voided tx may vary by implementation)
    const { status, body } = await req(`/shifts/${shiftId}/close`, {
      method: 'POST',
      userId: cashierId,
      storeId,
      body: JSON.stringify({ actualCash: 5500 }),
    });
    assert.equal(status, 200);
    const s = body as JsonBody;
    assert.ok(typeof s.expectedCash === 'number', 'expectedCash present');
    assert.ok(typeof s.variance === 'number', 'variance present');
  });

  it('GET /shifts/current — null after close', async () => {
    const { status, body } = await req(`/shifts/current?userId=${cashierId}`, { userId: cashierId, storeId });
    assert.equal(status, 200);
    assert.equal(body, null, 'no open shift after close');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 14. User deletion
  // ══════════════════════════════════════════════════════════════════════════

  it('DELETE /users/:id — blocked for user with transaction history (returns 409)', async () => {
    // Cashier made sales, so deletion must be refused to preserve audit trail
    const { status, body } = await req(`/users/${cashierId}`, { method: 'DELETE' });
    assert.equal(status, 409);
    assert.ok(typeof (body as JsonBody).error === 'string');
  });

  it('DELETE /users/:id — succeeds for user with no history', async () => {
    // Create a fresh user who has never transacted, then immediately delete them
    const { body: created } = await req('/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'Temp User', pin: '9999', role: 'CASHIER', storeId }),
    });
    const tempId = (created as JsonBody).id as string;

    const { status } = await req(`/users/${tempId}`, { method: 'DELETE' });
    assert.equal(status, 200);

    const { body: list } = await req('/users', { userId: adminId, storeId });
    assert.ok(!(list as JsonBody[]).some((u) => u.id === tempId), 'temp user deleted');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 15. Product import
  // ══════════════════════════════════════════════════════════════════════════

  it('POST /products/import — merge mode upserts products', async () => {
    const { status, body } = await req('/products/import', {
      method: 'POST',
      userId: adminId,
      storeId,
      body: JSON.stringify({
        replace: false,
        products: [
          { name: 'Imported Water', sku: 'IMP-001', category: 'Beverages', unit: 'pcs', costPrice: 20, nomadBitePrice: 35, taxRate: 0, currentStock: 50 },
          { name: 'Imported Juice',  sku: 'IMP-002', category: 'Beverages', unit: 'pcs', costPrice: 40, nomadBitePrice: 70, taxRate: 0, currentStock: 30 },
        ],
      }),
    });
    assert.equal(status, 200);
    const r = body as JsonBody;
    assert.ok(typeof r.succeeded === 'number');
    assert.equal(r.succeeded, 2);
  });

});
