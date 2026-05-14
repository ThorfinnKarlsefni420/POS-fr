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

  return { nameCol, categoryCol, subCategoryCol, priceCol, sellingPriceCol, skuCol, unitCol, imageCol, vatCol, stockCol };
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
