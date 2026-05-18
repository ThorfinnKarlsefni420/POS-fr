import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Product } from '@/types/pos';

export interface ParseResult {
  products: Product[];
  errors: string[];
  skipped: number;
}

const DEFAULT_PRODUCT_IMAGE = 'https://placehold.co/400x400/e5e7eb/6b7280?text=Product';

type Row = Record<string, string | undefined>;

function parsePrice(raw: string | undefined): number {
  if (!raw || raw.toString().trim() === '') return 0;
  const num = parseFloat(raw.toString().replace(/[^0-9.]/g, ''));
  return isNaN(num) ? 0 : num;
}

// ── Vendor catalogue helpers ────────────────────────────────────────────────

function cleanHeader(s: string): string {
  // Strip emoji, normalize all whitespace (including newlines) to single space
  return s
    .replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// A row is a vendor catalogue header row if it contains a cell matching "db name"
function isDbNameRow(row: string[]): boolean {
  return row.some(cell => cleanHeader(String(cell)).includes('db name'));
}

// Matches "AJAB 24*1KG", "BROOKSIDE 6*2.5KG", "ALWAYS 16*7 BLUE", "20*500G"
function inferFromDbName(dbName: string): { l1Name?: string; l1Qty?: number; l2Name?: string; l2Qty?: number } {
  const m = dbName.match(/\b(\d+)\s*[*×xX]\s*[\d.]+/i);
  if (m) {
    const qty = parseInt(m[1], 10);
    if (qty > 1 && qty <= 500) return { l2Name: 'Carton', l2Qty: qty };
  }
  return {};
}

const CATEGORY_NORMS: Record<string, { l1Name?: string; l1Qty?: number; l2Name?: string; l2Qty?: number }> = {
  'staples - pasta & noodles':    { l2Name: 'Carton', l2Qty: 20 },
  'staples - rice':               { l2Name: 'Bag',    l2Qty: 10 },
  'staples - flour & ugali':      { l2Name: 'Bag',    l2Qty: 10 },
  'cooking oil':                  { l2Name: 'Carton', l2Qty: 12 },
  'dairy - milk':                 { l2Name: 'Carton', l2Qty: 12 },
  'dairy - yoghurt':              { l2Name: 'Carton', l2Qty: 12 },
  'baby care - diapers':          { l2Name: 'Carton', l2Qty: 6  },
  'baby care - infant formula':   { l2Name: 'Carton', l2Qty: 6  },
  'tomato paste & sauce':         { l2Name: 'Carton', l2Qty: 24 },
  'beverages - juice & drinks':   { l2Name: 'Carton', l2Qty: 12 },
  'beverages - water':            { l2Name: 'Carton', l2Qty: 12 },
  'beverages - energy drinks':    { l2Name: 'Carton', l2Qty: 24 },
  'beverages - soda':             { l2Name: 'Carton', l2Qty: 24 },
  'personal care - hair care':    { l2Name: 'Carton', l2Qty: 12 },
  'personal care - skin care':    { l2Name: 'Carton', l2Qty: 12 },
  'personal care - oral care':    { l1Name: 'Dozen',  l1Qty: 12, l2Name: 'Carton', l2Qty: 6 },
  'personal care - body care':    { l2Name: 'Carton', l2Qty: 12 },
  'household - detergents':       { l2Name: 'Carton', l2Qty: 12 },
  'household - dishwashing':      { l2Name: 'Carton', l2Qty: 12 },
  'household - insecticides':     { l2Name: 'Carton', l2Qty: 12 },
  'snacks & confectionery':       { l2Name: 'Carton', l2Qty: 12 },
  'snacks - chocolate':           { l2Name: 'Carton', l2Qty: 12 },
  'biscuits & bread':             { l2Name: 'Carton', l2Qty: 12 },
  'other - general merchandise':  { l2Name: 'Carton', l2Qty: 12 },
};

function inferFromCategory(category: string, dbName: string = ''): { l1Name?: string; l1Qty?: number; l2Name?: string; l2Qty?: number } {
  const cat = category.toLowerCase().trim();

  if (cat.includes('cooking oil')) {
    const n = dbName.toUpperCase();
    const qty = /\b5\s*L(TR)?\b/.test(n) || /\b5000\s*ML\b/.test(n) ? 4
              : /\b20\s*L(TR)?\b/.test(n) ? 1
              : 12;
    return { l2Name: 'Carton', l2Qty: qty };
  }

  for (const [key, norm] of Object.entries(CATEGORY_NORMS)) {
    if (cat.includes(key) || key.includes(cat)) return norm;
  }
  return {};
}

function inferPackaging(dbName: string, category: string) {
  const fromDb = inferFromDbName(dbName);
  if (fromDb.l2Qty) return fromDb;
  return inferFromCategory(category, dbName);
}

// ── Vendor catalogue column detection ──────────────────────────────────────
// Column names may contain emoji, newlines, and parenthetical notes —
// cleanHeader() normalises all of these before matching.

function detectVendorColumns(headers: string[]) {
  const clean = headers.map(cleanHeader);

  const findVC = (...kws: string[]) => {
    for (const kw of kws) {
      const i = clean.findIndex(h => h.includes(kw));
      if (i !== -1) return headers[i];
    }
    return undefined;
  };

  return {
    dbNameCol:      findVC('db name'),
    categoryCol:    findVC('category'),
    correctNameCol: findVC('correct product name', 'correct name'),
    vatCol:         findVC('vat %', 'vat%', 'vat'),
    unitCol:        findVC('base unit'),
    priceCol:       findVC('base cost'),
    sellCol:        findVC('base sell'),
    stockCol:       findVC('base stock'),
    barcodeCol:     findVC('barcode'),
    l1NameCol:      findVC('l1 pack name'),
    l1QtyCol:       findVC('l1 qty in base', 'l1 qty'),
    l1CostCol:      findVC('l1 cost'),
    l1SellCol:      findVC('l1 sell'),
    l2NameCol:      findVC('l2 pack name'),
    l2QtyInL1Col:   findVC('l2 qty in l1', 'l2 qty'),
    l2CostCol:      findVC('l2 cost'),
    l2SellCol:      findVC('l2 sell'),
    reorderCol:     findVC('reorder point'),
  };
}

function rowsToVendorCatalogueProducts(rows: Row[], serviceFeePercent: number): ParseResult {
  if (rows.length === 0) return { products: [], errors: [], skipped: 0 };

  const cols = detectVendorColumns(Object.keys(rows[0]));
  const errors: string[] = [];
  let skipped = 0;
  const products: Product[] = [];
  const seenSkus = new Map<string, number>();

  rows.forEach((row, i) => {
    const dbName = cols.dbNameCol ? row[cols.dbNameCol]?.toString().trim() ?? '' : '';
    let name = cols.correctNameCol ? row[cols.correctNameCol]?.toString().trim() ?? '' : '';
    if (!name) name = dbName;
    if (!name) { skipped++; return; }

    const category = cols.categoryCol ? row[cols.categoryCol]?.toString().trim() ?? '' : '';
    const costPrice  = parsePrice(cols.priceCol   ? row[cols.priceCol]   : undefined);
    const rawSell    = parsePrice(cols.sellCol     ? row[cols.sellCol]    : undefined);
    const sellingPrice = rawSell > 0
      ? rawSell
      : costPrice > 0 ? Number((costPrice * (1 + serviceFeePercent / 100)).toFixed(2)) : 0;
    const taxRate      = parsePrice(cols.vatCol    ? row[cols.vatCol]     : undefined);
    const currentStock = parsePrice(cols.stockCol  ? row[cols.stockCol]   : undefined);
    const barcode      = cols.barcodeCol ? row[cols.barcodeCol]?.toString().trim() || undefined : undefined;
    const rawUnit      = cols.unitCol ? row[cols.unitCol]?.toString().trim() || 'Piece' : 'Piece';
    // If the vendor filled the base unit with a packaging word (Box, Carton, Bag…)
    // it means they entered the outer pack instead of the actual sellable unit.
    // Normalise to "Piece" — same logic as the CLI import-vendor-catalogue script.
    const packWords    = /^(carton|box|bag|bale|outer|pack|packet|sack|jerry\s*can|bundle|case|crate|dozen.*)$/i;
    const unit         = packWords.test(rawUnit) ? 'Piece' : rawUnit;

    // SKU from DB name slug (stable across re-imports)
    const baseSku = dbName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    const skuCount = seenSkus.get(baseSku) ?? 0;
    seenSkus.set(baseSku, skuCount + 1);
    const sku = skuCount === 0 ? baseSku : `${baseSku}-${skuCount + 1}`;

    // Read L1/L2 directly from sheet
    let l1Name    = cols.l1NameCol     ? row[cols.l1NameCol]?.toString().trim()     ?? '' : '';
    let l1Qty     = parsePrice(cols.l1QtyCol     ? row[cols.l1QtyCol]     : undefined);
    let l2Name    = cols.l2NameCol     ? row[cols.l2NameCol]?.toString().trim()     ?? '' : '';
    let l2QtyInL1 = parsePrice(cols.l2QtyInL1Col ? row[cols.l2QtyInL1Col] : undefined);

    // Infer missing packaging from DB Name pattern + category norms
    if (!l1Qty && !l2QtyInL1) {
      const inf = inferPackaging(dbName, category);
      if (!l1Name && inf.l1Name) l1Name = inf.l1Name;
      if (inf.l1Qty)  l1Qty     = inf.l1Qty;
      if (!l2Name && inf.l2Name) l2Name = inf.l2Name;
      if (inf.l2Qty)  l2QtyInL1 = inf.l2Qty;
    } else if (l2Name && !l2QtyInL1) {
      const inf = inferPackaging(dbName, category);
      if (inf.l2Qty) l2QtyInL1 = inf.l2Qty;
    }

    // Build packaging tiers
    const packagingTiers: any[] = [];

    if ((l1Name && l1Qty > 0) || (l2Name && l2QtyInL1 > 0)) {
      packagingTiers.push({
        id: `vc-l0-${sku}-${i}`,
        name: unit,
        level: 0,
        quantityInBase: 1,
        costPrice,
        sellingPriceOverride: sellingPrice || null,
        barcode: barcode ?? null,
        isBaseUnit: true,
      });

      if (l1Name && l1Qty > 0) {
        packagingTiers.push({
          id: `vc-l1-${sku}-${i}`,
          name: l1Name,
          level: 1,
          quantityInBase: l1Qty,
          costPrice: parsePrice(cols.l1CostCol ? row[cols.l1CostCol] : undefined) || costPrice * l1Qty,
          sellingPriceOverride: parsePrice(cols.l1SellCol ? row[cols.l1SellCol] : undefined) || null,
          barcode: null,
          isBaseUnit: false,
        });
      }

      if (l2Name && l2QtyInL1 > 0) {
        // If no L1 exists, L2 is the first grouping above base (l1 implicitly = 1)
        const l1QtyForCalc = l1Qty || 1;
        packagingTiers.push({
          id: `vc-l2-${sku}-${i}`,
          name: l2Name,
          level: 2,
          quantityInBase: l1QtyForCalc * l2QtyInL1,
          costPrice: parsePrice(cols.l2CostCol ? row[cols.l2CostCol] : undefined) || costPrice * l1QtyForCalc * l2QtyInL1,
          sellingPriceOverride: parsePrice(cols.l2SellCol ? row[cols.l2SellCol] : undefined) || null,
          barcode: null,
          isBaseUnit: false,
        });
      }
    }

    products.push({
      id: `import-${Date.now()}-${i}`,
      name,
      sku,
      category,
      subCategory: '',
      unit,
      boxQty: '',
      costPrice,
      sellingPrice,
      nomadBitePrice: 0,
      taxRate,
      isFractional: false,
      currentStock,
      etimsCode: 'NONTAXABLE',
      imageUrl: DEFAULT_PRODUCT_IMAGE,
      packagingTiers: packagingTiers.length > 0 ? packagingTiers : undefined,
    });
  });

  return { products, errors, skipped };
}

// ── Generic CSV/XLS column detection ────────────────────────────────────────

function detectColumns(headers: string[]) {
  const lower = headers.map(h => h.toLowerCase().trim());

  const find = (...keywords: string[]) => {
    for (const kw of keywords) {
      const i = lower.indexOf(kw);
      if (i !== -1) return headers[i];
    }
    for (const kw of keywords) {
      const i = lower.findIndex(h => h.includes(kw));
      if (i !== -1) return headers[i];
    }
    return undefined;
  };

  const nameCol = find('item', 'name', 'product name', 'product', 'title', 'description');

  const categoryCol =
    headers.find((_, i) => lower[i].includes('category') && !lower[i].includes('sub')) ??
    headers.find((_, i) => lower[i].includes('category'));

  const subCategoryCol = headers.find((_, i) =>
    lower[i].includes('sub') && lower[i].includes('cat')
  );

  const priceCol = headers.find((_, i) => {
    const h = lower[i];
    return (h.includes('buying') || h.includes('cost') || h.includes('amount') ||
            (h.includes('price') && !h.includes('selling')))
      && !h.includes('nomad') && !h.includes('service') && !h.includes('fee');
  });

  const sellingPriceCol = headers.find((_, i) => {
    const h = lower[i];
    return h.includes('selling') && h.includes('price');
  });

  const skuCol =
    headers.find((_, i) => lower[i] === 'id' || lower[i] === 'sku') ??
    headers.find((_, i) =>
      lower[i].includes('sku') || lower[i].includes('barcode') ||
      lower[i].includes('bar_code') || lower[i].includes('bar code') ||
      lower[i].includes('item id') || lower[i].includes('product id')
    );

  const unitCol = headers.find((_, i) =>
    lower[i].includes('unit') || lower[i].includes('pack') ||
    lower[i].includes('size') || lower[i].includes('uom')
  );

  const imageCol = headers.find((_, i) =>
    lower[i].includes('image') || lower[i].includes('img') ||
    lower[i].includes('photo') || lower[i].includes('picture') || lower[i] === 'url'
  );

  const vatCol = find('vat', 'tax rate', 'taxrate', 'tax');
  const stockCol = find('itemsbalance', 'items balance', 'balance', 'stock', 'qty', 'quantity', 'current stock');

  // Strip parentheses before matching packaging tier columns
  const cleanLower = lower.map(h => h.replace(/[()]/g, ''));
  const findClean = (...keywords: string[]) => {
    for (const kw of keywords) {
      const i = cleanLower.findIndex(h => h.includes(kw));
      if (i !== -1) return headers[i];
    }
    return undefined;
  };

  const l1Name    = findClean('l1 pack name', 'l1 name', 'l1packname');
  const l1Qty     = findClean('l1 qty in base', 'l1 quantity', 'l1qty');
  const l1Cost    = findClean('l1 cost', 'l1 buying');
  const l1Sell    = findClean('l1 sell', 'l1 price');
  const l1Barcode = findClean('l1 barcode', 'l1 bar code');
  const l2Name    = findClean('l2 pack name', 'l2 name', 'l2packname');
  const l2QtyInL1 = findClean('l2 qty in l1', 'l2 quantity in l1', 'l2qtyl1');
  const l2Cost    = findClean('l2 cost', 'l2 buying');
  const l2Sell    = findClean('l2 sell', 'l2 price');
  const l2Barcode = findClean('l2 barcode', 'l2 bar code');

  return {
    nameCol, categoryCol, subCategoryCol, priceCol, sellingPriceCol,
    skuCol, unitCol, imageCol, vatCol, stockCol,
    l1Name, l1Qty, l1Cost, l1Sell, l1Barcode,
    l2Name, l2QtyInL1, l2Cost, l2Sell, l2Barcode,
  };
}

function extractMultiplier(name: string): number | undefined {
  const patterns = [
    /(\d+)\s*[*xX]\s*\d+/,
    /(\d+)\s*pcs/i,
    /pack\s*of\s*(\d+)/i,
    /case\s*of\s*(\d+)/i,
    /(\d+)\s*units/i,
  ];
  for (const p of patterns) {
    const match = name.match(p);
    if (match) return parseInt(match[1], 10);
  }
  return undefined;
}

function rowsToProducts(rows: Row[], serviceFeePercent: number): ParseResult {
  if (rows.length === 0) return { products: [], errors: [], skipped: 0 };

  const cols = detectColumns(Object.keys(rows[0]));
  const errors: string[] = [];
  let skipped = 0;
  const products: Product[] = [];
  const seenSkus = new Map<string, number>();

  rows.forEach((row, i) => {
    const name = cols.nameCol ? row[cols.nameCol]?.toString().trim() : undefined;
    if (!name) { skipped++; return; }

    const costPrice = parsePrice(cols.priceCol ? row[cols.priceCol] : undefined);
    const rawSellingPrice = parsePrice(cols.sellingPriceCol ? row[cols.sellingPriceCol] : undefined);
    const sellingPrice = rawSellingPrice > 0
      ? rawSellingPrice
      : costPrice > 0 ? Number((costPrice * (1 + serviceFeePercent / 100)).toFixed(2)) : 0;

    const rawVat = cols.vatCol ? row[cols.vatCol]?.toString().trim() : undefined;
    const taxRate = rawVat ? parsePrice(rawVat) : 0;
    const rawStock = cols.stockCol ? row[cols.stockCol]?.toString().trim() : undefined;
    const currentStock = rawStock ? parsePrice(rawStock) : 0;
    const rawSku = cols.skuCol ? row[cols.skuCol]?.toString().trim() : undefined;
    const fileImage = cols.imageCol ? row[cols.imageCol]?.toString().trim() : undefined;

    const baseSku = rawSku
      ? rawSku.replace(/\s+/g, '-')
      : `SKU-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`;
    const skuCount = seenSkus.get(baseSku) ?? 0;
    seenSkus.set(baseSku, skuCount + 1);
    const sku = skuCount === 0 ? baseSku : `${baseSku}-${skuCount + 1}`;

    const packagingTiers: any[] = [];
    let l1NameVal = cols.l1Name ? row[cols.l1Name]?.toString().trim() : undefined;
    let l1QtyVal  = parsePrice(cols.l1Qty ? row[cols.l1Qty] : undefined);

    if (!l1QtyVal) {
      const guessed = extractMultiplier(name);
      if (guessed && guessed > 1) { l1QtyVal = guessed; if (!l1NameVal) l1NameVal = 'Outer'; }
    }

    if (l1NameVal && l1QtyVal > 0) {
      const unit = cols.unitCol ? row[cols.unitCol]?.toString().trim() ?? 'Piece' : 'Piece';
      packagingTiers.push({
        id: `import-tier-l0-${sku}-${i}`, name: unit, level: 0, quantityInBase: 1,
        costPrice, sellingPriceOverride: sellingPrice, barcode: rawSku || null, isBaseUnit: true,
      });
      packagingTiers.push({
        id: `import-tier-l1-${sku}-${i}`, name: l1NameVal, level: 1, quantityInBase: l1QtyVal,
        costPrice: parsePrice(cols.l1Cost ? row[cols.l1Cost] : undefined) || (costPrice * l1QtyVal),
        sellingPriceOverride: parsePrice(cols.l1Sell ? row[cols.l1Sell] : undefined) || null,
        barcode: cols.l1Barcode ? row[cols.l1Barcode]?.toString().trim() : null, isBaseUnit: false,
      });
    }

    const l2NameVal = cols.l2Name ? row[cols.l2Name]?.toString().trim() : undefined;
    const l2QtyInL1Val = parsePrice(cols.l2QtyInL1 ? row[cols.l2QtyInL1] : undefined);

    if (l2NameVal && l2QtyInL1Val > 0) {
      const l1Qty = packagingTiers.find(t => t.level === 1)?.quantityInBase || 1;
      const qtyInBase = l2QtyInL1Val * l1Qty;
      packagingTiers.push({
        id: `import-tier-l2-${sku}-${i}`, name: l2NameVal, level: 2, quantityInBase: qtyInBase,
        costPrice: parsePrice(cols.l2Cost ? row[cols.l2Cost] : undefined) || (costPrice * qtyInBase),
        sellingPriceOverride: parsePrice(cols.l2Sell ? row[cols.l2Sell] : undefined) || null,
        barcode: cols.l2Barcode ? row[cols.l2Barcode]?.toString().trim() : null, isBaseUnit: false,
      });
    }

    products.push({
      id: `import-${Date.now()}-${i}`,
      name,
      sku,
      category: cols.categoryCol ? row[cols.categoryCol]?.toString().trim() ?? '' : '',
      subCategory: cols.subCategoryCol ? row[cols.subCategoryCol]?.toString().trim() ?? '' : '',
      unit: cols.unitCol ? row[cols.unitCol]?.toString().trim() ?? '' : '',
      boxQty: '',
      costPrice, sellingPrice, nomadBitePrice: 0, taxRate, isFractional: false, currentStock,
      etimsCode: 'NONTAXABLE',
      imageUrl: fileImage || DEFAULT_PRODUCT_IMAGE,
      packagingTiers: packagingTiers.length > 0 ? packagingTiers : undefined,
    });
  });

  return { products, errors, skipped };
}

// ── Excel / CSV entry points ─────────────────────────────────────────────────

function parseExcel(file: File, serviceFeePercent: number): Promise<ParseResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: false });

        // Prefer "Products" sheet; fall back to first sheet
        const sheetName = workbook.SheetNames.includes('Products')
          ? 'Products'
          : workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Read as raw arrays — needed to handle multi-row headers with merged cells
        const raw = XLSX.utils.sheet_to_json<string[]>(sheet, {
          header: 1, defval: '', raw: false,
        }) as string[][];

        // Find the row containing "DB Name" — that row IS the column names
        const vcHeaderIdx = raw.findIndex((row, i) => i < 5 && isDbNameRow(row));

        if (vcHeaderIdx !== -1) {
          const colNames = raw[vcHeaderIdx].map(c => String(c));

          // Skip the column-names row + any immediately following instruction rows
          let dataStartIdx = vcHeaderIdx + 1;
          while (
            dataStartIdx < raw.length &&
            /do not edit|fill in|confirm|e\.g\.|system key/i.test(
              cleanHeader(String(raw[dataStartIdx]?.[0] ?? ''))
            )
          ) {
            dataStartIdx++;
          }

          const dataRows: Row[] = raw
            .slice(dataStartIdx)
            .filter(r => String(r[0] ?? '').trim())
            .map(r => {
              const obj: Row = {};
              colNames.forEach((col, j) => { obj[col] = String(r[j] ?? ''); });
              return obj;
            });

          resolve(rowsToVendorCatalogueProducts(dataRows, serviceFeePercent));
        } else {
          // Generic spreadsheet — use normal header row
          const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: '', raw: false });
          resolve(rowsToProducts(rows, serviceFeePercent));
        }
      } catch (err) {
        resolve({ products: [], errors: [(err as Error).message], skipped: 0 });
      }
    };
    reader.onerror = () => resolve({ products: [], errors: ['Failed to read file'], skipped: 0 });
    reader.readAsArrayBuffer(file);
  });
}

function parseCsv(file: File, serviceFeePercent: number): Promise<ParseResult> {
  return new Promise((resolve) => {
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        const rows = results.data;
        let result: ParseResult;
        if (rows.length > 0 && isDbNameRow(Object.keys(rows[0]))) {
          result = rowsToVendorCatalogueProducts(rows, serviceFeePercent);
        } else {
          result = rowsToProducts(rows, serviceFeePercent);
        }
        if (results.errors.length > 0) {
          results.errors.forEach((e) => result.errors.push(`Row ${e.row ?? '?'}: ${e.message}`));
        }
        resolve(result);
      },
      error: (err) => resolve({ products: [], errors: [err.message], skipped: 0 }),
    });
  });
}

export function parseSpreadsheet(file: File, serviceFeePercent: number): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx' || ext === 'xls' || ext === 'ods') return parseExcel(file, serviceFeePercent);
  return parseCsv(file, serviceFeePercent);
}

export { parseSpreadsheet as parseCsvToProducts };
