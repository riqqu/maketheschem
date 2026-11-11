// Brush stamps: the cells a brush covers around one cell. Pure and unit-tested.
export type BrushShape = 'square' | 'round';

export const MIN_BRUSH = 1;
export const MAX_BRUSH = 100;

/** Sizes the `[` and `]` keys step through: fine steps for small brushes, coarser for big ones. */
export const BRUSH_STEPS: readonly number[] = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 80, 100];

/** One row of a stamp: cells dx0..dx1 (inclusive) at dy, both relative to the centre cell. */
export interface BrushRow {
  dy: number;
  dx0: number;
  dx1: number;
}

const cache = new Map<string, readonly BrushRow[]>();

export const clampBrush = (size: number) => Math.min(MAX_BRUSH, Math.max(MIN_BRUSH, Math.round(Number.isFinite(size) ? size : MIN_BRUSH)));

/**
 * The stamp of a brush as one run of cells per row. Even sizes have no middle cell: they extend one block further
 * right and down. A round brush keeps every cell whose centre lies within the circle, so small sizes look like
 * pixel-art discs (3 is a plus, 5 has trimmed corners) and 1 and 2 are the same as square.
 */
export function brushRows(size: number, shape: BrushShape = 'square'): readonly BrushRow[] {
  const n = clampBrush(size);
  const key = `${shape}${n}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const lo = 0 - Math.floor((n - 1) / 2); // not `-floor(..)`: that is -0 for sizes 1 and 2
  const mid = lo + (n - 1) / 2;
  const r2 = (n / 2 - 0.25) ** 2;
  const rows: BrushRow[] = [];
  for (let dy = lo; dy < lo + n; dy++) {
    let dx0 = Infinity, dx1 = -Infinity;
    for (let dx = lo; dx < lo + n; dx++) {
      if (shape === 'round' && (dx - mid) ** 2 + (dy - mid) ** 2 > r2 + 1e-9) continue;
      if (dx < dx0) dx0 = dx;
      dx1 = dx;
    }
    if (dx0 <= dx1) rows.push({ dy, dx0, dx1 });
  }
  cache.set(key, rows);
  return rows;
}

/** The next size up (1) or down (-1) on the BRUSH_STEPS ladder, from any size. */
export function stepBrushSize(size: number, dir: 1 | -1): number {
  const s = clampBrush(size);
  if (dir > 0) return BRUSH_STEPS.find((v) => v > s) ?? MAX_BRUSH;
  for (let i = BRUSH_STEPS.length - 1; i >= 0; i--) if (BRUSH_STEPS[i] < s) return BRUSH_STEPS[i];
  return MIN_BRUSH;
}
