/**
 * Tests for file-parser.ts — Option A (Vendor Catalogue) and Option B (Generic)
 * Run with:  npx tsx src/lib/__tests__/file-parser.test.ts
 */

// ── Polyfill FileReader for Node.js ─────────────────────────────────────────
import { Buffer } from 'node:buffer';

(globalThis as any).FileReader = class {
  result: ArrayBuffer | string | null = null;
  onload: ((e: any) => void) | null = null;
  onerror: (() => void) | null = null;

  readAsArrayBuffer(file: any) {
    Promise.resolve().then(() => {
      this.result = file._buffer as ArrayBuffer;
      this.onload?.({ target: { result: this.result } });
    });
  }

  readAsText(file: any) {
    Promise.resolve().then(() => {
      this.result = Buffer.from(file._buffer).toString('utf-8');
      this.onload?.({ target: { result: this.result } });
    });
  }
};

// Minimal File polyfill that carries a buffer
class TestFile {
  name: string;
  _buffer: ArrayBuffer;
  constructor(parts: string[], name: string) {
    const content = parts.join('');
    const buf = Buffer.from(content, 'utf-8');
    this._buffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    this.name = name;
  }
}
(globalThis as any).File = TestFile;

// ── Now import the parser (after polyfills are in place) ─────────────────────
import { parseSpreadsheet } from '../file-parser.js';

// ── Assertion helper ─────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}${detail ? `\n       ${detail}` : ''}`);
    failed++;
  }
}

