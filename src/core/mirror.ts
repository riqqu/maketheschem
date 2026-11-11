// Mirror painting: whatever is painted is also painted at its reflection across one or two axes.
import type { BrushRow } from './brush';
import type { CellSetter } from './grid';

/**
 * Where the mirror lines are, as twice their distance from the left (x) or top (y) edge, in blocks: 2k stands for
 * k blocks in, so a line can run between two blocks (even) or through the middle of one (odd, that column maps to
 * itself). Cell c reflects to `axis - 1 - c`. null means no mirror in that direction.
 */
export interface Axes {
  x: number | null;
  y: number | null;
}

/** The axis through the middle of `size` blocks. */
export const centerAxis = (size: number) => size;

/** The axis closest to a position in blocks from the edge (may be fractional), kept on the art. */
export const snapAxis = (position: number, size: number) => Math.min(2 * size, Math.max(0, Math.round(position * 2)));

export const hasMirror = (axes: Axes) => axes.x !== null || axes.y !== null;

/** The cells that mirror cell `i` of a grid, those inside it only and never `i` itself. */
export function mirrorsOf(i: number, width: number, height: number, axes: Axes): number[] {
  const x = i % width, y = (i - x) / width;
  const out: number[] = [];
  const add = (cx: number, cy: number) => {
    // A cell on one of the axes reflects onto the same cell twice (across the other axis, and across both).
    if (cx >= 0 && cx < width && cy >= 0 && cy < height && (cx !== x || cy !== y) && !out.includes(cy * width + cx)) out.push(cy * width + cx);
  };
  const mx = axes.x === null ? x : axes.x - 1 - x;
  const my = axes.y === null ? y : axes.y - 1 - y;
  if (axes.x !== null) add(mx, y);
  if (axes.y !== null) add(x, my);
  if (axes.x !== null && axes.y !== null) add(mx, my);
  return out;
}

/** The cells plus their mirror images, each once. */
export function withMirror(cells: readonly number[], width: number, height: number, axes: Axes): number[] {
  if (!hasMirror(axes)) return [...cells];
  const all = new Set(cells);
  for (const i of cells) for (const j of mirrorsOf(i, width, height, axes)) all.add(j);
  return [...all];
}

/** A setter that sets every cell and its mirror images, for tools that paint through `history.set`. */
export function mirrored(history: CellSetter, axes: Axes): CellSetter {
  if (!hasMirror(axes)) return history;
  return {
    set(grid, i, value) {
      let changed = history.set(grid, i, value);
      for (const j of mirrorsOf(i, grid.width, grid.height, axes)) changed = history.set(grid, j, value) || changed;
      return changed;
    },
  };
}

// `0 - v` rather than `-v`: that is -0 for 0, which Object.is (and so toEqual) tells apart from 0.
const flipRows = (rows: readonly BrushRow[], fx: boolean, fy: boolean): BrushRow[] => {
  const out = rows.map((r) => ({ dy: fy ? 0 - r.dy : r.dy, dx0: fx ? 0 - r.dx1 : r.dx0, dx1: fx ? 0 - r.dx0 : r.dx1 }));
  return fy ? out.reverse() : out;
};

/**
 * The mirror images of a brush stamp centred on (x, y): where each is centred and its rows, flipped so the cells are
 * exactly the reflections of the original's (an even-sized brush reaches one block further right and down).
 */
export function mirrorStamps(x: number, y: number, rows: readonly BrushRow[], axes: Axes): { x: number; y: number; rows: BrushRow[] }[] {
  const out: { x: number; y: number; rows: BrushRow[] }[] = [];
  const mx = axes.x === null ? null : axes.x - 1 - x;
  const my = axes.y === null ? null : axes.y - 1 - y;
  if (mx !== null) out.push({ x: mx, y, rows: flipRows(rows, true, false) });
  if (my !== null) out.push({ x, y: my, rows: flipRows(rows, false, true) });
  if (mx !== null && my !== null) out.push({ x: mx, y: my, rows: flipRows(rows, true, true) });
  return out;
}
