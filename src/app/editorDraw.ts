// Canvas overlays for the editor: outlines, selections, the measuring line and the rulers.
import type { BrushRow } from '../core/brush';
import type { Grid } from '../core/grid';
import { measureLabel, rowLineDistance, rulerSteps, type Cell, type Measurement } from '../core/measure';
import type { Orientation } from '../core/types';

export interface View {
  scale: number;
  ox: number;
  oy: number;
  cw: number;
  ch: number;
}

export interface Theme {
  checkA: string;
  checkB: string;
  line: string;
  major: string;
  rulerBg: string;
  rulerText: string;
  rulerLine: string;
  accent: string;
}

export const RULER_H = 20;
export const RULER_W = 34;
const FONT = '10.5px system-ui, -apple-system, "Segoe UI", sans-serif';
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Screen x/y of a cell edge, rounded so neighbouring cells share an edge. */
export const screen = (v: View) => ({
  sx: (x: number) => Math.round(v.ox + x * v.scale),
  sy: (y: number) => Math.round(v.oy + y * v.scale),
});

/** Black + white outline that stays visible on any block colour. */
export function outlineCells(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
}

/** Black + white outline around a brush stamp centred on cell (cx, cy): follows round brushes, not just their box. */
export function outlineBrush(ctx: CanvasRenderingContext2D, v: View, cx: number, cy: number, rows: readonly BrushRow[]) {
  if (!rows.length) return;
  const { sx, sy } = screen(v);
  const px = (x: number) => sx(x) + 0.5;
  const py = (y: number) => sy(y) + 0.5;
  // Rows are one run each and follow each other, so the outline is a staircase down the right side and up the left.
  ctx.beginPath();
  ctx.moveTo(px(cx + rows[0].dx0), py(cy + rows[0].dy));
  for (const r of rows) {
    ctx.lineTo(px(cx + r.dx1 + 1), py(cy + r.dy));
    ctx.lineTo(px(cx + r.dx1 + 1), py(cy + r.dy + 1));
  }
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    ctx.lineTo(px(cx + r.dx0), py(cy + r.dy + 1));
    ctx.lineTo(px(cx + r.dx0), py(cy + r.dy));
  }
  ctx.closePath();
  ctx.lineJoin = 'miter';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
}

/** Selection outline: white dashes on a dark line. */
export function dashedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  ctx.setLineDash([]);
}

