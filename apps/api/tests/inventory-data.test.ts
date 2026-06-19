import { parseLungaLunga, inferRatioFromName } from '../src/scripts/parse-lungalunga.ts';
import { writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import test from 'node:test';
import assert from 'node:assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Parser regression tests ──────────────────────────────────────────────────

test('Inventory Data: Parser Regression', async (t) => {
  const testFilePath = join(__dirname, 'test-inventory-data.txt');

  await t.test('parses lines with empty opening balance (trailing spaces)', () => {
    const content = `
   1421  1556421     1421.0               DRINKING2IN1 CHOCOLATE 90G CTN        48                     3000        3200           0
   1421  1556421     1421.0               DRINKING2IN1 CHOCOLATE 90G PCS         1                     62.5          50           0           0
    120  1555120 10000666.0                              AARAN 2.5KG CTN         6              8599.999989        8700           0
`;
    writeFileSync(testFilePath, content);
    try {
      const rows = parseLungaLunga(testFilePath);
      assert.strictEqual(rows.length, 3);

      const ctnRow = rows.find(r => r.uom === 'CTN' && r.itemId === '1421');
      assert.ok(ctnRow, 'CTN row for 1421 should exist');
      assert.strictEqual(ctnRow?.ratio, 48);
      assert.strictEqual(ctnRow?.openingBal, 0);

      const pcsRow = rows.find(r => r.uom === 'PCS' && r.itemId === '1421');
      assert.ok(pcsRow, 'PCS row for 1421 should exist');
      assert.strictEqual(pcsRow?.ratio, 1);

      const aaranRow = rows.find(r => r.itemId === '120');
      assert.ok(aaranRow, 'AARAN row should exist');
      assert.strictEqual(aaranRow?.ratio, 6);
      assert.strictEqual(aaranRow?.openingBal, 0);
    } finally {
      unlinkSync(testFilePath);
    }
  });

  await t.test('captures multiple tiers for the same itemId', () => {
    const content = `
   2155  1557155     2155.0                        5 TEA 100*10*100G CTN       100                     3200        3300           0
   2155  1557155     2155.0                        5 TEA 100*10*100G PCS         1                       32          40           0           0
   2155  1557155     2155.0                        5 TEA 100*10*100G OUT        10                      320         350           0
`;
    writeFileSync(testFilePath, content);
    try {
      const rows = parseLungaLunga(testFilePath);
      const itemRows = rows.filter(r => r.itemId === '2155');
      assert.strictEqual(itemRows.length, 3);
      assert.deepStrictEqual(itemRows.map(r => r.uom).sort(), ['CTN', 'OUT', 'PCS']);
    } finally {
      unlinkSync(testFilePath);
    }
  });

  await t.test('normalises BULK_UOM at ratio=1 to PCS', () => {
    const content = `
   2158  1557158     2158.0                        5 TEA 200*20*50G OUT         1                     162.94         180           0           0
   2158  1557158     2158.0                        5 TEA 200*20*50G CTN        20                    3258.82        3300           0
`;
    writeFileSync(testFilePath, content);
    try {
      const rows = parseLungaLunga(testFilePath);
      const pcsRow = rows.find(r => r.itemId === '2158' && r.ratio === 1);
      assert.ok(pcsRow, 'base row should exist');
      assert.strictEqual(pcsRow?.uom, 'PCS', 'OUT at ratio=1 should be normalised to PCS');
    } finally {
      unlinkSync(testFilePath);
    }
  });
});

// ── inferRatioFromName edge-case tests ───────────────────────────────────────

test('Inventory Data: inferRatioFromName — Format 1 (count before *)', async (t) => {
  await t.test('N*ml (count before *, unit after second number)', () => {
    assert.strictEqual(inferRatioFromName('DAIMA 18*500ML'), 18);
    assert.strictEqual(inferRatioFromName('DAIMA STRAWBERRY 12*500ML'), 12);
    assert.strictEqual(inferRatioFromName('SODA SPRITE 12*350ML'), 12);
    assert.strictEqual(inferRatioFromName('LUCOZADE 24*250ML'), 24);
    assert.strictEqual(inferRatioFromName('DELMONTE 12*1LTR'), 12);
  });

  await t.test('N*g (count before *, gram unit)', () => {
    assert.strictEqual(inferRatioFromName('WEETABIX 50*37G'), 50);
    assert.strictEqual(inferRatioFromName('ENERGY BISCUITS 36*100G'), 36);
    assert.strictEqual(inferRatioFromName('GINGERNUT BISCUIT 60*30G'), 60);
    assert.strictEqual(inferRatioFromName('NUMI 12*120G'), 12);
    assert.strictEqual(inferRatioFromName('ARIEL DOWNY 72*85G'), 72);
    assert.strictEqual(inferRatioFromName('KOL TOMATO SATCHET 300*20G'), 300);
    assert.strictEqual(inferRatioFromName('KOL CHILI SATCHET 300*20G'), 300);
  });

  await t.test('N*grm / N*gr variants (salt-style)', () => {
    assert.strictEqual(inferRatioFromName('KAYSALT30* 200 GR'), 30);
    assert.strictEqual(inferRatioFromName('KAYSALT40* 500 GRM'), 40);
    assert.strictEqual(inferRatioFromName('KENSALT30* 200G'), 30);
    assert.strictEqual(inferRatioFromName('KENSALT 40*500G'), 40);
    assert.strictEqual(inferRatioFromName('KSL WHITE MINT 12* 1KG'), 12);
    assert.strictEqual(inferRatioFromName('KSL WHITE MINT 12* 500G'), 12);
  });

  await t.test('N*size with no unit — space before count (standalone count)', () => {
    // "SOAP 12*800" → 12 is standalone count, 800 is capacity without unit
    assert.strictEqual(inferRatioFromName('FANAANA SOAP 12*800'), 12);
    // "STAINLESS 20*5" → 20 is standalone count (space precedes it)
    assert.strictEqual(inferRatioFromName('NACET STAINLESS 20*5'), 20);
  });
});

test('Inventory Data: inferRatioFromName — Format 2 (size embedded before *)', async (t) => {
  await t.test('sizeEmbedded*count (alpha immediately before digits)', () => {
    // "MILK500*12" → 500 is part of "MILK500" word → count is 12
    assert.strictEqual(inferRatioFromName('LISHA MILK500*12'), 12);
  });
});

test('Inventory Data: inferRatioFromName — N2 followed by non-unit text', async (t) => {
  await t.test('N2 immediately followed by letters (no word boundary)', () => {
    // "APC*125*100TAPLETS" → "*" precedes standalone "125" → count=125
    assert.strictEqual(inferRatioFromName('APC*125*100TAPLETS'), 125);
  });
});

test('Inventory Data: inferRatioFromName — Suffix format (*Npcs / *N at end)', async (t) => {
  await t.test('*Npcs suffix', () => {
    assert.strictEqual(inferRatioFromName('TOP CHIPS*24pcs'), 24);
    assert.strictEqual(inferRatioFromName('TOP CHIPS *48PCS'), 48);
    assert.strictEqual(inferRatioFromName('PBISCO*24PCS'), 24);
  });

  await t.test('*N suffix where preceding token includes alpha unit (72PK*4)', () => {
    // 72PK*4: non-digit "PK" interrupts digit-before-*, so fmt1/fmt2 won't fire → fmt3 catches *4
    assert.strictEqual(inferRatioFromName('CLUB GLUCOSE 72PK*4'), 4);
  });
});

test('Inventory Data: inferRatioFromName — no ratio (should return null)', async (t) => {
  await t.test('plain name with no * pattern', () => {
    assert.strictEqual(inferRatioFromName('GLACIER WATER 5LTR'), null);
    assert.strictEqual(inferRatioFromName('MALLO'), null);
    assert.strictEqual(inferRatioFromName('JUNIOR JUICE'), null);
    assert.strictEqual(inferRatioFromName('POA BAR SOAP'), null);
    assert.strictEqual(inferRatioFromName('DRIFT WATER 500ML'), null);
  });

  await t.test('ratio of 1 is not returned (meaningless)', () => {
    assert.strictEqual(inferRatioFromName('SOME ITEM 1*500G'), null);
  });
});
