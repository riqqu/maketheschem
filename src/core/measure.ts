// Measuring and ruler maths for the editor (pure, unit-tested).
import type { Orientation } from './types';

export interface Cell {
  x: number;
  y: number;
}

/** A measured segment between two grid cells (editor coordinates, row 0 at the top). */
export interface Measurement {
  a: Cell;
  b: Cell;
}

export interface MeasureStats {
  /** Blocks covered horizontally / vertically, counting both end blocks. */
  spanX: number;
  spanY: number;
  /** Steps between the end blocks (centre to centre). */
  dx: number;
  dy: number;
  /** Straight-line distance between the end blocks' centres. */
  distance: number;
}

export function measureStats({ a, b }: Measurement): MeasureStats {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  return { spanX: dx + 1, spanY: dy + 1, dx, dy, distance: Math.hypot(dx, dy) };
}

const blocks = (n: number) => `${n} ${n === 1 ? 'block' : 'blocks'}`;

/** Short label drawn next to the measuring line. */
export function measureLabel(m: Measurement): string {
  const s = measureStats(m);
  if (s.dy === 0) return blocks(s.spanX);
  if (s.dx === 0) return blocks(s.spanY);
  return `${s.spanX} × ${s.spanY} · ${s.distance.toFixed(1)} diag`;
}

/** Full description for the status bar, with in-game axis names. */
export function measureSummary(m: Measurement, orientation: Orientation): string {
  const s = measureStats(m);
  const v = orientation === 'wall' ? 'y' : 'z';
  const parts = [`${s.spanX} × ${s.spanY} blocks`, `Δx ${s.dx}`, `Δ${v} ${s.dy}`];
  if (s.dx && s.dy) parts.push(`${s.distance.toFixed(1)} straight`);
  return parts.join(' · ');
}

/** Shift-lock: keep only the dominant axis so the line is perfectly horizontal or vertical. */
export function lockAxis(a: Cell, b: Cell): Cell {
  return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
}

const NICE = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

/**
 * Ruler tick spacing (in blocks) for a zoom level given in screen pixels per block:
 * `label` = numbered ticks at least `minLabelPx` apart, `minor` = small ticks at least 5px apart.
 */
export function rulerSteps(scale: number, minLabelPx = 36): { label: number; minor: number } {
  const label = NICE.find((s) => s * scale >= minLabelPx) ?? NICE[NICE.length - 1];
  const minor = NICE.find((s) => s < label && label % s === 0 && s * scale >= 5) ?? label;
  return { label, minor };
}

/**
 * Distance of the horizontal grid line above editor row `r` from the art's origin edge, in blocks:
 * walls count up from the bottom (= in-game height above the paste point), floors count down from the north edge.
 */
export function rowLineDistance(r: number, height: number, orientation: Orientation): number {
  return orientation === 'wall' ? height - r : r;
}
