import { readFileSync } from 'fs';

interface LungaRow {
  itemId: string;
  barcode: string;
  description: string;
  uom: string;
  ratio: number;
  cost: number;
  price: number;
  vatPercent: number;
  openingBal: number;
}

const BULK_UOMS = new Set(['CTN', 'OUT', 'BAL', 'DOZ', 'JRC', 'BAG', 'TM', 'HL', 'HLT']);

/**
 * Infers the carton/pack ratio from a product name encoding a multiplier.
 *
 * Handles two formats:
 *   Format 1 – count before *:  "INDOMIE 20*120GMS" → 20
 *                               "DAIMA 18*500ML"    → 18
 *                               "WEETABIX 50*37G"   → 50
 *                               "FANAANA SOAP 12*800" → 12 (no unit but space before count)
 *
 *   Format 2 – size embedded before *: "LISHA MILK500*12" → 12
 *                                      (alpha immediately precedes first number)
 *
 *   Suffix format: "TOP CHIPS*24pcs" → 24  /  "PBISCO*24PCS" → 24
 *                  "CLUB GLUCOSE 72PK*4" → 4
 *
 * Returns null when no ratio can be confidently inferred.
 */
export function inferRatioFromName(name: string): number | null {
  const n = name.toUpperCase().trim();

  // Format 1a: N * size_with_unit  (e.g. 20*120GMS, 18*500ML, 50*37G, KAYSALT30*200GR)
  // When a measurement unit follows N2, N1 is always the count — even if embedded in the word
  // (e.g. "KAYSALT30*200GR": "30" is directly after "KAYSALT" but is still the pack count)
  const UNIT = '(?:G|GM|GMS|GRM|GR|GRMS|KG|MG|ML|CL|L|LTR|LITRE|LITER)';
  const fmt1 = n.match(new RegExp(`(\\d+)\\s*\\*\\s*[\\d.]+\\s*${UNIT}\\b`, 'i'));
  if (fmt1) {
    const r = parseInt(fmt1[1], 10);
    if (r > 1 && r <= 1000) return r;
  }

  // Format 1b / 2: N1*N2 with no measurement unit after either number
  // If alpha immediately precedes N1 (e.g. "MILK500*12") → N1 is size → N2 is count
  // If space/punct precedes N1 (e.g. "SOAP 12*800", "APC*125*100TAPLETS") → N1 is count
  // No \b after N2: unit descriptors like "100TAPLETS" would break word-boundary match
  const fmtAny = n.match(/(\d+)\s*\*\s*(\d+)/);
  if (fmtAny) {
    const idx = fmtAny.index!;
    const prevChar = idx > 0 ? n[idx - 1] : '';
    const n1 = parseInt(fmtAny[1], 10);
    const n2 = parseInt(fmtAny[2], 10);
    const n1EmbeddedInWord = /[A-Z]/.test(prevChar); // e.g. "MILK500"
    const ratio = n1EmbeddedInWord ? n2 : n1;        // embedded → use n2; standalone → use n1
    if (ratio > 1 && ratio <= 1000) return ratio;
  }

  // Suffix format: *Npcs / *Npk / *N at end of string (e.g. "TOP CHIPS*24pcs", "*4" at end)
  const fmt3 = n.match(/\*\s*(\d+)\s*(?:PCS?|PKT?S?|PK|PACK|UNITS?|BAGS?)?\s*$/);
  if (fmt3) {
    const r = parseInt(fmt3[1], 10);
    if (r > 1 && r <= 1000) return r;
  }

  return null;
}

export function parseLungaLunga(filePath: string): LungaRow[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const rows: LungaRow[] = [];

  for (const line of lines) {
    if (!line || !line.trim() || line.startsWith('===')) continue;
    
    // The structure:
    // [ID] [BARCODE] [???] [DESC...] [UOM] [RATIO] [COST] [PRICE] [VAT] [BAL]
    // Let's use a regex to capture it.
    // Based on L532: "1455  1556455     1455.0  CERELAC 400G 7MONTH PCS  1  511.666667  600  0  0"
    
    // Regex breakdown:
    // ^\s*(\d+)\s+(\d+)\s+[\d.]+\s+(.+?)\s+([A-Z]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s*(.*)$
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+[\d.]+\s+(.+?)\s+([A-Z]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s*(.*)$/);
    if (!match) continue;

    const [, itemId, barcode, description, uom, ratioStr, costStr, priceStr, vatStr, balStr] = match;

    const parsedUom = uom.trim();
    const parsedRatio = parseFloat(ratioStr);

    rows.push({
      itemId,
      barcode,
      description: description.trim(),
      uom: BULK_UOMS.has(parsedUom) && parsedRatio === 1.0 ? 'PCS' : parsedUom,
      ratio: parsedRatio,
      cost: parseFloat(costStr),
      price: parseFloat(priceStr),
      vatPercent: parseInt(vatStr),
      openingBal: parseInt(balStr) || 0
    });
  }

  return rows;
}
