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
    // ^\s*(\d+)\s+(\d+)\s+[\d.]+\s+(.+?)\s+([A-Z]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\d+)$
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+[\d.]+\s+(.+?)\s+([A-Z]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\d+)$/);
    if (!match) continue;

    const [, itemId, barcode, description, uom, ratioStr, costStr, priceStr, vatStr, balStr] = match;

    rows.push({
      itemId,
      barcode,
      description: description.trim(),
      uom: uom.trim(),
      ratio: parseFloat(ratioStr),
      cost: parseFloat(costStr),
      price: parseFloat(priceStr),
      vatPercent: parseInt(vatStr),
      openingBal: parseInt(balStr)
    });
  }

  return rows;
}
