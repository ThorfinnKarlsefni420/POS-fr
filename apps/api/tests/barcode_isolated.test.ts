import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Isolated integration coverage for the barcode feature (Phases 0-2):
//  - Phase 0: DB uniqueness on Item.barcode (per store)
//  - Phase 1: GET /products/by-barcode/:barcode (item match, tier match, 404)
//  - Phase 2: check-digit validation → InventoryAnomaly, duplicate-barcode → 409
//
// Pure checksum math (no server/DB) is covered separately in tests/barcode.test.ts.
// This file only tests behavior that requires the live route + database:
// uniqueness enforcement, anomaly persistence, and the lookup endpoint's tier
// tie-break — none of which existed before this feature and none of which any
// other test file exercises (verified via grep across tests/*.ts).

const BASE = 'http://localhost:3001/api';
const SLUG = `iso-barcode-${Date.now()}`;

let storeId: string;
let adminId: string;

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

// Known-valid GS1 check digits (verified independently in tests/barcode.test.ts).
const VALID_EAN13 = '4006381333931';
const INVALID_EAN13 = '4006381333930'; // same body, wrong check digit

// Distinct GS1-shaped codes for the import-path tests below, so they don't collide
// with the barcodes already assigned to other items earlier in this same store.
const IMPORT_VALID_UPC_A = '036000291452';
const IMPORT_INVALID_UPC_A = '036000291450'; // same body, wrong check digit

