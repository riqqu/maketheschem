import { describe, expect, it } from 'vitest';
import {
  activeBuilt, CHUNK, DONE, EMPTY, isDone, makeSteps, nextOpen, originCell, PARTIAL, progress, stepCounts, stepName, stepStates, TODO, tickRect,
} from './build';
import { createGrid } from './grid';
import { AIR } from './types';

const A = 1, B = 2;

describe('makeSteps', () => {
  it('numbers the rows of a wall from the bottom up', () => {
    const s = makeSteps('rows', 5, 3, 'wall');
    expect(s.count).toBe(3);
    expect(s.rect(0)).toEqual({ x: 0, y: 2, w: 5, h: 1 });
    expect(s.rect(2)).toEqual({ x: 0, y: 0, w: 5, h: 1 });
    expect(s.at(4, 2)).toBe(0);
    expect(s.at(0, 0)).toBe(2);
  });

  it('numbers the rows of a floor from the north edge down', () => {
    const s = makeSteps('rows', 5, 3, 'floor');
    expect(s.rect(0)).toEqual({ x: 0, y: 0, w: 5, h: 1 });
    expect(s.rect(2)).toEqual({ x: 0, y: 2, w: 5, h: 1 });
    expect(s.at(1, 2)).toBe(2);
  });

  it('cuts a wall into sections from the bottom-left, the partial ones at the top and right', () => {
    const s = makeSteps('sections', 40, 20, 'wall');
    expect(s.count).toBe(3 * 2);
    expect(s.rect(0)).toEqual({ x: 0, y: 4, w: CHUNK, h: CHUNK });
    expect(s.rect(2)).toEqual({ x: 32, y: 4, w: 8, h: CHUNK });
    expect(s.rect(3)).toEqual({ x: 0, y: 0, w: CHUNK, h: 4 });
    expect(s.rect(5)).toEqual({ x: 32, y: 0, w: 8, h: 4 });
  });

  it('cuts a floor into sections from the north-west corner', () => {
    const s = makeSteps('sections', 40, 20, 'floor');
    expect(s.rect(0)).toEqual({ x: 0, y: 0, w: CHUNK, h: CHUNK });
    expect(s.rect(3)).toEqual({ x: 0, y: 16, w: CHUNK, h: 4 });
  });

  for (const orientation of ['wall', 'floor'] as const) {
    for (const kind of ['rows', 'sections'] as const) {
      it(`covers every cell of a ${orientation} once, by ${kind}, and finds the step of a cell`, () => {
        const w = 37, h = 21;
        const s = makeSteps(kind, w, h, orientation);
        const seen = new Int32Array(w * h);
        for (let i = 0; i < s.count; i++) {
          const r = s.rect(i);
          for (let y = r.y; y < r.y + r.h; y++) {
            for (let x = r.x; x < r.x + r.w; x++) {
              seen[y * w + x]++;
              expect(s.at(x, y)).toBe(i);
            }
          }
        }
        expect(seen.every((n) => n === 1)).toBe(true);
      });
    }
  }

  it('starts building a step at the corner next to the origin edge', () => {
    expect(originCell({ x: 16, y: 4, w: 16, h: 16 }, 'wall')).toEqual({ x: 16, y: 19 });
    expect(originCell({ x: 16, y: 4, w: 16, h: 16 }, 'floor')).toEqual({ x: 16, y: 4 });
  });
});

describe('stepName', () => {
  it('numbers rows from 1', () => {
    expect(stepName(makeSteps('rows', 5, 3, 'wall'), 0)).toEqual({ title: 'Row 1', detail: null });
  });

  it('gives a section its extent in ruler numbers', () => {
    const wall = makeSteps('sections', 40, 20, 'wall');
    expect(stepName(wall, 0)).toEqual({ title: 'Section 1', detail: 'x 0–15 · y 0–15' });
    expect(stepName(wall, 5)).toEqual({ title: 'Section 6', detail: 'x 32–39 · y 16–19' });
    expect(stepName(makeSteps('sections', 40, 20, 'floor'), 4).detail).toBe('x 16–31 · z 16–19');
  });
});

