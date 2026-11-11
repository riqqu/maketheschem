// A plan for building the art by hand in survival: rows or 16-block sections in building order, and a record of
// which blocks have already been placed in the world.
import type { Grid } from './grid';
import type { Cell } from './measure';
import type { Rect } from './shapes';
import { AIR, type Orientation } from './types';

/** Section size in blocks: a Minecraft chunk. */
export const CHUNK = 16;

export type StepKind = 'rows' | 'sections';
export const STEP_KINDS: readonly StepKind[] = ['rows', 'sections'];

/** The parts of the build in building order: a wall from the bottom up, a floor from the north edge down. */
export interface Steps {
  kind: StepKind;
  width: number;
  height: number;
  orientation: Orientation;
  count: number;
  /** Cells of step `i` (editor coordinates, row 0 at the top). */
  rect(i: number): Rect;
  /** The step an editor cell belongs to. */
  at(x: number, y: number): number;
  /** Rows between an editor row and the origin edge (the bottom of a wall, the north edge of a floor), from 0. */
  distance(y: number): number;
}

/**
 * Rows go one block row at a time; sections cut the art into 16 × 16 squares from the origin corner, the same
 * lines as the chunk lines on the canvas, so the ones at the far edges can be smaller. Sections run along a row of
 * squares, then on to the next row.
 */
export function makeSteps(kind: StepKind, width: number, height: number, orientation: Orientation): Steps {
  const up = orientation === 'wall';
  const distance = (y: number) => (up ? height - 1 - y : y);
  const rowAt = (d: number) => (up ? height - 1 - d : d);
  const base = { kind, width, height, orientation, distance };
  if (kind === 'rows') {
    return { ...base, count: height, rect: (i) => ({ x: 0, y: rowAt(i), w: width, h: 1 }), at: (_x, y) => distance(y) };
  }
  const cols = Math.ceil(width / CHUNK);
  const rows = Math.ceil(height / CHUNK);
  return {
    ...base,
    count: cols * rows,
    rect(i) {
      const x = (i % cols) * CHUNK;
      const d = Math.floor(i / cols) * CHUNK;
      const h = Math.min(CHUNK, height - d);
      return { x, y: up ? height - d - h : d, w: Math.min(CHUNK, width - x), h };
    },
    at: (x, y) => Math.floor(distance(y) / CHUNK) * cols + Math.floor(x / CHUNK),
  };
}

/** The corner of a step where building starts. */
export const originCell = (r: Rect, orientation: Orientation): Cell => ({ x: r.x, y: orientation === 'wall' ? r.y + r.h - 1 : r.y });

/** Name and extent of a step, in the numbers of the rulers. */
export function stepName(steps: Steps, i: number): { title: string; detail: string | null } {
  if (steps.kind === 'rows') return { title: `Row ${i + 1}`, detail: null };
  const r = steps.rect(i);
  const d = Math.min(steps.distance(r.y), steps.distance(r.y + r.h - 1));
  const axis = steps.orientation === 'wall' ? 'y' : 'z';
  return { title: `Section ${i + 1}`, detail: `x ${r.x}–${r.x + r.w - 1} · ${axis} ${d}–${d + r.h - 1}` };
}

// ---- progress ---------------------------------------------------------------------------------

/**
 * What has been built: a grid holding, for every cell that was ticked off, the block placed there (AIR for the rest).
 * A cell counts as done only while the art still has that block there, so changing a built block makes it to-do again.
 */
export type Built = Grid;

/** The progress that belongs to this grid: the same size and at least one cell ticked off. */
export function activeBuilt(grid: Grid | null, built: Built | null): Built | null {
  if (!grid || !built || built.width !== grid.width || built.height !== grid.height) return null;
  return built.cells.some((v) => v !== AIR) ? built : null;
}

export const isDone = (cells: ArrayLike<number>, built: ArrayLike<number> | null | undefined, i: number): boolean =>
  !!built && cells[i] !== AIR && built[i] === cells[i];

/** A copy of the progress with every cell of `rect` ticked off (or cleared). `built` must match the grid's size. */
export function tickRect(grid: Grid, built: Built | null, rect: Rect, on: boolean): Built {
  const cells = built ? built.cells.slice() : new Uint16Array(grid.cells.length).fill(AIR);
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const i = y * grid.width + x;
      cells[i] = on ? grid.cells[i] : AIR;
    }
  }
  return { width: grid.width, height: grid.height, cells };
}

export const TODO = 0, PARTIAL = 1, DONE = 2, EMPTY = 3;
/** TODO, PARTIAL (some blocks placed), DONE, or EMPTY (no blocks, so nothing to do). */
export type StepState = typeof TODO | typeof PARTIAL | typeof DONE | typeof EMPTY;

export function stepStates(steps: Steps, grid: Grid, built: Built | null): Uint8Array {
  const out = new Uint8Array(steps.count);
  for (let s = 0; s < steps.count; s++) {
    const r = steps.rect(s);
    let blocks = 0, done = 0;
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const i = y * grid.width + x;
        if (grid.cells[i] === AIR) continue;
        blocks++;
        if (isDone(grid.cells, built?.cells, i)) done++;
      }
    }
    out[s] = blocks === 0 ? EMPTY : done === blocks ? DONE : done === 0 ? TODO : PARTIAL;
  }
  return out;
}

/** Blocks in the art and how many of them are built. */
export function progress(grid: Grid, built: Built | null): { blocks: number; done: number } {
  let blocks = 0, done = 0;
  for (let i = 0; i < grid.cells.length; i++) {
    if (grid.cells[i] === AIR) continue;
    blocks++;
    if (isDone(grid.cells, built?.cells, i)) done++;
  }
  return { blocks, done };
}

/** Blocks of a step still to place, by block; a finished step lists everything it holds. */
export function stepCounts(grid: Grid, built: Built | null, rect: Rect): { counts: Map<number, number>; total: number; left: number } {
  const all = new Map<number, number>();
  const todo = new Map<number, number>();
  let total = 0, left = 0;
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const i = y * grid.width + x;
      const v = grid.cells[i];
      if (v === AIR) continue;
      total++;
      all.set(v, (all.get(v) ?? 0) + 1);
      if (!isDone(grid.cells, built?.cells, i)) {
        left++;
        todo.set(v, (todo.get(v) ?? 0) + 1);
      }
    }
  }
  return { counts: left ? todo : all, total, left };
}

const isOpen = (state: number) => state === TODO || state === PARTIAL;

/** The next step after `from` that still has blocks to place, wrapping round to the start; -1 when everything is done. */
export function nextOpen(states: ArrayLike<number>, from: number): number {
  for (let i = from + 1; i < states.length; i++) if (isOpen(states[i])) return i;
  for (let i = 0; i < Math.min(from, states.length); i++) if (isOpen(states[i])) return i;
  return -1;
}
