import { parseLungaLunga, inferRatioFromName } from '../src/scripts/parse-lungalunga.ts';
import { classifyItem, normaliseUom, DEFAULT_RATIO, DEFAULT_L2_QTY, BULK_UOMS, type ClassifyRow } from '../src/scripts/classify-inventory.ts';
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

// ── classifyItem tests ────────────────────────────────────────────────────────
// Dependency map: classifyItem ← BULK_UOMS, DEFAULT_RATIO (30), DEFAULT_L2_QTY (20)
// Upstream: conversion script groups rows by ITEM_ID and passes them here
// Downstream: output rows written to realData-import.csv
// Existing coverage: none — classifyItem had no tests before this module was created
// Why each test is necessary: each branch of classifyItem has distinct output shape

function row(overrides: Partial<ClassifyRow> = {}): ClassifyRow {
  return { uom: 'CTN', ratio: 1, cost: 300, sell: 360, stock: 5, barcode: '123', vat: 0, ...overrides };
}

test('classifyItem — explicit non-bulk base kept as-is', async (t) => {
  // Gap: truePcsRow branch was never tested
  await t.test('PCS+CTN source: PCS stays base, CTN ratio unchanged', () => {
    const rows = [row({ uom: 'PCS', ratio: 1, cost: 10, sell: 12 }), row({ uom: 'CTN', ratio: 48, cost: 480, sell: 576 })];
    const result = classifyItem(rows);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.defaulted, false);
    const base = result.rows.find(r => r.ratio === 1);
    assert.strictEqual(base?.uom, 'PCS');
    const ctn = result.rows.find(r => r.uom === 'CTN');
    assert.strictEqual(ctn?.ratio, 48, 'source ratio must not be overridden');
  });

  await t.test('KG base is also treated as explicit non-bulk', () => {
    const rows = [row({ uom: 'KG', ratio: 1, cost: 50, sell: 60 })];
    const result = classifyItem(rows);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.defaulted, false);
    assert.strictEqual(result.rows[0].uom, 'KG');
  });
});

test('classifyItem — bulk UOM at ratio=1, single source tier → synthetic L2', async (t) => {
  // Gap: bulk-at-1 branch, single-tier path (synthetic CTN L2 added)
  await t.test('CTN=1 synthesises PCS base at ratio=30 with synthetic L2', () => {
    const result = classifyItem([row({ uom: 'CTN', ratio: 1, cost: 300, sell: 360, stock: 2 })]);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.defaulted, true);

    const sorted = [...result.rows].sort((a, b) => a.ratio - b.ratio);
    const [pcs, l1, l2] = sorted;

    assert.strictEqual(pcs.uom, 'PCS');
    assert.strictEqual(pcs.ratio, 1);
    assert.strictEqual(pcs.cost, 300 / DEFAULT_RATIO);          // 10
    assert.strictEqual(pcs.stock, 2 * DEFAULT_RATIO);           // 60

    assert.strictEqual(l1.uom, 'CTN');
    assert.strictEqual(l1.ratio, DEFAULT_RATIO);                // 30
    assert.strictEqual(l1.cost, 300);

    assert.strictEqual(l2.uom, 'CTN');
    assert.strictEqual(l2.ratio, DEFAULT_RATIO * DEFAULT_L2_QTY); // 600
    assert.strictEqual(l2.cost, 300 * DEFAULT_L2_QTY);          // 6000
  });

  await t.test('OUT=1 uses OUT as L1', () => {
    const result = classifyItem([row({ uom: 'OUT', ratio: 1, cost: 350, sell: 400 })]);
    const l1 = result.rows.find(r => r.ratio === DEFAULT_RATIO);
    assert.strictEqual(l1?.uom, 'OUT');
  });
});

test('classifyItem — bulk UOM at ratio=1 with existing second source tier → L2 scaled', async (t) => {
  // Gap: higher-tier scaling path (source has 2 tiers; L2 gets ratio×30)
  await t.test('OUT=1 BAL=3: L2 ratio becomes 3×30=90, L2 qty-in-L1 = 3', () => {
    const rows = [
      row({ uom: 'OUT', ratio: 1, cost: 864, sell: 900 }),
      row({ uom: 'BAL', ratio: 3, cost: 2592, sell: 2700 }),
    ];
    const result = classifyItem(rows);
    const sorted = [...result.rows].sort((a, b) => a.ratio - b.ratio);
    const [pcs, l1, l2] = sorted;

    assert.strictEqual(pcs.ratio, 1);
    assert.strictEqual(l1.uom, 'OUT');
    assert.strictEqual(l1.ratio, 30);
    assert.strictEqual(l2.uom, 'BAL');
    assert.strictEqual(l2.ratio, 3 * 30);  // 90 PCS per BAL
    // L2 Qty in L1 used in output = round(90/30) = 3
    assert.strictEqual(Math.round(l2.ratio / l1.ratio), 3);
  });
});