function assertEq<T>(label: string, actual: T, expected: T) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(label, ok, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function csvFile(content: string, name = 'test.csv') {
  return new TestFile([content], name) as unknown as File;
}

const SERVICE_FEE = 15; // 15 % service fee used across tests

// ════════════════════════════════════════════════════════════════════════════
// OPTION A — Vendor Catalogue format
// ════════════════════════════════════════════════════════════════════════════
async function testOptionA() {
  console.log('\n── Option A: Vendor Catalogue ──────────────────────────────────');

  // ── A1: Basic row with L1 + L2 columns ──────────────────────────────────
  {
    const csv = [
      'DB Name,Correct Product Name,Category,Base Unit,Base Cost,Base Sell,Base Stock,VAT %,Barcode,L1 Pack Name,L1 Qty in Base,L1 Cost,L1 Sell,L2 Pack Name,L2 Qty in L1,L2 Cost,L2 Sell',
      'BROOKSIDE 6*500ML,Brookside Milk 500ml,Dairy - Milk,Piece,55,65,240,16,5900012,Six-Pack,6,330,390,Carton,4,1320,1560',
    ].join('\n');

    const { products, errors, skipped } = await parseSpreadsheet(csvFile(csv), SERVICE_FEE);

    console.log('\nA1 — explicit L1 + L2 columns');
    assert('no errors', errors.length === 0, errors.join(', '));
    assert('1 product parsed', products.length === 1);
    assertEq('name', products[0].name, 'Brookside Milk 500ml');
    assertEq('category', products[0].category, 'Dairy - Milk');
    assertEq('unit', products[0].unit, 'Piece');
    assertEq('costPrice', products[0].costPrice, 55);
    assertEq('sellingPrice', products[0].sellingPrice, 65);
    assertEq('taxRate', products[0].taxRate, 16);
    assertEq('currentStock', products[0].currentStock, 240);

    const tiers = products[0].packagingTiers ?? [];
    assert('3 packaging tiers', tiers.length === 3, `got ${tiers.length}`);

    const base = tiers.find(t => t.level === 0);
    assert('base tier exists', !!base);
    assertEq('base.quantityInBase', base?.quantityInBase, 1);
    assertEq('base.isBaseUnit', base?.isBaseUnit, true);
    assertEq('base.name', base?.name, 'Piece');

    const l1 = tiers.find(t => t.level === 1);
    assert('L1 tier exists', !!l1);
    assertEq('L1.name', l1?.name, 'Six-Pack');
    assertEq('L1.quantityInBase', l1?.quantityInBase, 6);
    assertEq('L1.costPrice', l1?.costPrice, 330);

    const l2 = tiers.find(t => t.level === 2);
    assert('L2 tier exists', !!l2);
    assertEq('L2.name', l2?.name, 'Carton');
    assertEq('L2.quantityInBase', l2?.quantityInBase, 24); // 4 six-packs × 6
    assertEq('L2.costPrice', l2?.costPrice, 1320);
  }

  // ── A2: No L1/L2 columns — infer from DB Name pattern ───────────────────
  {
    const csv = [
      'DB Name,Category,Base Unit,Base Cost,Base Sell,VAT %',
      'AJAB 24*1KG,Staples - Flour & Ugali,Piece,65,75,0',
    ].join('\n');

    const { products } = await parseSpreadsheet(csvFile(csv), SERVICE_FEE);

    console.log('\nA2 — infer packaging from DB Name pattern (24*1KG)');
    assert('1 product', products.length === 1);
    const tiers = products[0].packagingTiers ?? [];
    assert('tiers inferred from DB Name', tiers.length >= 2, `got ${tiers.length} tiers`);
    const l2 = tiers.find(t => t.level === 2);
    if (l2) {
      assertEq('inferred carton qty', l2.quantityInBase, 24);
    } else {
      const l1 = tiers.find(t => t.level === 1);
      assert('at least L1 inferred', !!l1);
      assertEq('inferred L1 qty', l1?.quantityInBase, 24);
    }
  }

  // ── A3: Category-based inference (Cooking Oil) ───────────────────────────
  {
    const csv = [
      'DB Name,Category,Base Unit,Base Cost,VAT %',
      'FRESH FRY 1LTR,Cooking Oil,Piece,220,16',
    ].join('\n');

    const { products } = await parseSpreadsheet(csvFile(csv), SERVICE_FEE);

    console.log('\nA3 — infer packaging from category (Cooking Oil → Carton of 12)');
    assert('1 product', products.length === 1);
    const tiers = products[0].packagingTiers ?? [];
    assert('tiers generated', tiers.length >= 2, `got ${tiers.length}`);
    const outer = tiers.find(t => t.level === 1 || t.level === 2);
    assert('carton tier present', !!outer);
    assertEq('carton qty = 12', outer?.quantityInBase, 12);
  }

  // ── A4: Base unit normalisation (carton → piece) ─────────────────────────
  {
    const csv = [
      'DB Name,Category,Base Unit,Base Cost,VAT %',
      'ARIEL DETERGENT 500G,Household - Detergents,Carton,85,16',
    ].join('\n');

    const { products } = await parseSpreadsheet(csvFile(csv), SERVICE_FEE);

    console.log('\nA4 — base unit "Carton" normalised to "Piece"');
    assert('1 product', products.length === 1);
    assertEq('unit normalised to Piece', products[0].unit, 'Piece');
  }

  // ── A5: Selling price auto-calc when Base Sell is empty ──────────────────
  {
    const csv = [
      'DB Name,Category,Base Unit,Base Cost,Base Sell,VAT %',
      'TEST ITEM,Other,Piece,100,,0',
    ].join('\n');

    const { products } = await parseSpreadsheet(csvFile(csv), SERVICE_FEE);

    console.log('\nA5 — selling price auto-calculated from cost + service fee %');
    assert('1 product', products.length === 1);
    // 100 * 1.15 = 115
    assertEq('sellingPrice = cost × (1 + 15%)', products[0].sellingPrice, 115);
  }

  // ── A6: Skip rows with empty DB Name ─────────────────────────────────────
  {
    const csv = [
      'DB Name,Category,Base Cost',
      ',Empty row,100',
      'REAL ITEM,Food,50',
    ].join('\n');

    const { products, skipped } = await parseSpreadsheet(csvFile(csv), SERVICE_FEE);

    console.log('\nA6 — rows with empty DB Name are skipped');
    assert('1 product (skipped empty row)', products.length === 1);
    assert('skipped count = 1', skipped === 1, `got ${skipped}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// OPTION B — Generic format
// ════════════════════════════════════════════════════════════════════════════
async function testOptionB() {
  console.log('\n── Option B: Generic Format ────────────────────────────────────');

  // ── B1: Basic generic CSV ────────────────────────────────────────────────
  {
    const csv = [
      'Name,Category,Sub-Category,Buying Price,Selling Price,SKU,Unit,VAT %,Stock',
      'Tomato Sauce 500g,Condiments,Sauces,80,95,TOMS-500,Bottle,0,50',
    ].join('\n');

    const { products, errors } = await parseSpreadsheet(csvFile(csv), SERVICE_FEE);

    console.log('\nB1 — standard generic columns');
    assert('no errors', errors.length === 0, errors.join(', '));
    assert('1 product', products.length === 1);
    assertEq('name', products[0].name, 'Tomato Sauce 500g');
    assertEq('category', products[0].category, 'Condiments');
    assertEq('subCategory', products[0].subCategory, 'Sauces');
    assertEq('costPrice', products[0].costPrice, 80);
    assertEq('sellingPrice', products[0].sellingPrice, 95);
    assertEq('sku', products[0].sku, 'TOMS-500');
    assertEq('unit', products[0].unit, 'Bottle');
    assertEq('taxRate', products[0].taxRate, 0);
    assertEq('currentStock', products[0].currentStock, 50);
    assert('no packaging tiers (none in sheet)', (products[0].packagingTiers ?? []).length === 0);
  }

  // ── B2: With explicit L1 + L2 packaging columns ──────────────────────────
  {
    const csv = [
      'Name,Category,Unit,Buying Price,Selling Price,L1 Pack Name,L1 Qty in Base,L1 Cost,L1 Sell,L2 Pack Name,L2 Qty in L1,L2 Cost,L2 Sell',
      'Sugar 1kg,Staples,Piece,120,140,Dozen,12,1440,1680,Sack,10,14400,16800',
    ].join('\n');

    const { products } = await parseSpreadsheet(csvFile(csv), SERVICE_FEE);

    console.log('\nB2 — generic format with L1 + L2 columns');
    assert('1 product', products.length === 1);
    const tiers = products[0].packagingTiers ?? [];
    assert('3 tiers', tiers.length === 3, `got ${tiers.length}`);

    const l1 = tiers.find(t => t.level === 1);
    assertEq('L1.name', l1?.name, 'Dozen');
    assertEq('L1.qty', l1?.quantityInBase, 12);
    assertEq('L1.cost', l1?.costPrice, 1440);

    const l2 = tiers.find(t => t.level === 2);
    assertEq('L2.name', l2?.name, 'Sack');
    assertEq('L2.qty (12×10)', l2?.quantityInBase, 120);
    assertEq('L2.cost', l2?.costPrice, 14400);
  }

  // ── B3: Name column alias "Item" ─────────────────────────────────────────
  {
    const csv = [
      'Item,Category,Amount',
      'Milk Packet,Dairy,55',
    ].join('\n');

    const { products } = await parseSpreadsheet(csvFile(csv), SERVICE_FEE);

    console.log('\nB3 — "Item" column alias used as product name');
    assert('1 product', products.length === 1);
    assertEq('name from Item column', products[0].name, 'Milk Packet');
  }

  // ── B4: Selling price auto-calc ──────────────────────────────────────────
  {
    const csv = [
      'Name,Buying Price',
      'Bread,60',
    ].join('\n');

    const { products } = await parseSpreadsheet(csvFile(csv), SERVICE_FEE);

    console.log('\nB4 — selling price auto-calc when not provided');
    assert('1 product', products.length === 1);
    assertEq('sellingPrice = 60 × 1.15 = 69', products[0].sellingPrice, 69);
  }

  // ── B5: SKU auto-generated from name when not provided ──────────────────
  {
    const csv = [
      'Name,Buying Price',
      'Drinking Water 500ml,20',
    ].join('\n');

    const { products } = await parseSpreadsheet(csvFile(csv), SERVICE_FEE);

    console.log('\nB5 — SKU auto-generated from name');
    assert('1 product', products.length === 1);
    assert('sku contains name slug', products[0].sku.includes('drinking-water'));
  }

  // ── B6: Multiple products, duplicate SKU deduplication ──────────────────
  {
    const csv = [
      'Name,SKU,Buying Price',
      'Orange Juice,OJ-1L,110',
      'Orange Juice Large,OJ-1L,180',
    ].join('\n');

    const { products } = await parseSpreadsheet(csvFile(csv), SERVICE_FEE);

    console.log('\nB6 — duplicate SKU gets disambiguated');
    assert('2 products', products.length === 2);
    assert('SKUs are different', products[0].sku !== products[1].sku,
      `both got ${products[0].sku}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Run
// ════════════════════════════════════════════════════════════════════════════
(async () => {
  await testOptionA();
  await testOptionB();

  console.log('\n' + '─'.repeat(55));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
