import { parseLungaLunga } from '../src/scripts/parse-lungalunga.ts';
import { writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import test from 'node:test';
import assert from 'node:assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test('LungaLunga Parser Regression Test', async (t) => {
  const testFilePath = join(__dirname, 'test-lungalunga.txt');

  await t.test('should parse lines with empty opening balance (trailing spaces)', () => {
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
      assert.ok(ctnRow, 'CTN row for 1421 should be found');
      assert.strictEqual(ctnRow?.ratio, 48);
      assert.strictEqual(ctnRow?.openingBal, 0);

      const pcsRow = rows.find(r => r.uom === 'PCS' && r.itemId === '1421');
      assert.ok(pcsRow, 'PCS row for 1421 should be found');
      assert.strictEqual(pcsRow?.ratio, 1);
      assert.strictEqual(pcsRow?.openingBal, 0);

      const aaranRow = rows.find(r => r.itemId === '120');
      assert.ok(aaranRow, 'AARAN row should be found');
      assert.strictEqual(aaranRow?.ratio, 6);
      assert.strictEqual(aaranRow?.openingBal, 0);
    } finally {
      unlinkSync(testFilePath);
    }
  });

  await t.test('should capture multiple tiers for the same itemId', () => {
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
      const uoms = itemRows.map(r => r.uom).sort();
      assert.deepStrictEqual(uoms, ['CTN', 'OUT', 'PCS']);
    } finally {
      unlinkSync(testFilePath);
    }
  });
});
