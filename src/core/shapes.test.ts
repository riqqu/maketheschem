import { describe, expect, it } from 'vitest';
import { createGrid, History } from './grid';
import {
  clipRect, copyRegion, fillRect, intersectRect, lineCells, paintCells, rectBetween, rectCells, rectCorners, snapLine, snapSquare,
  stampClip, transformClip, transformRegion,
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

describe('intersectRect', () => {
  it('gives the shared area', () => {
    expect(intersectRect({ x: 0, y: 0, w: 10, h: 10 }, { x: 4, y: 6, w: 10, h: 2 })).toEqual({ x: 4, y: 6, w: 6, h: 2 });
    expect(intersectRect({ x: 2, y: 2, w: 3, h: 3 }, { x: 0, y: 0, w: 20, h: 20 })).toEqual({ x: 2, y: 2, w: 3, h: 3 });
  });
  it('is null when they only touch or are apart', () => {
    expect(intersectRect({ x: 0, y: 0, w: 4, h: 4 }, { x: 4, y: 0, w: 4, h: 4 })).toBeNull();
    expect(intersectRect({ x: 0, y: 0, w: 4, h: 4 }, { x: 9, y: 9, w: 1, h: 1 })).toBeNull();
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

  it('draws lines with a round brush', () => {
    const big = createGrid(8, 8);
    // A plus-shaped brush along 3 blocks: rows of 3, 5 and 3.
    expect(coords(8, lineCells(big, { x: 2, y: 2 }, { x: 4, y: 2 }, 3, 'round'))).toEqual([
      [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [2, 3], [3, 3], [4, 3],
    ]);
    expect(lineCells(g, { x: 10, y: 10 }, { x: 14, y: 10 }, 1)).toEqual([]);
  });

  it('keeps long thick lines inside the grid and gapless', () => {
    const big = createGrid(40, 30);
    const cells = lineCells(big, { x: -20, y: -5 }, { x: 60, y: 40 }, 9);
    expect(cells.length).toBeGreaterThan(300);
    expect(new Set(cells).size).toBe(cells.length);
    expect(cells.every((i) => i >= 0 && i < big.cells.length)).toBe(true);
  });
});

describe('rectCorners', () => {
  it('drags from a corner or from the middle block', () => {
    expect(rectCorners({ x: 5, y: 5 }, { x: 7, y: 8 }, false)).toEqual([{ x: 5, y: 5 }, { x: 7, y: 8 }]);
    expect(rectCorners({ x: 5, y: 5 }, { x: 7, y: 8 }, true)).toEqual([{ x: 3, y: 2 }, { x: 7, y: 8 }]);
    const big = createGrid(12, 12);
    const [p, q] = rectCorners({ x: 5, y: 5 }, { x: 7, y: 8 }, true);
    expect(rectCells(big, p, q, true, 1)).toHaveLength(5 * 7);
  });
});

describe('rounded rectangles', () => {
  const big = createGrid(30, 30);
  const a = { x: 0, y: 0 };
  const b = { x: 5, y: 5 };
  const has = (cells: number[], x: number, y: number) => cells.includes(y * 30 + x);

  it('step 1 trims only the corner blocks', () => {
    const cells = rectCells(big, a, b, true, 1, 1);
    expect(cells).toHaveLength(36 - 4);
    for (const [x, y] of [[0, 0], [5, 0], [0, 5], [5, 5]]) expect(has(cells, x, y)).toBe(false);
    expect(has(cells, 1, 0)).toBe(true);
    expect(has(cells, 0, 1)).toBe(true);
  });

  it('step 2 makes a 2-1 staircase', () => {
    const cells = rectCells(big, a, { x: 11, y: 11 }, true, 1, 2);
    expect(cells).toHaveLength(144 - 12);
    for (const [x, y] of [[0, 0], [1, 0], [0, 1]]) expect(has(cells, x, y)).toBe(false);
    expect(has(cells, 2, 0)).toBe(true);
    expect(has(cells, 1, 1)).toBe(true);
  });

  it('never rounds past a half-circle on a small rectangle', () => {
    expect(rectCells(big, a, b, true, 1, 2)).toHaveLength(36 - 4);
  });

  it('step 0 is a plain rectangle and every step above it cuts more', () => {
    const size = (step: number) => rectCells(big, { x: 0, y: 0 }, { x: 19, y: 19 }, true, 1, step).length;
    expect(size(0)).toBe(400);
    for (let step = 1; step <= 7; step++) expect(size(step)).toBeLessThan(size(step - 1));
  });

  it('turns a square into a disc when the step is large', () => {
    const disc = rectCells(big, { x: 0, y: 0 }, { x: 9, y: 9 }, true, 1, 100);
    expect(has(disc, 0, 0)).toBe(false);
    expect(has(disc, 4, 4)).toBe(true);
    expect(has(disc, 4, 0)).toBe(true); // it still touches all four sides
    expect(has(disc, 0, 4)).toBe(true);
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        expect(has(disc, x, y)).toBe(has(disc, 9 - x, y));
        expect(has(disc, x, y)).toBe(has(disc, x, 9 - y));
      }
    }
  });

  it('keeps the outline thickness around the curve', () => {
    const outline = rectCells(big, a, b, false, 1, 1);
    expect(outline).toHaveLength(16); // the ring of a 6 x 6 minus its 4 corners
    expect(has(outline, 2, 2)).toBe(false);
    expect(has(outline, 1, 1)).toBe(false);
    expect(has(outline, 2, 0)).toBe(true);
    expect(has(outline, 0, 0)).toBe(false);
  });

  it('rounds the inside of a thick outline too', () => {
    const square = rectCells(big, { x: 0, y: 0 }, { x: 19, y: 19 }, false, 3, 0);
    const round = rectCells(big, { x: 0, y: 0 }, { x: 19, y: 19 }, false, 3, 4);
    expect(has(square, 0, 0)).toBe(true);
    expect(has(square, 3, 3)).toBe(false); // inside the square stroke
    expect(has(round, 0, 0)).toBe(false); // the outer corner is cut away
    expect(has(round, 1, 1)).toBe(false);
    expect(has(round, 2, 2)).toBe(true);
    expect(has(round, 3, 3)).toBe(true); // the inner corner is rounded too, so the stroke bends round it
    expect(has(round, 10, 0)).toBe(true);
    expect(has(round, 10, 10)).toBe(false);
  });

  it('fills everything when the outline is thicker than the rectangle', () => {
    expect(rectCells(big, a, b, false, 5)).toHaveLength(36);
    expect(rectCells(big, a, b, false, 3)).toHaveLength(36);
    expect(rectCells(big, a, b, false, 2)).toHaveLength(36 - 4);
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
