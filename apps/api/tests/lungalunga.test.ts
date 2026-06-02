import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { parseLungaLunga } from '../src/scripts/parse-lungalunga';

describe('LungaLunga Parser', () => {
  it('should parse lungalunga.txt correctly', () => {
    const filePath = join(process.cwd(), '../../lungalunga.txt');
    const rows = parseLungaLunga(filePath);
    
    assert.ok(rows.length > 0, 'Should have parsed some rows');
    
    // Check specific item 1421 (from my manual inspection)
    const item1421Rows = rows.filter(r => r.itemId === '1421');
    assert.equal(item1421Rows.length, 2, 'Item 1421 should have 2 rows (CTN and PCS)');
    
    const ctnRow = item1421Rows.find(r => r.uom === 'CTN');
    assert.ok(ctnRow, 'CTN row should exist');
    assert.equal(ctnRow?.ratio, 48);
    // Based on debug output: price is at 114-120. "3200" is 4 chars.
    // In debug output, line 4: 114 to 120 is "  3200"
    assert.equal(ctnRow?.price, 3200);
    
    const pcsRow = item1421Rows.find(r => r.uom === 'PCS');
    assert.ok(pcsRow, 'PCS row should exist');
    assert.equal(pcsRow?.ratio, 1);
    assert.equal(pcsRow?.price, 50);
  });

  it('should group rows by itemId correctly', () => {
    const filePath = join(process.cwd(), '../../lungalunga.txt');
    const rows = parseLungaLunga(filePath);
    
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!groups.has(row.itemId)) groups.set(row.itemId, []);
      groups.get(row.itemId)!.push(row);
    }
    
    const item1421 = groups.get('1421');
    assert.ok(item1421);
    assert.equal(item1421?.length, 2);
    
    // Sort by ratio to identify base unit
    const sorted = [...item1421!].sort((a, b) => a.ratio - b.ratio);
    assert.equal(sorted[0].uom, 'PCS');
    assert.equal(sorted[0].ratio, 1);
    assert.equal(sorted[1].uom, 'CTN');
    assert.equal(sorted[1].ratio, 48);
  });
});
