import { readFileSync } from 'fs';
import { join } from 'path';

const content = readFileSync('../../lungalunga.txt', 'utf-8');
const lines = content.split('\n');

for (let i = 0; i < Math.min(lines.length, 10); i++) {
  const line = lines[i];
  console.log(`Line ${i} (len ${line.length}): [${line}]`);
  if (line.includes('ITEM_ID')) {
     console.log('Header offsets:');
     console.log('ITEM_ID:', line.indexOf('ITEM_ID'));
     console.log('BAR_CODE:', line.indexOf('BAR_CODE'));
     console.log('DESCRIPTION:', line.indexOf('DESCRIPTION'));
     console.log('UOM:', line.indexOf('UOM '));
     console.log('UOM_RATIO:', line.indexOf('UOM_RATIO'));
     console.log('COST:', line.indexOf('COST'));
     console.log('PRICE:', line.indexOf('PRICE'));
     console.log('VAT_PERCENT:', line.indexOf('VAT_PERCENT'));
     console.log('OPENING_BAL:', line.indexOf('OPENING_BAL'));
  }
}