describe('Barcode Isolated Tests', { concurrency: false }, () => {
  before(async () => {
    const { body: s } = await req('/stores', {
      method: 'POST',
      body: JSON.stringify({ name: 'Iso Barcode Store', slug: SLUG }),
    });
    storeId = s.id;

    const { body: u } = await req('/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'Iso Barcode Admin', pin: '1234', role: 'ADMIN', storeId }),
    });
    adminId = u.id;
  });

  after(async () => {
    if (storeId) await req(`/stores/${storeId}`, { method: 'DELETE' });
  });

  // ── Phase 1: GET /products/by-barcode/:barcode ──────────────────────────────

  it('GET /products/by-barcode/:barcode resolves an item-level barcode', async () => {
    const { body: item } = await req('/products', {
      method: 'POST', storeId, userId: adminId,
      body: JSON.stringify({ name: 'Item Barcode Product', sku: 'BC-ITEM-001', costPrice: 10, nomadBitePrice: 20 }),
    });
    await req(`/products/${item.id}`, {
      method: 'PATCH', userId: adminId,
      body: JSON.stringify({ barcode: '9998887771' }),
    });

    const { status, body } = await req('/products/by-barcode/9998887771', { userId: adminId });
    assert.equal(status, 200);
    assert.equal(body.item.id, item.id);
    assert.equal(body.matchedTierId, null);
  });

  it('GET /products/by-barcode/:barcode resolves a tier-level barcode, lowest level wins on collision', async () => {
    const { body: item } = await req('/products', {
      method: 'POST', storeId, userId: adminId,
      body: JSON.stringify({ name: 'Tier Barcode Product', sku: 'BC-TIER-001', costPrice: 10, nomadBitePrice: 20 }),
    });
    const { body: pcsTier } = await req(`/products/${item.id}/packaging`, {
      method: 'POST', userId: adminId,
      body: JSON.stringify({ name: 'PCS', level: 0, quantityInBase: 1, isBaseUnit: true, barcode: 'SHARED-CODE-1' }),
    });
    await req(`/products/${item.id}/packaging`, {
      method: 'POST', userId: adminId,
      body: JSON.stringify({ name: 'CTN', level: 1, quantityInBase: 30, barcode: 'SHARED-CODE-1' }),
    });

    const { status, body } = await req('/products/by-barcode/SHARED-CODE-1', { userId: adminId });
    assert.equal(status, 200);
    assert.equal(body.item.id, item.id);
    assert.equal(body.matchedTierId, pcsTier.id, 'lowest-level (PCS) tier should win when siblings share a barcode');
  });

  it('GET /products/by-barcode/:barcode is case-insensitive as a fallback', async () => {
    const { body: item } = await req('/products', {
      method: 'POST', storeId, userId: adminId,
      body: JSON.stringify({ name: 'Case Insensitive Product', sku: 'BC-CASE-001', costPrice: 10, nomadBitePrice: 20 }),
    });
    await req(`/products/${item.id}`, {
      method: 'PATCH', userId: adminId,
      body: JSON.stringify({ barcode: 'MixedCase123' }),
    });

    const { status, body } = await req('/products/by-barcode/mixedcase123', { userId: adminId });
    assert.equal(status, 200);
    assert.equal(body.item.id, item.id);
  });

  it('GET /products/by-barcode/:barcode returns 404 for an unknown code', async () => {
    const { status, body } = await req('/products/by-barcode/no-such-barcode-xyz', { userId: adminId });
    assert.equal(status, 404);
    assert.equal(body.error, 'Not found');
  });

  it('GET /products/by-barcode/:barcode requires a store context', async () => {
    const { status } = await req('/products/by-barcode/9998887771');
    assert.equal(status, 400);
  });

  // ── Phase 0: DB uniqueness on Item.barcode per store ────────────────────────

  it('PATCH /products/:id rejects a barcode already used by another item in the store (409)', async () => {
    const { body: itemA } = await req('/products', {
      method: 'POST', storeId, userId: adminId,
      body: JSON.stringify({ name: 'Dup A', sku: 'BC-DUP-A', costPrice: 10, nomadBitePrice: 20 }),
    });
    const { body: itemB } = await req('/products', {
      method: 'POST', storeId, userId: adminId,
      body: JSON.stringify({ name: 'Dup B', sku: 'BC-DUP-B', costPrice: 10, nomadBitePrice: 20 }),
    });
    const first = await req(`/products/${itemA.id}`, {
      method: 'PATCH', userId: adminId,
      body: JSON.stringify({ barcode: 'DUP-CODE-1' }),
    });
    assert.equal(first.status, 200);

    const second = await req(`/products/${itemB.id}`, {
      method: 'PATCH', userId: adminId,
      body: JSON.stringify({ barcode: 'DUP-CODE-1' }),
    });
    assert.equal(second.status, 409);
    assert.match(second.body.error, /already in use/);
  });

  // ── Phase 2: check-digit validation → InventoryAnomaly ──────────────────────

  it('PATCH /products/:id with a GTIN-length barcode that fails checksum flags an anomaly, but still saves', async () => {
    const { body: item } = await req('/products', {
      method: 'POST', storeId, userId: adminId,
      body: JSON.stringify({ name: 'Bad Checksum Product', sku: 'BC-BAD-001', costPrice: 10, nomadBitePrice: 20 }),
    });

    const patch = await req(`/products/${item.id}`, {
      method: 'PATCH', userId: adminId,
      body: JSON.stringify({ barcode: INVALID_EAN13 }),
    });
    assert.equal(patch.status, 200, 'write is not blocked — anomaly flagging is advisory only');
    assert.equal(patch.body.barcode, INVALID_EAN13);

    const { body: anomalies } = await req('/products/anomalies?resolved=false', { userId: adminId, storeId });
    const flagged = anomalies.find((a: any) => a.sourceId === item.id);
    assert.ok(flagged, 'an InventoryAnomaly row should exist for this item');
    assert.equal(flagged.reason, 'invalid-barcode-checksum');
    assert.match(flagged.notes, /EAN-13/);
  });

  it('PATCH /products/:id with a valid-checksum GTIN barcode does not flag an anomaly', async () => {
    const { body: item } = await req('/products', {
      method: 'POST', storeId, userId: adminId,
      body: JSON.stringify({ name: 'Good Checksum Product', sku: 'BC-GOOD-001', costPrice: 10, nomadBitePrice: 20 }),
    });

    const patch = await req(`/products/${item.id}`, {
      method: 'PATCH', userId: adminId,
      body: JSON.stringify({ barcode: VALID_EAN13 }),
    });
    assert.equal(patch.status, 200);

    const { body: anomalies } = await req('/products/anomalies?resolved=false', { userId: adminId, storeId });
    const flagged = anomalies.find((a: any) => a.sourceId === item.id);
    assert.equal(flagged, undefined, 'a valid checksum must not create an anomaly');
  });

  it('PATCH /products/:id with a non-GTIN-length barcode (internal code) does not flag an anomaly', async () => {
    const { body: item } = await req('/products', {
      method: 'POST', storeId, userId: adminId,
      body: JSON.stringify({ name: 'Internal Code Product', sku: 'BC-INTERNAL-001', costPrice: 10, nomadBitePrice: 20 }),
    });

    const patch = await req(`/products/${item.id}`, {
      method: 'PATCH', userId: adminId,
      body: JSON.stringify({ barcode: '1556804' }), // 7-digit — matches real production data shape
    });
    assert.equal(patch.status, 200);

    const { body: anomalies } = await req('/products/anomalies?resolved=false', { userId: adminId, storeId });
    const flagged = anomalies.find((a: any) => a.sourceId === item.id);
    assert.equal(flagged, undefined, 'non-GTIN-length codes are not GS1 barcodes and must not be flagged');
  });

  it('POST /:id/packaging with a bad-checksum tier barcode flags an anomaly on the parent item', async () => {
    const { body: item } = await req('/products', {
      method: 'POST', storeId, userId: adminId,
      body: JSON.stringify({ name: 'Tier Anomaly Product', sku: 'BC-TIER-ANOM-001', costPrice: 10, nomadBitePrice: 20 }),
    });

    const create = await req(`/products/${item.id}/packaging`, {
      method: 'POST', userId: adminId,
      body: JSON.stringify({ name: 'CTN', level: 1, quantityInBase: 30, barcode: INVALID_EAN13 }),
    });
    assert.equal(create.status, 201);

    const { body: anomalies } = await req('/products/anomalies?resolved=false', { userId: adminId, storeId });
    const flagged = anomalies.find((a: any) => a.sourceId === item.id);
    assert.ok(flagged, 'an InventoryAnomaly row should exist, sourced to the parent item');
    assert.equal(flagged.reason, 'invalid-barcode-checksum');
  });

  // ── Import path (/products/import) ──────────────────────────────────────────

  it('POST /products/import persists the item-level barcode', async () => {
    const { body } = await req('/products/import', {
      method: 'POST', storeId, userId: adminId,
      body: JSON.stringify({
        products: [
          { name: 'Import Barcode Product', sku: 'BC-IMPORT-001', costPrice: 10, nomadBitePrice: 20, barcode: IMPORT_VALID_UPC_A },
        ],
      }),
    });
    assert.equal(body.succeeded, 1);

    const { body: item } = await req('/products/by-barcode/' + IMPORT_VALID_UPC_A, { userId: adminId, storeId });
    assert.equal(item.item.sku, 'BC-IMPORT-001');
  });

  it('POST /products/import flags an anomaly for a bad-checksum item barcode but still imports it', async () => {
    const { body } = await req('/products/import', {
      method: 'POST', storeId, userId: adminId,
      body: JSON.stringify({
        products: [
          { name: 'Import Bad Checksum', sku: 'BC-IMPORT-BAD-001', costPrice: 10, nomadBitePrice: 20, barcode: IMPORT_INVALID_UPC_A },
        ],
      }),
    });
    assert.equal(body.succeeded, 1, 'import is not blocked — anomaly flagging is advisory only');

    const { body: anomalies } = await req('/products/anomalies?resolved=false', { userId: adminId, storeId });
    const flagged = anomalies.find((a: any) => a.reason === 'invalid-barcode-checksum' && a.name === 'Import Bad Checksum');
    assert.ok(flagged, 'an InventoryAnomaly row should exist for the imported item');
  });

  it('POST /products/import flags an anomaly for a bad-checksum tier barcode', async () => {
    const { body } = await req('/products/import', {
      method: 'POST', storeId, userId: adminId,
      body: JSON.stringify({
        products: [
          {
            name: 'Import Tier Bad Checksum', sku: 'BC-IMPORT-TIER-001', costPrice: 10, nomadBitePrice: 20,
            packagingTiers: [{ name: 'CTN', level: 1, quantityInBase: 30, isBaseUnit: false, barcode: IMPORT_INVALID_UPC_A }],
          },
        ],
      }),
    });
    assert.equal(body.succeeded, 1);

    const { body: anomalies } = await req('/products/anomalies?resolved=false', { userId: adminId, storeId });
    const flagged = anomalies.find((a: any) => a.reason === 'invalid-barcode-checksum' && a.name === 'Import Tier Bad Checksum');
    assert.ok(flagged, 'an InventoryAnomaly row should exist, sourced to the parent item');
  });

  it('POST /products/import reports a duplicate barcode as a per-item failure without aborting the batch', async () => {
    const { body } = await req('/products/import', {
      method: 'POST', storeId, userId: adminId,
      body: JSON.stringify({
        products: [
          { name: 'Import Dup A', sku: 'BC-IMPORT-DUP-A', costPrice: 10, nomadBitePrice: 20, barcode: 'IMPORT-DUP-CODE-1' },
          { name: 'Import Dup B', sku: 'BC-IMPORT-DUP-B', costPrice: 10, nomadBitePrice: 20, barcode: 'IMPORT-DUP-CODE-1' },
          { name: 'Import Dup C', sku: 'BC-IMPORT-DUP-C', costPrice: 10, nomadBitePrice: 20 },
        ],
      }),
    });
    assert.equal(body.succeeded, 2, 'the non-conflicting rows still import');
    assert.equal(body.failed, 1);
    assert.match(body.firstErrors[0], /already used by another item in this store/);
  });
});
