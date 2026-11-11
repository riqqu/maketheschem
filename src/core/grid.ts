import { brushRows, type BrushShape } from './brush';
import { AIR } from './types';
import { countCells } from './volume';

/** Row-major block grid as seen in the editor: (0,0) is the top-left cell. */
export interface Grid {
  width: number;
  height: number;
  cells: Uint16Array;
}

export function createGrid(width: number, height: number, fill = AIR): Grid {
  return { width, height, cells: new Uint16Array(width * height).fill(fill) };
}

/** New grid of a different size keeping the overlapping top-left area. */
export function resizeGrid(grid: Grid, width: number, height: number): Grid {
  const out = createGrid(width, height);
  const w = Math.min(width, grid.width);
  for (let y = 0; y < Math.min(height, grid.height); y++) {
    out.cells.set(grid.cells.subarray(y * grid.width, y * grid.width + w), y * width);
  }
  return out;
}

interface Diff {
  id: number;
  idx: Uint32Array;
  before: Uint16Array;
  after: Uint16Array;
}

/** Undo/redo as per-operation diffs. Wrap each user action in begin()/commit(). */
export class History {
  private undos: Diff[] = [];
  private redos: Diff[] = [];
  private pending: Map<number, number> | null = null;
  private nextId = 1;

  constructor(private readonly limit = 100) {}

  begin(): void {
    this.pending = new Map();
  }

  /** Sets one cell, remembering its old value for the current operation. */
  set(grid: Grid, i: number, value: number): boolean {
    const before = grid.cells[i];
    if (before === value) return false;
    if (this.pending && !this.pending.has(i)) this.pending.set(i, before);
    grid.cells[i] = value;
    return true;
  }

  /** Ends the current operation. Returns true if anything changed. */
  commit(grid: Grid): boolean {
    const pending = this.pending;
    this.pending = null;
    if (!pending || pending.size === 0) return false;
    const idx = new Uint32Array(pending.size);
    const before = new Uint16Array(pending.size);
    const after = new Uint16Array(pending.size);
    let k = 0;
    for (const [i, b] of pending) {
      idx[k] = i;
      before[k] = b;
      after[k] = grid.cells[i];
      k++;
    }
    this.undos.push({ id: this.nextId++, idx, before, after });
    if (this.undos.length > this.limit) this.undos.shift();
    this.redos = [];
    return true;
  }

  /** Id of the step Ctrl+Z would undo next (stable across undo/redo), or null. */
  get topId(): number | null {
    return this.undos.length ? this.undos[this.undos.length - 1].id : null;
  }

  undo(grid: Grid): boolean {
    const d = this.undos.pop();
    if (!d) return false;
    for (let k = 0; k < d.idx.length; k++) grid.cells[d.idx[k]] = d.before[k];
    this.redos.push(d);
    return true;
  }

  redo(grid: Grid): boolean {
    const d = this.redos.pop();
    if (!d) return false;
    for (let k = 0; k < d.idx.length; k++) grid.cells[d.idx[k]] = d.after[k];
    this.undos.push(d);
    return true;
  }

  clear(): void {
    this.undos = [];
    this.redos = [];
    this.pending = null;
  }

  get canUndo(): boolean {
    return this.undos.length > 0;
  }

  get canRedo(): boolean {
    return this.redos.length > 0;
  }
}

/** Cells covered by a brush of `size` centred on (x, y), inside the grid. */
export function brushCells(grid: Grid, x: number, y: number, size: number, shape: BrushShape = 'square'): number[] {
  const out: number[] = [];
  for (const { dy, dx0, dx1 } of brushRows(size, shape)) {
    const cy = y + dy;
    if (cy < 0 || cy >= grid.height) continue;
    const from = Math.max(x + dx0, 0), to = Math.min(x + dx1, grid.width - 1);
    for (let cx = from; cx <= to; cx++) out.push(cy * grid.width + cx);
  }
  return out;
}

/** Anything that can set a cell inside an undo step: the History itself, or one that also sets mirrored cells. */
export type CellSetter = Pick<History, 'set'>;

/** Paints a brush stroke segment from (x0,y0) to (x1,y1) without gaps (Bresenham). */
export function paintLine(
  grid: Grid, history: CellSetter, x0: number, y0: number, x1: number, y1: number, size: number, value: number,
  shape: BrushShape = 'square',
): boolean {
  let changed = false;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  let x = x0, y = y0;
  for (;;) {
    for (const i of brushCells(grid, x, y, size, shape)) changed = history.set(grid, i, value) || changed;
    if (x === x1 && y === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x += sx; }
    if (e2 <= dx) { e += dx; y += sy; }
  }
  return changed;
}

/** Tells whether a cell counts as the same as the clicked one although it is another block (see similarBlocks). */
export type Similar = (cell: number, seed: number) => boolean;

export interface FillOptions {
  /** Also spread across the corners, not only the four sides. */
  diagonal?: boolean;
  similar?: Similar;
}

/** Flood fill of the region containing (x, y). Returns the number of cells changed. */
export function floodFill(grid: Grid, history: History, x: number, y: number, value: number, opts: FillOptions = {}): number {
  if (grid.cells[y * grid.width + x] === value && !opts.similar) return 0;
  const region = regionCells(grid, x, y, opts);
  history.begin();
  let count = 0;
  for (const i of region) if (history.set(grid, i, value)) count++;
  history.commit(grid);
  return count;
}

/** Indices of the connected region containing (x, y): what a flood fill from there would cover. */
export function regionCells(grid: Grid, x: number, y: number, opts: FillOptions = {}): number[] {
  const { width, height, cells } = grid;
  const { diagonal = false, similar } = opts;
  const seed = cells[y * width + x];
  const inRegion = similar ? (v: number) => v === seed || similar(v, seed) : (v: number) => v === seed;
  const out: number[] = [];
  // Mark visited cells instead of relying on the cells' values: a filled cell may still look like the seed.
  const seen = new Uint8Array(width * height);
  const stack = [y * width + x];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    out.push(i);
    const cx = i % width, cy = (i - cx) / width;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = cy + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx === 0 && dy === 0) || (!diagonal && dx !== 0 && dy !== 0)) continue;
        const nx = cx + dx;
        if (nx < 0 || nx >= width) continue;
        const n = ny * width + nx;
        if (seen[n] || !inRegion(cells[n])) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
  }
  return out;
}

/** Replaces every `from` cell (and, with `similar`, every block like it) with `to`. Returns the number of cells changed. */
export function replaceAll(grid: Grid, history: History, from: number, to: number, similar?: Similar): number {
  if (from === to && !similar) return 0;
  history.begin();
  let count = 0;
  for (let i = 0; i < grid.cells.length; i++) {
    const v = grid.cells[i];
    if ((v === from || (similar && similar(v, from))) && history.set(grid, i, to)) count++;
  }
  history.commit(grid);
  return count;
}

/** Block value -> number of cells, air excluded. */
export function countBlocks(grid: Grid): Map<number, number> {
  return countCells(grid.cells);
}
