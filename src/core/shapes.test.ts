import { describe, expect, it } from 'vitest';
import { createGrid, History } from './grid';
import {
  clipRect, copyRegion, ellipseCells, fillRect, intersectRect, lineCells, paintCells, rectBetween, rectCells, rectCorners, snapLine, snapSquare,
  stampClip, transformClip, transformRegion,
} from './shapes';
import { brushCells } from './grid';
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

describe('ellipses', () => {
  const big = createGrid(40, 40);
  const has = (cells: number[], x: number, y: number) => cells.includes(y * 40 + x);
  const ellipse = (w: number, h: number, filled = true, thickness = 1) => ellipseCells(big, { x: 0, y: 0 }, { x: w - 1, y: h - 1 }, filled, thickness);

  it('makes a circle of size n the same as the round brush of size n', () => {
    for (let n = 1; n <= 30; n++) {
      // Centred so the brush's first cell is at 0, like the brush preview does.
      const mid = Math.floor((n - 1) / 2);
      const stamp = brushCells(big, mid, mid, n, 'round').sort((a, b) => a - b);
      expect(ellipse(n, n).sort((a, b) => a - b), `size ${n}`).toEqual(stamp);
    }
  });

  it('draws small circles as pixel art expects', () => {
    expect(ellipse(3, 3)).toHaveLength(5); // a plus
    expect(ellipse(2, 2)).toHaveLength(4);
    expect(ellipse(1, 1)).toHaveLength(1);
    expect(ellipse(5, 5)).toHaveLength(21); // 5 x 5 with its corners trimmed
  });

  it('is symmetric on both axes', () => {
    for (const [w, h] of [[10, 10], [9, 14], [21, 6], [7, 7], [16, 3]]) {
      const cells = ellipse(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          expect(has(cells, x, y), `${w}x${h} (${x},${y})`).toBe(has(cells, w - 1 - x, y));
          expect(has(cells, x, y), `${w}x${h} (${x},${y})`).toBe(has(cells, x, h - 1 - y));
        }
      }
    }
  });

  it('touches all four sides of its box and stays inside it', () => {
    const cells = ellipse(21, 9);
    const xs = cells.map((i) => i % 40), ys = cells.map((i) => Math.floor(i / 40));
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([0, 20, 0, 8]);
  });

  it('is longer than it is tall for a wide box', () => {
    const cells = ellipse(21, 9);
    expect(has(cells, 0, 4)).toBe(true); // the middle of the left side
    expect(has(cells, 10, 0)).toBe(true); // the middle of the top
    expect(has(cells, 0, 0)).toBe(false); // the corner
  });

  it('is an outline `thickness` wide, inside the filled ellipse', () => {
    const filled = new Set(ellipse(16, 16));
    const outline = ellipse(16, 16, false);
    expect(outline.length).toBeLessThan(filled.size);
    expect(outline.every((i) => filled.has(i))).toBe(true);
    expect(has(outline, 8, 8)).toBe(false); // the middle is empty
    expect(has(outline, 0, 8)).toBe(true);
    const thick = ellipse(16, 16, false, 3);
    expect(thick.length).toBeGreaterThan(outline.length);
    expect(has(thick, 2, 8)).toBe(true);
    expect(has(thick, 4, 8)).toBe(false);
  });

  it('fills everything when the outline is thicker than the ellipse', () => {
    expect(ellipse(6, 6, false, 3)).toHaveLength(ellipse(6, 6).length);
    expect(ellipse(8, 3, false, 2)).toHaveLength(ellipse(8, 3).length);
  });

  it('works from any pair of corners and clips at the grid edge', () => {
    const g = createGrid(10, 10);
    const forward = ellipseCells(g, { x: 1, y: 1 }, { x: 6, y: 4 }, true, 1).sort((a, b) => a - b);
    expect(ellipseCells(g, { x: 6, y: 4 }, { x: 1, y: 1 }, true, 1).sort((a, b) => a - b)).toEqual(forward);
    expect(ellipseCells(g, { x: 6, y: 1 }, { x: 1, y: 4 }, true, 1).sort((a, b) => a - b)).toEqual(forward);
    const cut = ellipseCells(g, { x: -3, y: -3 }, { x: 4, y: 4 }, true, 1);
    expect(cut.length).toBeGreaterThan(0);
    expect(cut.every((i) => i >= 0 && i < 100)).toBe(true);
    expect(ellipseCells(g, { x: 20, y: 20 }, { x: 30, y: 30 }, true, 1)).toEqual([]);
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
