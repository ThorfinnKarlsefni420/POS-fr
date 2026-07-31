import test from 'node:test';
import assert from 'node:assert';
import { validateBarcode, computeGtinCheckDigit } from '../src/lib/barcode.ts';

// ── GS1 checksum: known real-world examples ───────────────────────────────────
// Verified against the standard GS1 mod-10 algorithm (weight 3/1 alternating,
// right to left, starting at 3).

test('validateBarcode — EAN-13 known-good example', async (t) => {
  await t.test('4006381333931 is a valid EAN-13', () => {
    const result = validateBarcode('4006381333931');
    assert.strictEqual(result.symbology, 'EAN-13');
    assert.strictEqual(result.valid, true);
  });

  await t.test('same digits with wrong check digit fails', () => {
    const result = validateBarcode('4006381333930');
    assert.strictEqual(result.symbology, 'EAN-13');
    assert.strictEqual(result.valid, false);
  });
});

test('validateBarcode — UPC-A known-good example', async (t) => {
  await t.test('036000291452 is a valid UPC-A', () => {
    const result = validateBarcode('036000291452');
    assert.strictEqual(result.symbology, 'UPC-A');
    assert.strictEqual(result.valid, true);
  });

  await t.test('same digits with wrong check digit fails', () => {
    const result = validateBarcode('036000291450');
    assert.strictEqual(result.symbology, 'UPC-A');
    assert.strictEqual(result.valid, false);
  });
});

// ── Round-trip: computeGtinCheckDigit against validateBarcode, for lengths ────
// without a memorized real-world example (EAN-8, ITF-14).

test('validateBarcode — EAN-8 round-trip via computeGtinCheckDigit', async (t) => {
  const body = '9638507';
  const check = computeGtinCheckDigit(body);

  await t.test('correct check digit validates', () => {
    const result = validateBarcode(body + check);
    assert.strictEqual(result.symbology, 'EAN-8');
    assert.strictEqual(result.valid, true);
  });

  await t.test('incorrect check digit fails', () => {
    const wrongCheck = (check + 1) % 10;
    const result = validateBarcode(body + wrongCheck);
    assert.strictEqual(result.symbology, 'EAN-8');
    assert.strictEqual(result.valid, false);
  });
});

test('validateBarcode — ITF-14 (GTIN-14) round-trip via computeGtinCheckDigit', async (t) => {
  const body = '1040006381333';
  const check = computeGtinCheckDigit(body);

  await t.test('correct check digit validates', () => {
    const result = validateBarcode(body + check);
    assert.strictEqual(result.symbology, 'ITF-14');
    assert.strictEqual(result.valid, true);
  });

  await t.test('incorrect check digit fails', () => {
    const wrongCheck = (check + 1) % 10;
    const result = validateBarcode(body + wrongCheck);
    assert.strictEqual(result.symbology, 'ITF-14');
    assert.strictEqual(result.valid, false);
  });
});

// ── Non-GTIN inputs: advisory-only contract — never flagged as invalid ────────
// This is the common case in this codebase: production data is entirely 7-digit
// internal supplier codes (see BARCODE_IMPLEMENTATION_PLAN.md), which must not
// be treated as broken barcodes.

test('validateBarcode — non-GTIN-length values are not errors', async (t) => {
  await t.test('7-digit internal code (real production data shape)', () => {
    const result = validateBarcode('1556804');
    assert.strictEqual(result.symbology, null);
    assert.strictEqual(result.valid, true);
  });

  await t.test('non-numeric code (e.g. legacy test barcode "BAR-PCS")', () => {
    const result = validateBarcode('BAR-PCS');
    assert.strictEqual(result.symbology, null);
    assert.strictEqual(result.valid, true);
  });

  await t.test('empty string', () => {
    const result = validateBarcode('');
    assert.strictEqual(result.symbology, null);
    assert.strictEqual(result.valid, true);
  });

  await t.test('numeric string of GTIN length with surrounding whitespace is trimmed', () => {
    const result = validateBarcode('  4006381333931  ');
    assert.strictEqual(result.symbology, 'EAN-13');
    assert.strictEqual(result.valid, true);
  });
});
