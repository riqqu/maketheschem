import { describe, expect, it } from 'vitest';
import { brushCells, createGrid, History, paintLine } from './grid';
import { brushRows } from './brush';
import { centerAxis, hasMirror, mirrored, mirrorsOf, mirrorStamps, snapAxis, withMirror, type Axes } from './mirror';
import { ellipseCells } from './shapes';

const at = (w: number, x: number, y: number) => y * w + x;
const off: Axes = { x: null, y: null };

describe('axes', () => {
  it('puts the centre axis in the middle of the art', () => {
    expect(centerAxis(10)).toBe(10);
    expect(mirrorsOf(at(10, 2, 3), 10, 8, { x: centerAxis(10), y: null })).toEqual([at(10, 7, 3)]);
  });

  it('snaps a position to the nearest half block, on the art', () => {
    expect(snapAxis(5, 10)).toBe(10);
    expect(snapAxis(3.5, 10)).toBe(7);
    expect(snapAxis(3.3, 10)).toBe(7);
    expect(snapAxis(3.2, 10)).toBe(6);
    expect(snapAxis(-4, 10)).toBe(0);
    expect(snapAxis(40, 10)).toBe(20);
  });

  it('knows whether anything is mirrored', () => {
    expect(hasMirror(off)).toBe(false);
    expect(hasMirror({ x: 4, y: null })).toBe(true);
    expect(hasMirror({ x: null, y: 0 })).toBe(true);
  });
});

describe('mirrorsOf', () => {
  it('reflects across a vertical, a horizontal or both axes', () => {
    const w = 8, h = 6;
    expect(mirrorsOf(at(w, 1, 1), w, h, { x: w, y: null })).toEqual([at(w, 6, 1)]);
    expect(mirrorsOf(at(w, 1, 1), w, h, { x: null, y: h })).toEqual([at(w, 1, 4)]);
    expect(mirrorsOf(at(w, 1, 1), w, h, { x: w, y: h }).sort((a, b) => a - b)).toEqual([at(w, 1, 4), at(w, 6, 1), at(w, 6, 4)].sort((a, b) => a - b));
  });

  it('has nothing to add without a mirror', () => {
    expect(mirrorsOf(5, 8, 6, off)).toEqual([]);
  });

  it('maps a column on an axis through its middle to itself', () => {
    // Axis 7 runs through the middle of column 3.
    expect(mirrorsOf(at(10, 3, 2), 10, 5, { x: 7, y: null })).toEqual([]);
    expect(mirrorsOf(at(10, 2, 2), 10, 5, { x: 7, y: null })).toEqual([at(10, 4, 2)]);
  });

  it('drops reflections that fall off the art', () => {
    // Axis 4 (two blocks in): column 0 would land at 3 - 0 = 3, column 5 at -2.
    expect(mirrorsOf(at(10, 0, 0), 10, 5, { x: 4, y: null })).toEqual([at(10, 3, 0)]);
    expect(mirrorsOf(at(10, 5, 0), 10, 5, { x: 4, y: null })).toEqual([]);
  });

  it('does not list a cell twice when only one axis moves it', () => {
    const list = mirrorsOf(at(7, 3, 1), 7, 6, { x: 7, y: 6 }); // x = 3 is on the axis, y = 1 is not
    expect(list).toEqual([at(7, 3, 4)]);
  });
});

describe('withMirror', () => {
  it('adds each mirror image once', () => {
    const cells = withMirror([at(6, 0, 0), at(6, 5, 0)], 6, 4, { x: 6, y: null });
    expect(cells.sort((a, b) => a - b)).toEqual([at(6, 0, 0), at(6, 5, 0)]);
    expect(withMirror([at(6, 1, 1)], 6, 4, { x: 6, y: 4 }).sort((a, b) => a - b)).toEqual([at(6, 1, 1), at(6, 4, 1), at(6, 1, 2), at(6, 4, 2)].sort((a, b) => a - b));
  });

  it('returns the cells as they are without a mirror', () => {
    expect(withMirror([3, 1], 6, 4, off)).toEqual([3, 1]);
  });

  it('makes shapes symmetric', () => {
    const g = createGrid(12, 12);
    const half = ellipseCells(g, { x: 0, y: 0 }, { x: 5, y: 8 }, true, 1);
    const both = new Set(withMirror(half, 12, 12, { x: 12, y: null }));
    for (const i of both) expect(both.has(at(12, 11 - (i % 12), Math.floor(i / 12)))).toBe(true);
  });
});

describe('mirrored painting', () => {
  it('paints a stroke and its reflection as one undo step', () => {
    const g = createGrid(8, 4, 0);
    const h = new History();
    h.begin();
    paintLine(g, mirrored(h, { x: 8, y: null }), 0, 1, 2, 1, 1, 5);
    expect(h.commit(g)).toBe(true);
    expect(Array.from(g.cells.subarray(8, 16))).toEqual([5, 5, 5, 0, 0, 5, 5, 5]);
    h.undo(g);
    expect(g.cells.every((v) => v === 0)).toBe(true);
    expect(h.canUndo).toBe(false);
  });

  it('paints in four places with both axes', () => {
    const g = createGrid(4, 4, 0);
    const h = new History();
    h.begin();
    mirrored(h, { x: 4, y: 4 }).set(g, at(4, 0, 0), 7);
    h.commit(g);
    expect([g.cells[at(4, 0, 0)], g.cells[at(4, 3, 0)], g.cells[at(4, 0, 3)], g.cells[at(4, 3, 3)]]).toEqual([7, 7, 7, 7]);
    expect(g.cells.filter((v) => v === 7)).toHaveLength(4);
  });

  it('is the history itself when nothing is mirrored', () => {
    const h = new History();
    expect(mirrored(h, off)).toBe(h);
  });

  it('reports a change when only the mirror image changes', () => {
    const g = createGrid(4, 1, 0);
    g.cells[0] = 3;
    const h = new History();
    h.begin();
    expect(mirrored(h, { x: 4, y: null }).set(g, 0, 3)).toBe(true); // cell 0 already 3, cell 3 is not
    expect(g.cells[3]).toBe(3);
  });
});

describe('mirrorStamps', () => {
  const sizes = [1, 2, 3, 4, 5, 6, 9];
  for (const shape of ['square', 'round'] as const) {
    it(`mirrors a ${shape} brush cell for cell, even or odd`, () => {
      const g = createGrid(30, 30);
      for (const size of sizes) {
        const axes: Axes = { x: 30, y: 21 };
        const x = 6, y = 8;
        const expected = new Set(withMirror(brushCells(g, x, y, size, shape), 30, 30, axes));
        const cells = new Set<number>();
        for (const s of [{ x, y, rows: brushRows(size, shape) }, ...mirrorStamps(x, y, brushRows(size, shape), axes)]) {
          for (const r of s.rows) for (let dx = r.dx0; dx <= r.dx1; dx++) cells.add(at(30, s.x + dx, s.y + r.dy));
        }
        expect(cells, `${shape} ${size}`).toEqual(expected);
      }
    });
  }

  it('keeps the rows top to bottom', () => {
    const rows = brushRows(4, 'round');
    for (const s of mirrorStamps(5, 5, rows, { x: 20, y: 20 })) {
      for (let i = 1; i < s.rows.length; i++) expect(s.rows[i].dy).toBe(s.rows[i - 1].dy + 1);
    }
  });

  it('has no images without a mirror', () => {
    expect(mirrorStamps(2, 2, brushRows(3), off)).toEqual([]);
  });
});
