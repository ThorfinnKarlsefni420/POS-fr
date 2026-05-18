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

function detectColumns(headers: string[]) {
  const lower = headers.map(h => h.toLowerCase().trim());

  // Exact match first, then contains — returns the original header string
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

  // Category: prefer header without "sub"
  const categoryCol =
    headers.find((_, i) => lower[i].includes('category') && !lower[i].includes('sub')) ??
    headers.find((_, i) => lower[i].includes('category'));

  const subCategoryCol = headers.find((_, i) =>
    lower[i].includes('sub') && lower[i].includes('cat')
  );

  // Cost/buying price: exclude nomadBite / selling / service / fee columns
  const priceCol = headers.find((_, i) => {
    const h = lower[i];
    return (h.includes('buying') || h.includes('cost') || h.includes('amount') ||
            (h.includes('price') && !h.includes('selling')))
      && !h.includes('nomad') && !h.includes('service') && !h.includes('fee');
  });

  // Selling price: used as nomadBitePrice when present
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

  // Packaging tiers
  const l1Name = find('l1 pack name', 'l1 name', 'l1packname');
  const l1Qty = find('l1 qty in base', 'l1 quantity', 'l1qty');
  const l1Cost = find('l1 cost', 'l1 buying');
  const l1Sell = find('l1 sell', 'l1 price');
  const l1Barcode = find('l1 barcode', 'l1 bar code');

  const l2Name = find('l2 pack name', 'l2 name', 'l2packname');
  const l2QtyInL1 = find('l2 qty in l1', 'l2 quantity in l1', 'l2qtyl1');
  const l2Cost = find('l2 cost', 'l2 buying');
  const l2Sell = find('l2 sell', 'l2 price');
  const l2Barcode = find('l2 barcode', 'l2 bar code');

  return {
    nameCol, categoryCol, subCategoryCol, priceCol, sellingPriceCol,
    skuCol, unitCol, imageCol, vatCol, stockCol,
    l1Name, l1Qty, l1Cost, l1Sell, l1Barcode,
    l2Name, l2QtyInL1, l2Cost, l2Sell, l2Barcode,
  };
}

function extractMultiplier(name: string): number | undefined {
  // Matches "8*30g", "6 x 500ml", "12 * 1L", "24/case", "Pack of 6"
  const patterns = [
    /(\d+)\s*[*xX]\s*\d+/,  // 8*30g
    /(\d+)\s*pcs/i,          // 50 pcs
    /pack\s*of\s*(\d+)/i,    // Pack of 6
    /case\s*of\s*(\d+)/i,    // Case of 12
    /(\d+)\s*units/i,        // 24 units
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

    if (!name) {
      skipped++;
      return;
    }

    const costPrice = parsePrice(cols.priceCol ? row[cols.priceCol] : undefined);
    // Vendor's selling price: explicit column, or auto-calculated from buying price + service fee
    const rawSellingPrice = parsePrice(cols.sellingPriceCol ? row[cols.sellingPriceCol] : undefined);
    const sellingPrice = rawSellingPrice > 0
      ? rawSellingPrice
      : costPrice > 0
        ? Number((costPrice * (1 + serviceFeePercent / 100)).toFixed(2))
        : 0;
    // NomadBite price is set by superadmin markup, not via CSV import
    const nomadBitePrice = 0;

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

    // Parse packaging tiers
    const packagingTiers: any[] = [];
    let l1NameVal = cols.l1Name ? row[cols.l1Name]?.toString().trim() : undefined;
    let l1QtyVal = parsePrice(cols.l1Qty ? row[cols.l1Qty] : undefined);

    // Heuristic: If L1 qty is missing, try to extract from name
    if (!l1QtyVal) {
      const guessed = extractMultiplier(name);
      if (guessed && guessed > 1) {
        l1QtyVal = guessed;
        if (!l1NameVal) l1NameVal = 'Outer';
      }
    }

    if (l1NameVal && l1QtyVal > 0) {
      // If we have tiers, ensure we also have the base unit (level 0)
      const unit = cols.unitCol ? row[cols.unitCol]?.toString().trim() ?? 'Piece' : 'Piece';
      packagingTiers.push({
        id: `import-tier-l0-${sku}-${i}`,
        name: unit,
        level: 0,
        quantityInBase: 1,
        costPrice: costPrice,
        sellingPriceOverride: sellingPrice,
        barcode: rawSku || null,
        isBaseUnit: true,
      });

      packagingTiers.push({
        id: `import-tier-l1-${sku}-${i}`,
        name: l1NameVal,
        level: 1,
        quantityInBase: l1QtyVal,
        costPrice: parsePrice(cols.l1Cost ? row[cols.l1Cost] : undefined) || (costPrice * l1QtyVal),
        sellingPriceOverride: parsePrice(cols.l1Sell ? row[cols.l1Sell] : undefined) || null,
        barcode: cols.l1Barcode ? row[cols.l1Barcode]?.toString().trim() : null,
        isBaseUnit: false,
      });
    }

    const l2NameVal = cols.l2Name ? row[cols.l2Name]?.toString().trim() : undefined;
    const l2QtyInL1Val = parsePrice(cols.l2QtyInL1 ? row[cols.l2QtyInL1] : undefined);

    if (l2NameVal && l2QtyInL1Val > 0) {
      const l1Qty = packagingTiers.find(t => t.level === 1)?.quantityInBase || 1;
      const qtyInBase = l2QtyInL1Val * l1Qty;
      packagingTiers.push({
        id: `import-tier-l2-${sku}-${i}`,
        name: l2NameVal,
        level: 2,
        quantityInBase: qtyInBase,
        costPrice: parsePrice(cols.l2Cost ? row[cols.l2Cost] : undefined) || (costPrice * qtyInBase),
        sellingPriceOverride: parsePrice(cols.l2Sell ? row[cols.l2Sell] : undefined) || null,
        barcode: cols.l2Barcode ? row[cols.l2Barcode]?.toString().trim() : null,
        isBaseUnit: false,
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
      costPrice,
      sellingPrice,
      nomadBitePrice,
      taxRate,
      isFractional: false,
      currentStock,
      imageUrl: fileImage || DEFAULT_PRODUCT_IMAGE,
      packagingTiers: packagingTiers.length > 0 ? packagingTiers : undefined,
    });
  });

  return { products, errors, skipped };
}

function parseExcel(file: File, serviceFeePercent: number): Promise<ParseResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: false });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: '', raw: false });
        resolve(rowsToProducts(rows, serviceFeePercent));
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
        const result = rowsToProducts(results.data, serviceFeePercent);
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
  if (ext === 'xlsx' || ext === 'xls' || ext === 'ods') {
    return parseExcel(file, serviceFeePercent);
  }
  return parseCsv(file, serviceFeePercent);
}

export { parseSpreadsheet as parseCsvToProducts };
