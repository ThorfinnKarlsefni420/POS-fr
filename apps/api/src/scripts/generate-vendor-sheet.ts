/**
 * Generate vendor_catalogue_final.xlsx
 * One row per product family — vendor fills yellow/orange columns.
 * Run: node --env-file=.env --import tsx/esm src/scripts/generate-vendor-sheet.ts [--category "X"]
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import * as XLSX from 'xlsx';

const STORE_ID = 'store_hasans';

// ── Tier mapping ────────────────────────────────────────────────────────────
type Tier = 'base' | 'l1' | 'l2' | 'l3';

const UNIT_TIER: Record<string, Tier> = {
  // Base unit
  PC: 'base', PCS: 'base', EA: 'base',
  KG: 'base', '1KG': 'base', '5KG': 'base', '5K': 'base',
  '10K': 'base', HKG: 'base', LTR: 'base', LT: 'base', HLT: 'base',
  // L1 — outer / small pack
  OT: 'l1', OUT: 'l1',
  BOX: 'l1', BX: 'l1',
  DOZ: 'l1', DZ: 'l1', DZN: 'l1', HDZ: 'l1',
  PKT: 'l1', RB: 'l1', HRB: 'l1',
  HCT: 'l1', // half-carton treated as intermediate
  // L2 — carton / bag / jerry
  CT: 'l2', CTN: 'l2', CT4: 'l2', CT6P: 'l2',
  BG: 'l2', BAG: 'l2', HBG: 'l2',
  JRC: 'l2', JKN: 'l2',
  // L3 — bale / sack
  BL: 'l3', HBL: 'l3', HBA: 'l3',
};

const UNIT_LABEL: Record<string, string> = {
  PC: 'Piece', PCS: 'Piece', EA: 'Each',
  KG: 'Kilogram', '1KG': 'Kilogram (1kg)', '5KG': 'Kilogram (5kg)',
  '5K': 'Kilogram (5kg)', '10K': 'Kilogram (10kg)', HKG: 'Kilogram (0.5kg)',
  LTR: 'Litre', LT: 'Litre', HLT: 'Half Litre',
  OT: 'Outer', OUT: 'Outer',
  BOX: 'Box', BX: 'Box',
  DOZ: 'Dozen (12)', DZ: 'Dozen (12)', DZN: 'Dozen (12)', HDZ: 'Half Dozen (6)',
  PKT: 'Packet', RB: 'Roll Bundle', HRB: 'Half Roll Bundle', HCT: 'Half Carton',
  CT: 'Carton', CTN: 'Carton', CT4: 'Carton (×4)', CT6P: 'Carton (×6)',
  BG: 'Bag', BAG: 'Bag', HBG: 'Half Bag',
  JRC: 'Jerry Can', JKN: 'Jerry Can',
  BL: 'Bale', HBL: 'Half Bale', HBA: 'Half Bale',
};

// ── Qty extraction from product name ────────────────────────────────────────
function extractQty(name: string): { qty: number | null; hint: string } {
  const n = name.toUpperCase();
  const patterns: [RegExp, (m: RegExpMatchArray) => number][] = [
    [/(\d+)\s*[*×X]\s*(?:\d+\.?\d*\s*(?:G|ML|KG|L|LTR))/i, m => parseInt(m[1])],  // 20*500G → 20
    [/(\d+)\s*\/\s*\d+\s*(?:ML|G|KG|L)?/i,                   m => parseInt(m[1])],  // 24/250ML → 24
    [/\[(\d+)\]/,                                              m => parseInt(m[1])],  // [6] → 6
    [/(\d+)\s*[*×X]\s*\d+\s*(?:LTR|L)\b/i,                   m => parseInt(m[1])],  // 4×5LTR → 4
    [/\*(\d+)P\b/i,                                           m => parseInt(m[1])],  // *12P → 12
    [/(\d+)\s*(?:PIECES?|PCS?)\s*(?:CARTON|CTN|CT|PACK)/i,   m => parseInt(m[1])],  // 12 PIECES CARTON
    [/(\d+)\s*(?:PIECES?|PCS?)\s*$/i,                         m => parseInt(m[1])],  // 44 PIECES
  ];
  for (const [re, extract] of patterns) {
    const m = name.match(re);
    if (m) {
      const qty = extract(m);
      if (qty > 1 && qty <= 1000) {
        return { qty, hint: `Name contains "${m[0].trim()}" — suggests ${qty} units per pack` };
      }
    }
  }
  return { qty: null, hint: '' };
}

// ── Fixed L2 qty hints from verbose unit strings ─────────────────────────────
function extractVerboseQty(unitStr: string): number | null {
  // e.g. "Carton of 20", "Box of 12", "Outer of 24"
  const m = unitStr.match(/(?:carton|box|outer|pack|bag|bale)\s+of\s+(\d+)/i);
  return m ? parseInt(m[1]) : null;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const categoryFilter = process.argv.includes('--category')
    ? process.argv[process.argv.indexOf('--category') + 1] : null;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const { rows: items } = await pool.query<{
    name: string; unit: string; sku: string; category: string;
    costPrice: string; sellingPrice: string; taxRate: string;
    currentStock: string; barcode: string | null; notes: string | null;
  }>(`
    SELECT name, unit, sku, category,
           "costPrice", "sellingPrice", "taxRate", "currentStock",
           barcode, notes
    FROM "Item"
    WHERE "storeId" = $1
    ${categoryFilter ? 'AND category = $2' : ''}
    ORDER BY name, unit
  `, categoryFilter ? [STORE_ID, categoryFilter] : [STORE_ID]);

  await pool.end();

  // Group into families by name
  const families = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.name.trim().toLowerCase();
    if (!families.has(key)) families.set(key, []);
    families.get(key)!.push(item);
  }

  console.log(`Building sheet: ${families.size} product families from ${items.length} items…`);

  // Column headers (2 rows)
  const HDR1 = [
    '🔵 DB Name (A)', '🟢 Category (B)', '🟡 Correct Product Name (C)', '🟡 Brand (D)',
    '🟢 VAT% (E)', '🟢 Base Unit (F)', '🟢 Base Cost KES (G)', '🟢 Base Sell KES (H)',
    '🟢 Base Stock (I)', '🟡 Barcode (J)',
    '🟢 L1 Pack Name (K)', '🟠 L1 Qty in Base (L)', '🟢 L1 Cost KES (M)', '🟢 L1 Sell KES (N)', '🟢 L1 Stock (O)',
    '🟢 L2 Pack Name (P)', '🟠 L2 Qty in L1 (Q)', '🟢 L2 Cost KES (R)', '🟢 L2 Sell KES (S)', '🟢 L2 Stock (T)',
    '🟡 Reorder Point (U)', '🟡 Lead Time Days (V)', 'System Notes (W — do not edit)',
  ];
  const HDR2 = [
    'DO NOT EDIT — system key', 'Correct if wrong', 'FILL IN — standard market name', 'FILL IN — e.g. Unilever',
    'Confirm', 'Confirm unit type', 'Confirm KES', 'Confirm KES',
    'Units in stock', 'FILL IN if known',
    'e.g. Outer, Box, Pack', 'FILL — how many base units?', 'KES', 'KES', 'L1 stock',
    'e.g. Carton, Bag, Bale', 'FILL — how many L1 per L2?', 'KES', 'KES', 'L2 stock',
    'Optional — base units', 'Optional — days', 'Auto-generated hints',
  ];

  const dataRows: (string | number)[][] = [];

  for (const [, members] of families) {
    const tierOf = (u: string) => UNIT_TIER[u?.toUpperCase()] ?? null;
    const byTier = (t: Tier) => members.filter(m => tierOf(m.unit) === t);

    const baseItems = byTier('base');
    const l1Items   = byTier('l1');
    const l2Items   = byTier('l2');
    const l3Items   = byTier('l3');

    // Prefer the most expensive unit as the "base" (usually the individual piece)
    // Fall back to first member if no base unit found
    const baseItem = baseItems.sort((a,b) => parseFloat(a.costPrice)-parseFloat(b.costPrice))[0]
                  ?? members[0];
    const l1Item   = l1Items[0] ?? null;
    const l2Item   = l2Items[0] ?? l3Items[0] ?? null; // promote l3→l2 if no l2
    const l2IsL3   = l2Item && tierOf(l2Item.unit) === 'l3';

    // Extract qty hints from name
    const { qty: nameQty, hint: nameHint } = extractQty(baseItem.name);

    // Build notes and pre-fill qty
    let l1QtyPrefill: number | '' = '';
    let l2QtyPrefill: number | '' = '';
    const noteParts: string[] = [];

    if (nameQty) {
      if (l2Item && !l1Item) {
        l2QtyPrefill = nameQty;
        noteParts.push(`${nameHint} — pre-filled as L2 qty`);
      } else if (l1Item) {
        l1QtyPrefill = nameQty;
        noteParts.push(`${nameHint} — pre-filled as L1 qty`);
      }
    }

    const row: (string | number)[] = [
      baseItem.name,                                     // A — DB Name
      baseItem.category || '',                           // B — Category
      '',                                                // C — ✏️ Correct Name
      '',                                                // D — ✏️ Brand
      parseFloat(baseItem.taxRate) || 0,                // E — VAT%
      UNIT_LABEL[baseItem.unit?.toUpperCase()] ?? baseItem.unit ?? 'Piece', // F — Base Unit
      parseFloat(baseItem.costPrice) || '',              // G — Base Cost
      parseFloat(baseItem.sellingPrice) || '',           // H — Base Sell
      parseFloat(baseItem.currentStock) || 0,            // I — Base Stock
      baseItem.barcode ?? '',                            // J — ✏️ Barcode
      l1Item ? (UNIT_LABEL[l1Item.unit?.toUpperCase()] ?? l1Item.unit) : '', // K — L1 Name
      l1QtyPrefill,                                      // L — ✏️ L1 Qty
      l1Item ? (parseFloat(l1Item.costPrice) || '') : '',    // M — L1 Cost
      l1Item ? (parseFloat(l1Item.sellingPrice) || '') : '',  // N — L1 Sell
      l1Item ? (parseFloat(l1Item.currentStock) || 0) : '',   // O — L1 Stock
      l2Item ? (UNIT_LABEL[l2Item.unit?.toUpperCase()] ?? l2Item.unit) : '', // P — L2 Name
      l2QtyPrefill,                                      // Q — ✏️ L2 Qty in L1
      l2Item ? (parseFloat(l2Item.costPrice) || '') : '',    // R — L2 Cost
      l2Item ? (parseFloat(l2Item.sellingPrice) || '') : '',  // S — L2 Sell
      l2Item ? (parseFloat(l2Item.currentStock) || 0) : '',   // T — L2 Stock
      '',                                                // U — ✏️ Reorder Point
      '',                                                // V — ✏️ Lead Time
      noteParts.join(' | '),                             // W — Notes
    ];
    dataRows.push(row);
  }

  // ── Build workbook ─────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();

  // README sheet
  const readme = XLSX.utils.aoa_to_sheet([
    ['VENDOR CATALOGUE — PACKAGING FILL-IN GUIDE'],
    [''],
    ['COLOUR KEY IN COLUMN HEADERS:'],
    ['🔵  Blue   = DO NOT EDIT — system reference key (Column A)'],
    ['🟢  Green  = Pre-filled from our records. Please CONFIRM or correct.'],
    ['🟡  Yellow = You MUST fill this in.'],
    ['🟠  Orange = Pre-filled from product name clue. Please CONFIRM or correct.'],
    [''],
    ['WHAT TO FILL IN:'],
    ['C  — Correct Product Name : Write the clean, standard market name (e.g. "Sparoni Spaghetti 500g")'],
    ['D  — Brand                : Manufacturer or brand name (e.g. "Unilever", "Nestlé")'],
    ['L  — L1 Qty in Base       : How many base units fit in 1 L1 pack? (e.g. 12 pieces per Outer)'],
    ['Q  — L2 Qty in L1         : How many L1 packs fit in 1 L2 carton/bag? (e.g. 24 Outers per Carton)'],
    ['U  — Reorder Point        : Minimum stock level before re-ordering (in base units). Optional.'],
    ['V  — Lead Time (days)     : How many days from order to delivery. Optional.'],
    ['J  — Barcode              : Supplier barcode for the base unit. Optional.'],
    [''],
    ['PACKAGING HIERARCHY EXAMPLES:'],
    ['Product Type   | Base Unit | L1 Pack              | L2 Pack'],
    ['Biscuits       | Piece     | Outer   (12 pieces)  | Carton  (24 outers)'],
    ['Cooking Oil    | Bottle    | —                    | Carton  (12 bottles)'],
    ['Diapers        | Piece     | Pack    (44 pieces)  | Carton  (4 packs)'],
    ['Rice (bagged)  | Kg        | —                    | Bag     (25 kg = 25 units)'],
    ['Pasta          | Piece     | —                    | Carton  (20 pieces)'],
    ['Tissue         | Roll      | Pack    (12 rolls)   | Carton  (12 packs)'],
    ['Water (5L)     | Bottle    | Shrink  (4 bottles)  | —'],
    [''],
    ['IMPORTANT: Column Q (L2 Qty) means "how many L1 packs per L2 carton/bag" — NOT total base units.'],
    ['The system automatically calculates total base units from L1 × L2.'],
    [''],
    ['NOTES column (W) shows auto-detected clues from the product name. Please confirm these values in L or Q.'],
  ]);
  readme['!cols'] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, readme, 'READ ME FIRST');

  // Products sheet
  const allRows = [HDR1, HDR2, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(allRows);
  ws['!cols'] = [
    { wch: 42 }, { wch: 26 }, { wch: 42 }, { wch: 20 },
    { wch: 6  }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 16 },
    { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
    { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
    { wch: 14 }, { wch: 16 }, { wch: 55 },
  ];
  ws['!views'] = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];
  ws['!autofilter'] = { ref: `A2:W${dataRows.length + 2}` };
  XLSX.utils.book_append_sheet(wb, ws, 'Products');

  // Summary sheet
  const catCounts = new Map<string, number>();
  for (const row of dataRows) catCounts.set(String(row[1] || 'Uncategorized'), (catCounts.get(String(row[1] || 'Uncategorized')) ?? 0) + 1);
  const summaryRows = [
    ['Category', 'Product Families'],
    ['── TOTAL ──', dataRows.length],
    [],
    ...Array.from(catCounts.entries()).sort((a, b) => (b[1] as number) - (a[1] as number)),
  ];
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
  summaryWs['!cols'] = [{ wch: 35 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  // Write
  const qty_hints  = dataRows.filter(r => r[22] !== '').length;
  const l1_prefill = dataRows.filter(r => r[11] !== '').length;
  const l2_prefill = dataRows.filter(r => r[16] !== '').length;

  const outPath = join(process.cwd(), '../../vendor_catalogue_final.xlsx');
  XLSX.writeFile(wb, outPath);

  console.log(`\n✔  Written: ${outPath}`);
  console.log(`   ${families.size} product families`);
  console.log(`   ${l2_prefill} L2 qtys pre-filled  (orange — vendor confirms)`);
  console.log(`   ${l1_prefill} L1 qtys pre-filled  (orange — vendor confirms)`);
  console.log(`   ${qty_hints} rows with auto-extracted name clues`);
  console.log(`   ${dataRows.length - qty_hints} rows vendor must fill from scratch`);
}

main().catch(e => { console.error(e); process.exit(1); });