describe('progress', () => {
  const grid = createGrid(4, 2);
  grid.cells.set([A, A, B, AIR, B, B, A, AIR]);
  const rows = makeSteps('rows', 4, 2, 'wall'); // step 0 = bottom row (cells 4..7), step 1 = top row (cells 0..3)

  it('starts with every step to do and empty steps marked', () => {
    const air = createGrid(4, 2);
    expect(Array.from(stepStates(rows, grid, null))).toEqual([TODO, TODO]);
    expect(Array.from(stepStates(rows, air, null))).toEqual([EMPTY, EMPTY]);
  });

  it('ticks a step off and back on', () => {
    const built = tickRect(grid, null, rows.rect(0), true);
    expect(Array.from(stepStates(rows, grid, built))).toEqual([DONE, TODO]);
    expect(progress(grid, built)).toEqual({ blocks: 6, done: 3 });
    const cleared = tickRect(grid, built, rows.rect(0), false);
    expect(Array.from(stepStates(rows, grid, cleared))).toEqual([TODO, TODO]);
    expect(progress(grid, cleared).done).toBe(0);
  });

  it('leaves the earlier progress untouched', () => {
    const first = tickRect(grid, null, rows.rect(0), true);
    const before = first.cells.slice();
    tickRect(grid, first, rows.rect(1), true);
    expect(first.cells).toEqual(before);
  });

  it('takes a block that changed after it was built back to do', () => {
    const built = tickRect(grid, null, rows.rect(0), true);
    grid.cells[4] = B; // was B already
    expect(isDone(grid.cells, built.cells, 4)).toBe(true);
    grid.cells[5] = A;
    expect(Array.from(stepStates(rows, grid, built))).toEqual([PARTIAL, TODO]);
    grid.cells[5] = B; // restored
    expect(Array.from(stepStates(rows, grid, built))).toEqual([DONE, TODO]);
  });

  it('does not count air as something to build', () => {
    const built = tickRect(grid, null, rows.rect(1), true);
    expect(isDone(grid.cells, built.cells, 3)).toBe(false);
    expect(progress(grid, built)).toEqual({ blocks: 6, done: 3 });
  });

  it('only keeps progress that fits the art', () => {
    const built = tickRect(grid, null, rows.rect(0), true);
    expect(activeBuilt(grid, built)).toBe(built);
    expect(activeBuilt(grid, null)).toBeNull();
    expect(activeBuilt(createGrid(2, 4), built)).toBeNull();
    expect(activeBuilt(grid, tickRect(grid, built, rows.rect(0), false))).toBeNull();
  });
});

describe('stepCounts', () => {
  const grid = createGrid(4, 2);
  grid.cells.set([A, A, B, AIR, B, B, A, AIR]);
  const rows = makeSteps('rows', 4, 2, 'wall');

  it('counts the blocks of a step', () => {
    const r = stepCounts(grid, null, rows.rect(0));
    expect(Object.fromEntries(r.counts)).toEqual({ [A]: 1, [B]: 2 });
    expect(r).toMatchObject({ total: 3, left: 3 });
  });

  it('counts only what is left, and everything once the step is done', () => {
    const built = tickRect(grid, null, { x: 0, y: 1, w: 2, h: 1 }, true);
    const part = stepCounts(grid, built, rows.rect(0));
    expect(Object.fromEntries(part.counts)).toEqual({ [A]: 1 });
    expect(part).toMatchObject({ total: 3, left: 1 });
    const full = stepCounts(grid, tickRect(grid, built, rows.rect(0), true), rows.rect(0));
    expect(Object.fromEntries(full.counts)).toEqual({ [A]: 1, [B]: 2 });
    expect(full.left).toBe(0);
  });
});

describe('nextOpen', () => {
  it('finds the next step to do, wrapping round', () => {
    const s = Uint8Array.of(DONE, TODO, EMPTY, PARTIAL, DONE);
    expect(nextOpen(s, 1)).toBe(3);
    expect(nextOpen(s, 3)).toBe(1);
    expect(nextOpen(s, -1)).toBe(1);
  });

  it('says so when nothing is left', () => {
    expect(nextOpen(Uint8Array.of(DONE, EMPTY, DONE), 0)).toBe(-1);
    expect(nextOpen(Uint8Array.of(), -1)).toBe(-1);
  });
});
