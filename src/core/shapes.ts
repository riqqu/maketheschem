// Shape, selection and transform maths for the editor tools (pure, unit-tested).
import { brushRows, clampBrush, type BrushShape } from './brush';
import type { Grid, History } from './grid';
import type { Cell } from './measure';
import { AIR } from './types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Block data cut out of a grid (row-major), e.g. the clipboard or a floating selection. */
export interface Clip {
  width: number;
  height: number;
  cells: Uint16Array;
}

/** The rectangle spanned by two corner cells (both included). */
export const rectBetween = (a: Cell, b: Cell): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(b.x - a.x) + 1,
  h: Math.abs(b.y - a.y) + 1,
});

/** The part of `r` that lies inside the grid, or null. */
export function clipRect(r: Rect, width: number, height: number): Rect | null {
  const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y);
  const x1 = Math.min(width, r.x + r.w), y1 = Math.min(height, r.y + r.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** The area two rectangles share, or null. */
export function intersectRect(a: Rect, b: Rect): Rect | null {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

export const inRect = (r: Rect, c: Cell) => c.x >= r.x && c.y >= r.y && c.x < r.x + r.w && c.y < r.y + r.h;

/** Shift on the line tool: snap to the nearest horizontal, vertical or 45° direction. */
export function snapLine(a: Cell, b: Cell): Cell {
  const dx = b.x - a.x, dy = b.y - a.y;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax > 2 * ay) return { x: b.x, y: a.y };
  if (ay > 2 * ax) return { x: a.x, y: b.y };
  const d = Math.max(ax, ay);
  return { x: a.x + Math.sign(dx) * d, y: a.y + Math.sign(dy) * d };
}

/** Shift on the rectangle tool: make it a square. */
export function snapSquare(a: Cell, b: Cell): Cell {
  const d = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  return { x: a.x + (b.x < a.x ? -d : d), y: a.y + (b.y < a.y ? -d : d) };
}

/** Cells of a straight line (Bresenham) drawn with a brush of `size`, inside the grid. */
export function lineCells(grid: Grid, a: Cell, b: Cell, size: number, shape: BrushShape = 'square'): number[] {
  // Mark cells in a mask over the part of the grid the line can touch: cheap even for a thick, long line.
  const rows = brushRows(size, shape);
  const reach = Math.ceil(clampBrush(size) / 2) + 1;
  const x0 = Math.max(0, Math.min(a.x, b.x) - reach), x1 = Math.min(grid.width - 1, Math.max(a.x, b.x) + reach);
  const y0 = Math.max(0, Math.min(a.y, b.y) - reach), y1 = Math.min(grid.height - 1, Math.max(a.y, b.y) + reach);
  if (x1 < x0 || y1 < y0) return [];
  const w = x1 - x0 + 1;
  const mask = new Uint8Array(w * (y1 - y0 + 1));
  const dx = Math.abs(b.x - a.x), dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1;
  let e = dx + dy;
  let x = a.x, y = a.y;
  for (;;) {
    for (const row of rows) {
      const cy = y + row.dy;
      if (cy < y0 || cy > y1) continue;
      const from = Math.max(x + row.dx0, x0), to = Math.min(x + row.dx1, x1);
      mask.fill(1, (cy - y0) * w + from - x0, (cy - y0) * w + to - x0 + 1);
    }
    if (x === b.x && y === b.y) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x += sx; }
    if (e2 <= dx) { e += dx; y += sy; }
  }
  const out: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) out.push((y0 + Math.floor(i / w)) * grid.width + x0 + (i % w));
  return out;
}

/** The two corner cells of a rectangle dragged from `a` to `b`; from the centre, `a` is the middle block. */
export function rectCorners(a: Cell, b: Cell, fromCenter: boolean): [Cell, Cell] {
  return fromCenter ? [{ x: 2 * a.x - b.x, y: 2 * a.y - b.y }, b] : [a, b];
}

/**
 * Circle radius, in blocks, for corner rounding step `step` (0 = square). Chosen so that every step from 1 up looks
 * different on a pixel grid: step 1 trims only the corner block, step 2 a 2-1 staircase, step 3 a 3-1-1 curve.
 */
export const roundingRadius = (step: number) => (step > 0 ? (step * 4) / 3 + 0.75 : 0);

/** Is cell (x, y) inside `r` once its corners are rounded off with a circle of `radius` blocks? */
function inRounded(x: number, y: number, r: Rect, radius: number): boolean {
  if (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h) return false;
  const rad = Math.min(radius, r.w / 2, r.h / 2);
  if (rad <= 0) return true;
  // Distance of the cell's centre from the corner circle's centre, once it is inside a corner square.
  const cx = x + 0.5, cy = y + 0.5;
  const left = r.x + rad, right = r.x + r.w - rad, top = r.y + rad, bottom = r.y + r.h - rad;
  const dx = cx < left ? left - cx : cx > right ? cx - right : 0;
  const dy = cy < top ? top - cy : cy > bottom ? cy - bottom : 0;
  return dx * dx + dy * dy <= rad * rad;
}