test('classifyItem — PCS at ratio=0 fixed to ratio=1 (corrupt source data)', async (t) => {
  // Gap: ratio=0 fix path — 61 real items have this pattern
  await t.test('PCS ratio=0 treated as ratio=1, no synthesis', () => {
    const result = classifyItem([row({ uom: 'PCS', ratio: 0, cost: 50, sell: 60 })]);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.defaulted, false);
    const base = result.rows.find(r => r.uom === 'PCS');
    assert.strictEqual(base?.ratio, 1, 'ratio=0 must be corrected to 1');
  });

  await t.test('two duplicate PCS ratio=0 rows both fixed; item is valid', () => {
    const r1 = row({ uom: 'PCS', ratio: 0, cost: 50, sell: 60 });
    const r2 = row({ uom: 'PCS', ratio: 0, cost: 50, sell: 60 });
    const result = classifyItem([r1, r2]);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.defaulted, false);
    assert.ok(result.rows.every(r => r.ratio === 1), 'all fixed rows must have ratio=1');
  });

  await t.test('bulk UOM ratio=0 is NOT fixed (only non-bulk rows get the fix)', () => {
    // CTN at ratio=0 is not a PCS-style corrupt row — treated as "no base" → synthesise
    const result = classifyItem([row({ uom: 'CTN', ratio: 0 })]);
    // CTN ratio=0 stays 0; no truePcsRow; sourceRow=CTN(0); falls through to synthesis
    // pcsRow cost = 0 (sourceRow.cost/30 since cost>0 guard); still valid
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.defaulted, true);
  });
});

test('classifyItem — all rows ratio>1 (no base row): synthesise from smallest', async (t) => {
  // Gap: fallback path — 10 real items have all-ratio>1 (AFRIN NOODLES CTN=10, etc.)
  await t.test('CTN=10 only: pick CTN as source, synthesise PCS at ratio=30', () => {
    const ctn = row({ uom: 'CTN', ratio: 10, cost: 300, sell: 360 });
    const result = classifyItem([ctn]);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.defaulted, true);

    const sorted = [...result.rows].sort((a, b) => a.ratio - b.ratio);
    const [pcs, l1] = sorted;
    assert.strictEqual(pcs.uom, 'PCS');
    assert.strictEqual(pcs.ratio, 1);
    assert.strictEqual(pcs.cost, 300 / DEFAULT_RATIO);
    assert.strictEqual(l1.uom, 'CTN');
    assert.strictEqual(l1.ratio, DEFAULT_RATIO);  // overrides the original 10
  });

  await t.test('CTN=20 KG=2: pick KG (smaller ratio) as source; CTN scaled proportionally', () => {
    const rows = [
      row({ uom: 'CTN', ratio: 20, cost: 2000, sell: 2200 }),
      row({ uom: 'KG',  ratio: 2,  cost: 200,  sell: 220  }),
    ];
    const result = classifyItem(rows);
    const sorted = [...result.rows].sort((a, b) => a.ratio - b.ratio);
    const [pcs, l1, l2] = sorted;

    assert.strictEqual(pcs.ratio, 1);
    assert.strictEqual(l1.uom, 'KG');
    assert.strictEqual(l1.ratio, DEFAULT_RATIO);             // KG promoted to L1 at 30
    // CTN: (20/2) * 30 = 300
    assert.strictEqual(l2.uom, 'CTN');
    assert.strictEqual(l2.ratio, Math.round((20 / 2) * DEFAULT_RATIO));  // 300
    assert.strictEqual(Math.round(l2.ratio / l1.ratio), 10);  // 10 KG per CTN
  });
});

test('classifyItem — empty input returns invalid', async (t) => {
  // Gap: guard clause for no rows
  await t.test('empty rows array → valid=false', () => {
    const result = classifyItem([]);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.reason, 'no-rows');
  });
});

test('normaliseUom — bulk UOM at ratio=1 renamed to PCS', async (t) => {
  // Gap: normaliseUom used in output stage; no prior test
  await t.test('bulk UOMs at ratio=1 become PCS', () => {
    for (const uom of BULK_UOMS) {
      assert.strictEqual(normaliseUom(uom, 1), 'PCS', `${uom} at ratio=1 should be PCS`);
    }
  });

  await t.test('bulk UOMs at ratio>1 are kept', () => {
    assert.strictEqual(normaliseUom('CTN', 30), 'CTN');
    assert.strictEqual(normaliseUom('OUT', 48), 'OUT');
  });

  await t.test('non-bulk UOMs pass through unchanged', () => {
    assert.strictEqual(normaliseUom('PCS', 1), 'PCS');
    assert.strictEqual(normaliseUom('KG', 1), 'KG');
    assert.strictEqual(normaliseUom('LTR', 1), 'LTR');
  });
});
