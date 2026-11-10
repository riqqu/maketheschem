import { describe, expect, it } from 'vitest';
import { createGrid } from './grid';
import { decodeGrid, encodeGrid, hashGrid } from './serialize';
import { AIR, type BlockInfo } from './types';

const block = (id: string): BlockInfo => ({
  id, state: `minecraft:${id}`, name: id, category: 'Test', gravity: false,
  top: { rgb: [0, 0, 0], tile: 0, texture: '' },
  side: { rgb: [0, 0, 0], tile: 0, texture: '' },
});

describe('encodeGrid / decodeGrid', () => {
  const blocks = [block('a'), block('b'), block('c')];
  const grid = createGrid(3, 2);
  grid.cells.set([2, 0, AIR, 2, 1, AIR]);

  it('stores block ids in order of first use', () => {
    const enc = encodeGrid(grid, blocks);
    expect(enc.ids).toEqual(['c', 'a', 'b']);
    expect([...enc.cells]).toEqual([0, 1, AIR, 0, 2, AIR]);
  });

  it('decodes against a different block order', () => {
    const enc = encodeGrid(grid, blocks);
    const reordered = new Map([['b', 0], ['c', 1], ['a', 2]]);
    const { grid: back, missing } = decodeGrid(enc, reordered);
    expect([...back.cells]).toEqual([1, 2, AIR, 1, 0, AIR]);
    expect(missing.size).toBe(0);
  });

  it('turns ids that no longer exist into air and reports them', () => {
    const enc = encodeGrid(grid, blocks);
    const { grid: back, missing } = decodeGrid(enc, new Map([['a', 0], ['b', 1]]));
    expect([...back.cells]).toEqual([AIR, 0, AIR, AIR, 1, AIR]);
    expect([...missing]).toEqual([['c', 2]]);
  });

  it('rejects corrupt records', () => {
    expect(() => decodeGrid({ width: 2, height: 2, ids: [], cells: new Uint16Array(3) }, new Map())).toThrow();
  });
});

describe('hashGrid', () => {
  it('changes with content and size', () => {
    const a = createGrid(2, 2, 1);
    const b = createGrid(2, 2, 1);
    expect(hashGrid(a)).toBe(hashGrid(b));
    b.cells[3] = 2;
    expect(hashGrid(a)).not.toBe(hashGrid(b));
    expect(hashGrid(createGrid(4, 1, 1))).not.toBe(hashGrid(a));
  });
});
