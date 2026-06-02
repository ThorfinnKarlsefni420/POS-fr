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

  let startLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('ITEM_ID')) {
      startLine = i + 1;
      break;
    }
  }

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim() || line.startsWith('===')) continue;

    // Offsets detected from debug script:
    // ITEM_ID: 0
    // BAR_CODE: 8
    // DESCRIPTION: (starts after barcode)
    // UOM: 69
    // UOM_RATIO: 73
    // COST: 103
    // PRICE: 114
    // VAT_PERCENT: 120
    // OPENING_BAL: 132

    if (line.length < 130) continue;

    const itemId = line.substring(0, 8).trim();
    if (!itemId || isNaN(parseInt(itemId))) continue;

    const barcodeAndDesc = line.substring(8, 69).trim();
    // Usually barcode is the first few digits, but let's just keep it simple
    const barcode = barcodeAndDesc.substring(0, 25).trim();
    const description = barcodeAndDesc.substring(25).trim();
    
    const uom = line.substring(69, 73).trim();
    const ratio = parseInt(line.substring(73, 103).trim()) || 1;
    const cost = parseFloat(line.substring(103, 114).trim()) || 0;
    const price = parseFloat(line.substring(114, 120).trim()) || 0;
    const vatPercent = parseInt(line.substring(120, 132).trim()) || 0;
    const openingBal = parseInt(line.substring(132).trim()) || 0;

    rows.push({
      itemId,
      barcode,
      description,
      uom,
      ratio,
      cost,
      price,
      vatPercent,
      openingBal
    });
  }

  return rows;
}