/** A small dark label with white text, kept inside the canvas. */
export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, bounds: { top: number; right: number; bottom: number }) {
  ctx.font = `600 12px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const tw = Math.ceil(ctx.measureText(text).width) + 14;
  const lx = clamp(x, 4, bounds.right - tw - 4);
  const ly = clamp(y, bounds.top + 4, bounds.bottom - 26);
  ctx.fillStyle = 'rgba(18,20,24,0.9)';
  ctx.beginPath();
  ctx.roundRect(lx, ly, tw, 22, 5);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, lx + 7, ly + 11.5);
}

/** Measurement: span box, centre-to-centre line, end blocks and a label. */
export function drawMeasurement(ctx: CanvasRenderingContext2D, v: View, m: Measurement, showRulers: boolean) {
  const { sx, sy } = screen(v);
  const minX = Math.min(m.a.x, m.b.x), maxX = Math.max(m.a.x, m.b.x);
  const minY = Math.min(m.a.y, m.b.y), maxY = Math.max(m.a.y, m.b.y);
  const rx = sx(minX), ry = sy(minY), rw = sx(maxX + 1) - rx, rh = sy(maxY + 1) - ry;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.strokeRect(rx - 0.5, ry - 0.5, rw + 1, rh + 1);
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(rx - 0.5, ry - 0.5, rw + 1, rh + 1);
  ctx.setLineDash([]);
  for (const c of [m.a, m.b]) outlineCells(ctx, sx(c.x), sy(c.y), sx(c.x + 1) - sx(c.x), sy(c.y + 1) - sy(c.y));
  const ax = v.ox + (m.a.x + 0.5) * v.scale, ay = v.oy + (m.a.y + 0.5) * v.scale;
  const bx = v.ox + (m.b.x + 0.5) * v.scale, by = v.oy + (m.b.y + 0.5) * v.scale;
  ctx.lineCap = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  ctx.lineCap = 'butt';
  label(ctx, measureLabel(m), bx + 12, by - 30, {
    top: showRulers ? RULER_H : 0,
    right: v.cw - (showRulers ? RULER_W : 0),
    bottom: v.ch,
  });
}

/**
 * Rulers in screen space: block distances from the art's origin corner (left edge; bottom for walls, north edge
 * for floors). Tick spacing adapts to the zoom. Highlighted bands mark the hovered and measured blocks.
 */
export function drawRulers(
  ctx: CanvasRenderingContext2D, v: View, t: Theme, g: Grid, orientation: Orientation,
  bands: { from: Cell; to: Cell; alpha: number }[],
) {
  const { scale, ox, oy, cw, ch } = v;
  const { label: step, minor } = rulerSteps(scale);
  const { sx, sy } = screen(v);
  const right = cw - RULER_W;
  const rowDist = (r: number) => rowLineDistance(r, g.height, orientation);

  ctx.save();
  ctx.font = FONT;
  ctx.fillStyle = t.rulerBg;
  ctx.fillRect(0, 0, cw, RULER_H);
  ctx.fillRect(right, 0, RULER_W, ch);

  // Top ruler (x).
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, right, RULER_H);
  ctx.clip();
  for (const b of bands) {
    ctx.globalAlpha = b.alpha;
    ctx.fillStyle = t.accent;
    const a = Math.min(b.from.x, b.to.x), z = Math.max(b.from.x, b.to.x) + 1;
    ctx.fillRect(sx(a), 0, sx(z) - sx(a), RULER_H);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = t.rulerLine;
  ctx.fillStyle = t.rulerText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const xa = clamp(Math.floor(-ox / scale), 0, g.width), xb = clamp(Math.ceil((right - ox) / scale), 0, g.width);
  for (let x = Math.ceil(xa / minor) * minor; x <= xb; x += minor) {
    const px = sx(x) + 0.5;
    const big = x % step === 0;
    ctx.moveTo(px, RULER_H);
    ctx.lineTo(px, RULER_H - (big ? 7 : 4));
    if (big) ctx.fillText(String(x), px, 2);
  }
  ctx.stroke();
  ctx.restore();

  // Right ruler (y up from the bottom for walls, z down from north for floors).
  ctx.save();
  ctx.beginPath();
  ctx.rect(right, RULER_H, RULER_W, ch - RULER_H);
  ctx.clip();
  for (const b of bands) {
    ctx.globalAlpha = b.alpha;
    ctx.fillStyle = t.accent;
    const a = Math.min(b.from.y, b.to.y), z = Math.max(b.from.y, b.to.y) + 1;
    ctx.fillRect(right, sy(a), RULER_W, sy(z) - sy(a));
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = t.rulerLine;
  ctx.fillStyle = t.rulerText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.beginPath();
  const ya = clamp(Math.floor((RULER_H - oy) / scale), 0, g.height), yb = clamp(Math.ceil((ch - oy) / scale), 0, g.height);
  for (let y = ya; y <= yb; y++) {
    const d = rowDist(y);
    if (d % minor !== 0) continue;
    const py = sy(y) + 0.5;
    const big = d % step === 0;
    ctx.moveTo(right, py);
    ctx.lineTo(right + (big ? 7 : 4), py);
    if (big) ctx.fillText(String(d), right + 9, py);
  }
  ctx.stroke();
  ctx.restore();

  // Edges and the corner box with the axis names.
  ctx.strokeStyle = t.rulerLine;
  ctx.beginPath();
  ctx.moveTo(0, RULER_H - 0.5);
  ctx.lineTo(right, RULER_H - 0.5);
  ctx.moveTo(right + 0.5, RULER_H);
  ctx.lineTo(right + 0.5, ch);
  ctx.stroke();
  ctx.fillStyle = t.rulerText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(orientation === 'wall' ? 'x · y' : 'x · z', right + RULER_W / 2, RULER_H / 2);
  ctx.restore();
}