/**
 * Cells of a rectangle between two corners, inside the grid: filled, or an outline `thickness` blocks wide
 * (inwards). `rounding` (see roundingRadius) rounds the corners; the outline keeps its thickness around the curve.
 * Corners never round further than a half-circle, so a big step turns a square into a disc.
 */
export function rectCells(grid: Grid, a: Cell, b: Cell, filled: boolean, thickness: number, rounding = 0): number[] {
  const r = rectBetween(a, b);
  const t = Math.max(1, Math.round(thickness));
  const rad = roundingRadius(rounding);
  const inner: Rect = { x: r.x + t, y: r.y + t, w: r.w - 2 * t, h: r.h - 2 * t };
  const hasInner = !filled && inner.w > 0 && inner.h > 0;
  const out: number[] = [];
  for (let y = Math.max(r.y, 0); y < Math.min(r.y + r.h, grid.height); y++) {
    for (let x = Math.max(r.x, 0); x < Math.min(r.x + r.w, grid.width); x++) {
      if (!inRounded(x, y, r, rad)) continue;
      if (hasInner && inRounded(x, y, inner, Math.max(0, rad - t))) continue;
      out.push(y * grid.width + x);
    }
  }
  return out;
}

/** Sets cells as one undo step. Returns true if anything changed. */
export function paintCells(grid: Grid, history: History, cells: Iterable<number>, value: number): boolean {
  history.begin();
  for (const i of cells) history.set(grid, i, value);
  return history.commit(grid);
}

export function copyRegion(grid: Grid, r: Rect): Clip {
  const cells = new Uint16Array(r.w * r.h).fill(AIR);
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const gx = r.x + x, gy = r.y + y;
      if (gx >= 0 && gy >= 0 && gx < grid.width && gy < grid.height) cells[y * r.w + x] = grid.cells[gy * grid.width + gx];
    }
  }
  return { width: r.w, height: r.h, cells };
}

/** Writes a clip with its top-left at (x, y) inside the current history step; parts outside the grid are dropped. */
export function stampClip(grid: Grid, history: History, clip: Clip, x: number, y: number, airTransparent = true): void {
  for (let cy = 0; cy < clip.height; cy++) {
    const gy = y + cy;
    if (gy < 0 || gy >= grid.height) continue;
    for (let cx = 0; cx < clip.width; cx++) {
      const gx = x + cx;
      if (gx < 0 || gx >= grid.width) continue;
      const v = clip.cells[cy * clip.width + cx];
      if (v === AIR && airTransparent) continue;
      history.set(grid, gy * grid.width + gx, v);
    }
  }
}

/** Fills a rectangle with `value` inside the current history step. */
export function fillRect(grid: Grid, history: History, r: Rect, value: number): void {
  const c = clipRect(r, grid.width, grid.height);
  if (!c) return;
  for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) history.set(grid, y * grid.width + x, value);
}

export type ClipTransform = 'flipH' | 'flipV' | 'rot180' | 'rotCW' | 'rotCCW';

/** A transformed copy (quarter turns swap width and height). */
export function transformClip(clip: Clip, op: ClipTransform): Clip {
  const { width: w, height: h, cells } = clip;
  const quarter = op === 'rotCW' || op === 'rotCCW';
  const ow = quarter ? h : w, oh = quarter ? w : h;
  const out = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx: number, ny: number;
      switch (op) {
        case 'flipH': nx = w - 1 - x; ny = y; break;
        case 'flipV': nx = x; ny = h - 1 - y; break;
        case 'rot180': nx = w - 1 - x; ny = h - 1 - y; break;
        case 'rotCW': nx = h - 1 - y; ny = x; break;
        case 'rotCCW': nx = y; ny = w - 1 - x; break;
      }
      out[ny * ow + nx] = cells[y * w + x];
    }
  }
  return { width: ow, height: oh, cells: out };
}

/** Flips or turns a rectangle of the grid in place (size-preserving transforms only) as one undo step. */
export function transformRegion(grid: Grid, history: History, r: Rect, op: 'flipH' | 'flipV' | 'rot180'): boolean {
  const c = clipRect(r, grid.width, grid.height);
  if (!c) return false;
  const t = transformClip(copyRegion(grid, c), op);
  history.begin();
  stampClip(grid, history, t, c.x, c.y, false);
  return history.commit(grid);
}
