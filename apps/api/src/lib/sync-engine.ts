import { PrismaClient } from '@prisma/client';

export type InternalField =
  | 'sku'
  | 'name'
  | 'currentStock'
  | 'costPrice'
  | 'sellingPrice'
  | 'category'
  | 'unit';

export interface FieldMapping {
  externalField: string;
  internalField: InternalField;
  stockMode?: 'SET' | 'ADD'; // only for currentStock
}

export interface SyncResult {
  rowsProcessed: number;
  rowsSucceeded: number;
  rowsFailed: number;
  errors: string[];
}

const NUMERIC_FIELDS: InternalField[] = ['currentStock', 'costPrice', 'sellingPrice'];

export async function runSync(
  prisma: PrismaClient,
  storeId: string,
  mappings: FieldMapping[],
  rows: Record<string, unknown>[]
): Promise<SyncResult> {
  const result: SyncResult = { rowsProcessed: rows.length, rowsSucceeded: 0, rowsFailed: 0, errors: [] };
  if (rows.length === 0) return result;

  const skuMapping = mappings.find((m) => m.internalField === 'sku');
  if (!skuMapping) {
    result.rowsFailed = rows.length;
    result.errors.push('No SKU mapping defined — cannot match items.');
    return result;
  }

  for (const row of rows) {
    const rawSku = row[skuMapping.externalField];
    const sku = typeof rawSku === 'string' ? rawSku.trim() : String(rawSku ?? '').trim();
    if (!sku) {
      result.rowsFailed++;
      result.errors.push(`Row skipped: empty SKU field "${skuMapping.externalField}"`);
      continue;
    }

    try {
      const item = await prisma.item.findUnique({ where: { storeId_sku: { storeId, sku } } });
      if (!item) {
        result.rowsFailed++;
        result.errors.push(`SKU not found: ${sku}`);
        continue;
      }

      const scalarUpdates: Record<string, unknown> = {};

      for (const m of mappings) {
        if (m.internalField === 'sku') continue;
        const rawVal = row[m.externalField];
        if (rawVal === undefined || rawVal === null || rawVal === '') continue;

        if (NUMERIC_FIELDS.includes(m.internalField)) {
          const num = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal).replace(/[^0-9.\-]/g, ''));
          if (isNaN(num)) continue;
          scalarUpdates[m.internalField] = num;
        } else {
          scalarUpdates[m.internalField] = String(rawVal).trim();
        }
      }

      // Handle currentStock specially — support ADD mode
      const stockMapping = mappings.find((m) => m.internalField === 'currentStock');
      if (stockMapping && scalarUpdates['currentStock'] !== undefined) {
        const num = scalarUpdates['currentStock'] as number;
        if (stockMapping.stockMode === 'ADD') {
          await prisma.item.update({
            where: { id: item.id },
            data: {
              currentStock: { increment: num },
              ...Object.fromEntries(Object.entries(scalarUpdates).filter(([k]) => k !== 'currentStock')),
            },
          });
        } else {
          await prisma.item.update({ where: { id: item.id }, data: scalarUpdates });
        }
      } else if (Object.keys(scalarUpdates).length > 0) {
        await prisma.item.update({ where: { id: item.id }, data: scalarUpdates });
      }

      result.rowsSucceeded++;
    } catch (e) {
      result.rowsFailed++;
      result.errors.push(`Error on SKU ${sku}: ${(e as Error).message}`);
    }
  }

  return result;
}

/** Parse a CSV string into an array of row objects using the first row as headers. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

/** Navigate a dot-path into a nested object, e.g. "data.items" */
export function resolvePath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && !Array.isArray(acc)) return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}
