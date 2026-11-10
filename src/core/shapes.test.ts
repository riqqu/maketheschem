import { describe, expect, it } from 'vitest';
import { createGrid, History } from './grid';
import {
  clipRect, copyRegion, fillRect, lineCells, paintCells, rectBetween, rectCells, snapLine, snapSquare, stampClip,
  transformClip, transformRegion,
} from './shapes';
import { AIR } from './types';

const coords = (width: number, cells: number[]) =>
  cells.map((i) => [i % width, Math.floor(i / width)]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);

describe('rectBetween / clipRect', () => {
  it('normalises corners and clips to the grid', () => {
    expect(rectBetween({ x: 4, y: 1 }, { x: 1, y: 3 })).toEqual({ x: 1, y: 1, w: 4, h: 3 });
    expect(clipRect({ x: -2, y: 1, w: 4, h: 10 }, 5, 4)).toEqual({ x: 0, y: 1, w: 2, h: 3 });
    expect(clipRect({ x: 6, y: 0, w: 2, h: 2 }, 5, 4)).toBeNull();
  });
});

describe('snapping', () => {
  it('snaps lines to 0, 45 and 90 degrees', () => {
    const a = { x: 0, y: 0 };
    expect(snapLine(a, { x: 10, y: 2 })).toEqual({ x: 10, y: 0 });
    expect(snapLine(a, { x: 1, y: -9 })).toEqual({ x: 0, y: -9 });
    expect(snapLine(a, { x: 5, y: -4 })).toEqual({ x: 5, y: -5 });
  });
  it('makes squares', () => {
    expect(snapSquare({ x: 2, y: 2 }, { x: 5, y: 3 })).toEqual({ x: 5, y: 5 });
    expect(snapSquare({ x: 2, y: 2 }, { x: 0, y: 3 })).toEqual({ x: 0, y: 4 });
  });
});

describe('lineCells / rectCells', () => {
  const g = createGrid(6, 5);
  it('draws a gapless diagonal clipped to the grid', () => {
    expect(coords(6, lineCells(g, { x: 0, y: 0 }, { x: 3, y: 3 }, 1))).toEqual([[0, 0], [1, 1], [2, 2], [3, 3]]);
    expect(lineCells(g, { x: 4, y: 0 }, { x: 9, y: 0 }, 1)).toHaveLength(2);
    expect(lineCells(g, { x: 1, y: 1 }, { x: 3, y: 1 }, 2)).toHaveLength(8); // a 2x2 brush along 3 blocks: 4 x 2
  });
  it('draws outlines and filled rectangles', () => {
    expect(rectCells(g, { x: 1, y: 1 }, { x: 3, y: 3 }, false, 1)).toHaveLength(8);
    expect(rectCells(g, { x: 3, y: 3 }, { x: 1, y: 1 }, true, 1)).toHaveLength(9);
    expect(rectCells(g, { x: 0, y: 0 }, { x: 4, y: 4 }, false, 2)).toHaveLength(25 - 1);
    expect(rectCells(g, { x: 4, y: 3 }, { x: 8, y: 8 }, true, 1)).toHaveLength(4);
  });
});

describe('painting and regions', () => {
  it('paints cells as one undo step', () => {
    const g = createGrid(3, 1);
    const h = new History();
    expect(paintCells(g, h, [0, 2], 5)).toBe(true);
    expect([...g.cells]).toEqual([5, AIR, 5]);
    h.undo(g);
    expect([...g.cells]).toEqual([AIR, AIR, AIR]);
    expect(paintCells(g, h, [], 5)).toBe(false);
  });

  it('copies, stamps (air transparent or not) and fills regions', () => {
    const g = createGrid(4, 3);
    g.cells.set([1, 2, AIR, AIR, 3, AIR, AIR, AIR, AIR, AIR, AIR, 9]);
    const clip = copyRegion(g, { x: 0, y: 0, w: 2, h: 2 });
    expect([...clip.cells]).toEqual([1, 2, 3, AIR]);
    expect([...copyRegion(g, { x: 3, y: 2, w: 2, h: 1 }).cells]).toEqual([9, AIR]);

    const h = new History();
    h.begin();
    stampClip(g, h, clip, 2, 1);
    h.commit(g);
    expect([...g.cells]).toEqual([1, 2, AIR, AIR, 3, AIR, 1, 2, AIR, AIR, 3, 9]); // air did not erase the 9
    h.begin();
    stampClip(g, h, clip, 2, 1, false);
    h.commit(g);
    expect(g.cells[11]).toBe(AIR);
    h.begin();
    fillRect(g, h, { x: -1, y: -1, w: 2, h: 2 }, 7);
    h.commit(g);
    expect(g.cells[0]).toBe(7);
    expect(g.cells[1]).toBe(2);
  });
});

describe('transforms', () => {
  // 3 wide, 2 tall: [1 2 3 / 4 5 6]
  const clip = { width: 3, height: 2, cells: Uint16Array.from([1, 2, 3, 4, 5, 6]) };
  it.each([
    ['flipH', 3, [3, 2, 1, 6, 5, 4]],
    ['flipV', 3, [4, 5, 6, 1, 2, 3]],
    ['rot180', 3, [6, 5, 4, 3, 2, 1]],
    ['rotCW', 2, [4, 1, 5, 2, 6, 3]],
    ['rotCCW', 2, [3, 6, 2, 5, 1, 4]],
  ] as const)('%s', (op, width, cells) => {
    const t = transformClip(clip, op);
    expect(t.width).toBe(width);
    expect([...t.cells]).toEqual(cells);
  });

  it('transforms a region in place as one undo step', () => {
    const g = createGrid(3, 2);
    g.cells.set([1, 2, 3, 4, 5, 6]);
    const h = new History();
    expect(transformRegion(g, h, { x: 0, y: 0, w: 3, h: 2 }, 'flipH')).toBe(true);
    expect([...g.cells]).toEqual([3, 2, 1, 6, 5, 4]);
    expect(transformRegion(g, h, { x: 1, y: 0, w: 2, h: 1 }, 'flipH')).toBe(true);
    expect([...g.cells]).toEqual([3, 1, 2, 6, 5, 4]);
    h.undo(g);
    h.undo(g);
    expect([...g.cells]).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
