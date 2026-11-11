import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { brushRows, type BrushShape } from '../core/brush';
import { CHUNK, DONE, isDone, type Built, type Steps } from '../core/build';
import { floodFill, paintLine, regionCells, replaceAll, type Grid, type History } from '../core/grid';
import { gradientFill } from '../core/gradient';
import { lockAxis, rowLineDistance, type Cell, type Measurement } from '../core/measure';
import { centerAxis, hasMirror, mirrored, mirrorStamps, snapAxis, withMirror, type Axes } from '../core/mirror';
import { renderText, textCells, type TextBitmap } from '../core/pixelFont';
import type { PaletteColor } from '../core/quantize';
import {
  clipRect, copyRegion, ellipseCells, fillRect, inRect, intersectRect, lineCells, paintCells, rectBetween, rectCells, rectCorners, snapLine,
  snapSquare, stampClip, transformClip, transformRegion, type Clip, type ClipTransform, type Rect,
} from '../core/shapes';
import { similarBlocks } from '../core/similar';
import { AIR, faceOf, type BlockInfo, type Orientation } from '../core/types';
import { colorCanvas } from '../lib/render';
import {
  axisAt, dashedRect, drawAxes, drawCheck, drawGradientGuide, drawMeasurement, drawRulers, label, outlineBrush, outlineCells,
  RULER_H, RULER_W, screen, type AxisName, type Theme, type View,
} from './editorDraw';
import { MIRROR_TOOLS, type ToolOptions } from './toolOptions';

export type Tool =
  | 'brush' | 'eraser' | 'picker' | 'fill' | 'replace' | 'measure' | 'line' | 'rect' | 'ellipse' | 'gradient' | 'text' | 'select';
export type ViewMode = 'textures' | 'colors';

export interface SelectionInfo {
  /** Selected (or floating) area, in grid cells. */
  rect: Rect | null;
  /** A pasted or moved selection that is not placed yet. */
  floating: boolean;
  clipboard: boolean;
}

/** Commands for the toolbar and keyboard shortcuts. */
export interface EditorHandle {
  copy(): boolean;
  cut(): boolean;
  paste(): boolean;
  deleteSelection(): boolean;
  selectAll(): void;
  /** Applies to the floating selection, else the selection, else the whole art (quarter turns need a selection). */
  transform(op: ClipTransform): boolean;
  commitFloating(): boolean;
  cancelFloating(): boolean;
}

/** Build mode: the canvas shows one step of the plan and ticks, and clicking picks a step instead of editing. */
export interface BuildView {
  steps: Steps;
  /** Index of the current step. */
  step: number;
  built: Built | null;
  /** Per step, see StepState in core/build.ts. */
  states: Uint8Array;
  onStep: (index: number) => void;
}

interface Props {
  grid: Grid | null;
  /** Bumped by the parent whenever the grid changed outside the editor (generate, undo, redo). */
  version: number;
  blocks: readonly BlockInfo[];
  orientation: Orientation;
  atlas: HTMLImageElement | null;
  tileSize: number;
  atlasColumns: number;
  viewMode: ViewMode;
  showGrid: boolean;
  showRulers: boolean;
  tool: Tool;
  options: ToolOptions;
  currentBlock: number;
  /** The blocks the generator may use, which a gradient steps through. */
  palette: readonly PaletteColor[];
  history: History;
  fitSignal: number;
  /** Source image drawn over the blocks for comparison, or null. */
  overlay: HTMLImageElement | null;
  overlayOpacity: number;
  /** A block to show on its own: every other cell fades. */
  highlight: number | null;
  build: BuildView | null;
  handleRef: Ref<EditorHandle>;
  onEdit: () => void;
  onPick: (value: number) => void;
  onHover: (cell: Cell | null) => void;
  onZoom: (scale: number) => void;
  onMeasure: (m: Measurement | null) => void;
  onSelection: (info: SelectionInfo) => void;
  onToolChange: (tool: Tool) => void;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 64;
/** Below this many screen pixels per block, textures are unreadable - draw average colours instead. */
const TEXTURE_MIN_SCALE = 6;
/** Thick grid lines every this many blocks (matches the ruler numbering). */
const MAJOR = 10;
/** How far blocks outside the highlight or the current build step fade, and how strongly built blocks are tinted. */
const DIM_ALPHA = 0.72;
const DONE_ALPHA = 0.4;
/** Smallest section on screen, in pixels, that still gets a tick when it is done. */
const CHECK_MIN_PX = 28;
/** A gradient is previewed as blocks while it covers at most this many cells; bigger ones only show their direction. */
const GRADIENT_PREVIEW_MAX = 50_000;

interface Floating {
  clip: Clip;
  x: number;
  y: number;
  /** Where a moved selection came from (cleared when it is placed); null for a paste. */
  source: Rect | null;
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'paint'; lx: number; ly: number; value: number; size: number; shape: BrushShape }
  | { kind: 'measure' }
  | { kind: 'shape'; a: Cell; b: Cell }
  /** `area` is what the gradient fills; `result` its blocks (one per cell of the area) once it has a direction. */
  | { kind: 'gradient'; a: Cell; b: Cell; area: number[]; result: Uint16Array | null }
  | { kind: 'axis'; axis: AxisName }
  | { kind: 'select'; a: Cell }
  | { kind: 'move'; dx: number; dy: number };

/** Survives switching between arts. */
let clipboard: Clip | null = null;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Size and shape of the tools that paint with a brush stamp (brush, eraser, line); null for the others. */
const penOf = (p: Pick<Props, 'tool' | 'options'>) =>
  p.tool === 'brush' ? p.options.brush : p.tool === 'eraser' ? p.options.eraser : p.tool === 'line' ? p.options.line : null;
const isTyping = (e: KeyboardEvent) =>
  !!(e.target as HTMLElement)?.closest?.('input:not([type=checkbox]):not([type=range]):not([type=radio]), textarea, select, [contenteditable]');

export function Editor(props: Props) {
  const propsRef = useRef(props);
  propsRef.current = props;

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({ scale: 8, ox: 0, oy: 0, cw: 0, ch: 0 });
  const colorCache = useRef<HTMLCanvasElement | null>(null);
  const colorDirty = useRef(true);
  const hover = useRef<Cell | null>(null);
  const measure = useRef<Measurement | null>(null);
  const selection = useRef<Rect | null>(null);
  const floating = useRef<Floating | null>(null);
  const drag = useRef<Drag | null>(null);
  const space = useRef(false);
  const frame = useRef(0);
  const fittedFor = useRef('');
  /** Where the mirror lines were dragged to (see Axes); null = through the middle of the art. */
  const axisPos = useRef<{ x: number | null; y: number | null }>({ x: null, y: null });
  /** The mirror line whose handle is under the pointer. */
  const axisHover = useRef<AxisName | null>(null);
  const textCache = useRef<{ key: string; bitmap: TextBitmap | null }>({ key: '', bitmap: null });
  const theme = useRef<Theme>({
    checkA: '#d9dce2',
    checkB: '#c9cdd5',
    line: 'rgba(0,0,0,0.12)',
    major: 'rgba(0,0,0,0.35)',
    rulerBg: '#ffffff',
    rulerText: '#646c79',
    rulerLine: '#c7ccd5',
    accent: '#2f7d3c',
    dim: '#f0f0f0',
  });

  // ---- drawing -----------------------------------------------------------------------------

  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const p = propsRef.current;
    const v = view.current;
    const { scale, ox, oy, cw, ch } = v;
    canvas.dataset.view = `${scale},${ox},${oy}`; // read by the browser tests to locate cells
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const g = p.grid;
    if (!g) return;

    const { sx, sy } = screen(v);
    const x0 = clamp(Math.floor(-ox / scale), 0, g.width);
    const x1 = clamp(Math.ceil((cw - ox) / scale), 0, g.width);
    const y0 = clamp(Math.floor(-oy / scale), 0, g.height);
    const y1 = clamp(Math.ceil((ch - oy) / scale), 0, g.height);
    const t = theme.current;
    const visible = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };

    const checker = (r: Rect) => {
      ctx.fillStyle = t.checkA;
      ctx.fillRect(sx(r.x), sy(r.y), sx(r.x + r.w) - sx(r.x), sy(r.y + r.h) - sy(r.y));
      if (scale < 4) return;
      ctx.fillStyle = t.checkB;
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x + ((r.x + y) % 2); x < r.x + r.w; x += 2) ctx.fillRect(sx(x), sy(y), sx(x + 1) - sx(x), sy(y + 1) - sy(y));
      }
    };

    // Air shows as a checkerboard (one square per block when zoomed in).
    checker(visible);

    ctx.imageSmoothingEnabled = false;
    const useTextures = !!(p.viewMode === 'textures' && scale >= TEXTURE_MIN_SCALE && p.atlas);
    const tiles = p.blocks.map((b) => faceOf(b, p.orientation).tile);
    const rgb = p.blocks.map((b) => faceOf(b, p.orientation).rgb);
    /** One block at cell (x, y), as a texture or flat colour. */
    const drawBlock = (value: number, x: number, y: number, alpha = 1) => {
      if (value === AIR || value >= tiles.length) return;
      // At least one pixel, so a lone highlighted block stays visible when zoomed far out.
      const dx = sx(x), dy = sy(y), dw = Math.max(1, sx(x + 1) - dx), dh = Math.max(1, sy(y + 1) - dy);
      ctx.globalAlpha = alpha;
      if (useTextures && p.atlas) {
        const tile = tiles[value];
        const { tileSize: ts, atlasColumns: cols } = p;
        ctx.drawImage(p.atlas, (tile % cols) * ts, Math.floor(tile / cols) * ts, ts, ts, dx, dy, dw, dh);
      } else {
        const c = rgb[value];
        ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
        ctx.fillRect(dx, dy, dw, dh);
      }
      ctx.globalAlpha = 1;
    };

    if (useTextures) {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) drawBlock(g.cells[y * g.width + x], x, y);
    } else {
      if (colorDirty.current || !colorCache.current) {
        colorCache.current = colorCanvas(g, p.blocks, p.orientation);
        colorDirty.current = false;
      }
      ctx.drawImage(colorCache.current, sx(0), sy(0), sx(g.width) - sx(0), sy(g.height) - sy(0));
    }

    // A moved selection leaves air behind until it is placed; then the floating blocks on top.
    const f = floating.current;
    if (f) {
      if (f.source) {
        const src = clipRect(f.source, g.width, g.height);
        if (src) checker(src);
      }
      for (let cy = 0; cy < f.clip.height; cy++) {
        const y = f.y + cy;
        if (y < y0 || y >= y1) continue;
        for (let cx = 0; cx < f.clip.width; cx++) {
          const x = f.x + cx;
          if (x >= x0 && x < x1) drawBlock(f.clip.cells[cy * f.clip.width + cx], x, y);
        }
      }
    }

    // Previews of what the drag, or the next click, would paint.
    const d = drag.current;
    const axes = axesFor(p, g);
    const inView = (x: number, y: number) => x >= x0 && x < x1 && y >= y0 && y < y1;
    if (d?.kind === 'shape') {
      for (const i of withMirror(shapeCells(g, d.a, d.b), g.width, g.height, axes)) {
        const x = i % g.width, y = (i - x) / g.width;
        if (inView(x, y)) drawBlock(p.currentBlock, x, y, 0.85);
      }
    }
    if (d?.kind === 'gradient' && d.result) {
      const blocks = d.result;
      d.area.forEach((i, k) => {
        const x = i % g.width, y = (i - x) / g.width;
        if (inView(x, y)) drawBlock(blocks[k], x, y);
      });
    }
    const pointer = hover.current;
    if (p.tool === 'text' && pointer && !p.build && !space.current && !d) {
      const text = textBitmap(p);
      if (text) {
        for (const i of textCells(text, g.width, g.height, pointer.x, pointer.y)) {
          const x = i % g.width, y = (i - x) / g.width;
          if (inView(x, y)) drawBlock(p.currentBlock, x, y, 0.85);
        }
      }
    }

    // Source image overlay for comparison.
    if (p.overlay && p.overlayOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = p.overlayOpacity;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(p.overlay, sx(0), sy(0), sx(g.width) - sx(0), sy(g.height) - sy(0));
      ctx.restore();
    }

    // A highlighted block or the current build step: everything else fades, finished blocks get a tint.
    const hl = p.highlight;
    const build = p.build;
    if ((hl !== null || build) && visible.w > 0 && visible.h > 0) {
      // The part that stays lit: the current step, or everything when only a block is highlighted.
      const lit = build ? intersectRect(build.steps.rect(build.step), visible) : visible;
      ctx.fillStyle = t.dim;
      ctx.globalAlpha = DIM_ALPHA;
      ctx.beginPath();
      ctx.rect(sx(x0), sy(y0), sx(x1) - sx(x0), sy(y1) - sy(y0));
      // Without a highlighted block the whole step keeps its colours: cut it out of the fade.
      if (hl === null && lit) ctx.rect(sx(lit.x), sy(lit.y), sx(lit.x + lit.w) - sx(lit.x), sy(lit.y + lit.h) - sy(lit.y));
      ctx.fill('evenodd');
      ctx.globalAlpha = 1;
      // With a highlighted block, only its cells inside the lit part come back.
      if (hl !== null && lit) {
        for (let y = lit.y; y < lit.y + lit.h; y++) {
          for (let x = lit.x; x < lit.x + lit.w; x++) if (g.cells[y * g.width + x] === hl) drawBlock(hl, x, y);
        }
      }
    }
    if (build) {
      const done = build.built?.cells ?? null;
      if (done) {
        ctx.fillStyle = t.accent;
        ctx.globalAlpha = DONE_ALPHA;
        for (let y = y0; y < y1; y++) {
          let start = -1;
          for (let x = x0; x <= x1; x++) {
            const on = x < x1 && isDone(g.cells, done, y * g.width + x);
            if (on && start < 0) start = x;
            else if (!on && start >= 0) {
              ctx.fillRect(sx(start), sy(y), sx(x) - sx(start), sy(y + 1) - sy(y));
              start = -1;
            }
          }
        }
        ctx.globalAlpha = 1;
      }
      if (build.steps.kind === 'sections' && scale * CHUNK >= CHECK_MIN_PX) {
        for (let i = 0; i < build.steps.count; i++) {
          if (build.states[i] !== DONE) continue;
          const r = build.steps.rect(i);
          if (r.x >= x1 || r.y >= y1 || r.x + r.w <= x0 || r.y + r.h <= y0) continue;
          if (Math.min(r.w, r.h) * scale >= CHECK_MIN_PX) drawCheck(ctx, ox + (r.x + r.w / 2) * scale, oy + (r.y + r.h / 2) * scale, Math.min(28, Math.min(r.w, r.h) * scale * 0.5));
        }
      }
    }

    // Grid lines: every block when zoomed in, and every 10 blocks (same origin as the rulers) for counting.
    // Building swaps the tens for the chunk lines every 16, which stay even when the grid is hidden.
    const rowDist = (r: number) => rowLineDistance(r, g.height, p.orientation);
    if (p.showGrid && scale >= 16) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = t.line;
      ctx.beginPath();
      for (let x = x0; x <= x1; x++) { ctx.moveTo(sx(x) + 0.5, sy(y0)); ctx.lineTo(sx(x) + 0.5, sy(y1)); }
      for (let y = y0; y <= y1; y++) { ctx.moveTo(sx(x0), sy(y) + 0.5); ctx.lineTo(sx(x1), sy(y) + 0.5); }
      ctx.stroke();
    }
    if ((p.showGrid || build) && scale >= 1.5) {
      const major = build ? CHUNK : MAJOR;
      ctx.lineWidth = build ? 2 : 1;
      ctx.strokeStyle = build ? t.accent : t.major;
      const nudge = build ? 0 : 0.5;
      ctx.beginPath();
      for (let x = Math.ceil(x0 / major) * major; x <= x1; x += major) { ctx.moveTo(sx(x) + nudge, sy(y0)); ctx.lineTo(sx(x) + nudge, sy(y1)); }
      for (let y = y0; y <= y1; y++) {
        if (rowDist(y) % major === 0) { ctx.moveTo(sx(x0), sy(y) + nudge); ctx.lineTo(sx(x1), sy(y) + nudge); }
      }
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // Border.
    ctx.strokeStyle = t.major;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx(0) - 0.5, sy(0) - 0.5, sx(g.width) - sx(0) + 1, sy(g.height) - sy(0) + 1);

    // The current build step.
    if (build) {
      const r = build.steps.rect(build.step);
      outlineCells(ctx, sx(r.x), sy(r.y), sx(r.x + r.w) - sx(r.x), sy(r.y + r.h) - sy(r.y));
    }

    // Selection or floating area.
    const sel = f ? { x: f.x, y: f.y, w: f.clip.width, h: f.clip.height } : selection.current;
    if (sel) {
      dashedRect(ctx, sx(sel.x), sy(sel.y), sx(sel.x + sel.w) - sx(sel.x), sy(sel.y + sel.h) - sy(sel.y));
      if (d?.kind === 'select' || d?.kind === 'move') {
        label(ctx, `${sel.w} × ${sel.h}`, sx(sel.x), sy(sel.y) - 28, { top: p.showRulers ? RULER_H : 0, right: cw - (p.showRulers ? RULER_W : 0), bottom: ch });
      }
    }

    // Tool footprint under the cursor, and its mirror images.
    const h = hover.current;
    const footprint = p.tool !== 'select' && p.tool !== 'measure' && p.tool !== 'text' && !p.build;
    if (h && footprint && !space.current && d?.kind !== 'pan' && d?.kind !== 'shape' && d?.kind !== 'gradient' && d?.kind !== 'axis') {
      const pen = penOf(p);
      const rows = brushRows(pen?.size ?? 1, pen?.shape);
      outlineBrush(ctx, v, h.x, h.y, rows);
      for (const s of mirrorStamps(h.x, h.y, rows, axes)) outlineBrush(ctx, v, s.x, s.y, s.rows);
    }
    if (d?.kind === 'shape') {
      const fromCenter = (p.tool === 'ellipse' ? p.options.ellipse : p.options.rect).fromCenter;
      const [c0, c1] = p.tool === 'line' ? [d.a, d.b] : rectCorners(d.a, d.b, fromCenter);
      const r = rectBetween(c0, c1);
      label(ctx, `${r.w} × ${r.h}`, sx(d.b.x + 1) + 8, sy(d.b.y) - 28, { top: p.showRulers ? RULER_H : 0, right: cw - (p.showRulers ? RULER_W : 0), bottom: ch });
    }
    if (d?.kind === 'gradient') {
      const colour = (value: number) => {
        const c = rgb[value] ?? [128, 128, 128];
        return `rgb(${c[0]},${c[1]},${c[2]})`;
      };
      const end = p.blocks.findIndex((b) => b.id === p.options.gradient.to);
      drawGradientGuide(ctx, v, d.a, d.b, colour(p.currentBlock), colour(end >= 0 ? end : p.currentBlock));
    }
    if (hasMirror(axes)) drawAxes(ctx, v, g, axes, t.accent, p.showRulers);

    if (measure.current) drawMeasurement(ctx, v, measure.current, p.showRulers);

    if (p.showRulers) {
      const bands: { from: Cell; to: Cell; alpha: number }[] = [];
      if (measure.current) bands.push({ from: measure.current.a, to: measure.current.b, alpha: 0.28 });
      if (sel) bands.push({ from: { x: sel.x, y: sel.y }, to: { x: sel.x + sel.w - 1, y: sel.y + sel.h - 1 }, alpha: 0.2 });
      if (hover.current) bands.push({ from: hover.current, to: hover.current, alpha: 0.5 });
      drawRulers(ctx, v, t, g, p.orientation, bands);
    }
  };

  const shapeCells = (g: Grid, a: Cell, b: Cell) => {
    const { tool, options } = propsRef.current;
    if (tool === 'line') return lineCells(g, a, b, options.line.size, options.line.shape);
    if (tool === 'ellipse') {
      const { filled, thickness, fromCenter } = options.ellipse;
      const [c0, c1] = rectCorners(a, b, fromCenter);
      return ellipseCells(g, c0, c1, filled, thickness);
    }
    const { filled, thickness, rounding, fromCenter } = options.rect;
    const [c0, c1] = rectCorners(a, b, fromCenter);
    return rectCells(g, c0, c1, filled, thickness, rounding);
  };

  /** The mirror lines the current tool paints with: where each is, or null for none. */
  const axesFor = (p: Props, g: Grid): Axes => {
    const on = !p.build && MIRROR_TOOLS.includes(p.tool) ? p.options.mirror : { x: false, y: false };
    const at = axisPos.current;
    return { x: on.x ? at.x ?? centerAxis(g.width) : null, y: on.y ? at.y ?? centerAxis(g.height) : null };
  };

  /** The text tool's text as blocks, kept until the text or its scale changes. */
  const textBitmap = (p: Props): TextBitmap | null => {
    const { value, scale } = p.options.text;
    const key = `${scale}|${value}`;
    if (textCache.current.key !== key) textCache.current = { key, bitmap: renderText(value, scale) };
    return textCache.current.bitmap;
  };

  /** The blocks of a gradient being dragged out, one per cell of its area; null until it has a direction. */
  const gradientBlocks = (p: Props, g: Grid, d: { a: Cell; b: Cell; area: number[] }): Uint16Array | null => {
    const end = p.blocks.findIndex((b) => b.id === p.options.gradient.to);
    if (end < 0 || (d.a.x === d.b.x && d.a.y === d.b.y)) return null;
    const colour = (value: number): PaletteColor => ({ value, rgb: faceOf(p.blocks[value], p.orientation).rgb });
    return gradientFill(g.width, d.area, d.a, d.b, colour(p.currentBlock), colour(end), p.palette, p.options.gradient.dither);
  };

  /** Which cells a click of fill / replace treats as the clicked block: the same block, or ones close in colour. */
  const similarFor = (tolerance: number) => {
    const { blocks, orientation } = propsRef.current;
    return similarBlocks(blocks.map((b) => faceOf(b, orientation).rgb), tolerance);
  };

  const drawRef = useRef(draw);
  drawRef.current = draw;
  const requestDraw = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      drawRef.current();
    });
  };

  const fit = () => {
    const p = propsRef.current;
    const g = p.grid;
    const v = view.current;
    if (!g || !v.cw || !v.ch) return;
    const rw = p.showRulers ? RULER_W : 0, rh = p.showRulers ? RULER_H : 0;
    const s = clamp(Math.min((v.cw - rw - 40) / g.width, (v.ch - rh - 40) / g.height), MIN_SCALE, MAX_SCALE);
    v.scale = s;
    v.ox = Math.round((v.cw - rw - g.width * s) / 2);
    v.oy = Math.round(rh + (v.ch - rh - g.height * s) / 2);
    p.onZoom(s);
    requestDraw();
  };

  const setMeasure = (m: Measurement | null) => {
    measure.current = m;
    propsRef.current.onMeasure(m);
    requestDraw();
  };

  // ---- selection ---------------------------------------------------------------------------

  const report = () => {
    const f = floating.current;
    propsRef.current.onSelection({
      rect: f ? { x: f.x, y: f.y, w: f.clip.width, h: f.clip.height } : selection.current,
      floating: !!f,
      clipboard: !!clipboard,
    });
  };

  const edited = () => {
    colorDirty.current = true;
    propsRef.current.onEdit();
    requestDraw();
  };

  const commitFloating = (): boolean => {
    const f = floating.current;
    const { grid: g, history } = propsRef.current;
    if (!f || !g) return false;
    history.begin();
    if (f.source) fillRect(g, history, f.source, AIR);
    stampClip(g, history, f.clip, f.x, f.y, propsRef.current.options.select.airTransparent);
    const changed = history.commit(g);
    floating.current = null;
    selection.current = clipRect({ x: f.x, y: f.y, w: f.clip.width, h: f.clip.height }, g.width, g.height);
    report();
    if (changed) edited();
    else requestDraw();
    return true;
  };

  const cancelFloating = (): boolean => {
    const f = floating.current;
    if (!f) return false;
    floating.current = null;
    selection.current = f.source;
    report();
    requestDraw();
    return true;
  };

  /** Turns the selection into a floating piece that can be moved; the original area clears when it is placed. */
  const lift = (): Floating | null => {
    const g = propsRef.current.grid;
    const sel = selection.current && g ? clipRect(selection.current, g.width, g.height) : null;
    if (!g || !sel) return null;
    floating.current = { clip: copyRegion(g, sel), x: sel.x, y: sel.y, source: sel };
    selection.current = null;
    return floating.current;
  };

  const clearSelection = () => {
    if (floating.current) commitFloating();
    if (selection.current) {
      selection.current = null;
      report();
      requestDraw();
    }
  };

  const copy = (): boolean => {
    const g = propsRef.current.grid;
    const f = floating.current;
    if (f) clipboard = f.clip;
    else if (g && selection.current) clipboard = copyRegion(g, selection.current);
    else return false;
    report();
    return true;
  };

  const deleteSelection = (): boolean => {
    const { grid: g, history } = propsRef.current;
    if (!g) return false;
    const f = floating.current;
    if (f) {
      floating.current = null;
      if (f.source) {
        history.begin();
        fillRect(g, history, f.source, AIR);
        if (history.commit(g)) edited();
      }
      report();
      requestDraw();
      return true;
    }
    if (!selection.current) return false;
    history.begin();
    fillRect(g, history, selection.current, AIR);
    if (history.commit(g)) edited();
    return true;
  };

  const paste = (): boolean => {
    const p = propsRef.current;
    const g = p.grid;
    if (!g || !clipboard) return false;
    if (floating.current) commitFloating();
    const v = view.current;
    let x: number, y: number;
    if (selection.current) {
      ({ x, y } = selection.current);
    } else {
      // Centre of the view, kept inside the art where possible.
      x = Math.floor((v.cw / 2 - v.ox) / v.scale - clipboard.width / 2);
      y = Math.floor((v.ch / 2 - v.oy) / v.scale - clipboard.height / 2);
      x = clamp(x, 0, Math.max(0, g.width - clipboard.width));
      y = clamp(y, 0, Math.max(0, g.height - clipboard.height));
    }
    floating.current = { clip: clipboard, x, y, source: null };
    selection.current = null;
    if (p.tool !== 'select') p.onToolChange('select');
    report();
    requestDraw();
    return true;
  };

  const transform = (op: ClipTransform): boolean => {
    const { grid: g, history } = propsRef.current;
    if (!g) return false;
    const quarter = op === 'rotCW' || op === 'rotCCW';
    let f = floating.current;
    if (!f && quarter) f = lift();
    if (f) {
      const t = transformClip(f.clip, op);
      // Turn around the centre.
      f.x += Math.floor((f.clip.width - t.width) / 2);
      f.y += Math.floor((f.clip.height - t.height) / 2);
      f.clip = t;
      report();
      requestDraw();
      return true;
    }
    if (quarter) return false;
    const r = selection.current ?? { x: 0, y: 0, w: g.width, h: g.height };
    if (transformRegion(g, history, r, op as 'flipH' | 'flipV' | 'rot180')) edited();
    return true;
  };

  const selectAll = () => {
    const p = propsRef.current;
    const g = p.grid;
    if (!g) return;
    if (floating.current) commitFloating();
    selection.current = { x: 0, y: 0, w: g.width, h: g.height };
    if (p.tool !== 'select') p.onToolChange('select');
    report();
    requestDraw();
  };

  useImperativeHandle(props.handleRef, () => ({
    copy,
    cut: () => copy() && deleteSelection(),
    paste,
    deleteSelection,
    selectAll,
    transform,
    commitFloating,
    cancelFloating,
  }));

  const updateCursor = () => {
    const c = canvasRef.current;
    if (!c) return;
    const d = drag.current;
    let cursor = 'crosshair';
    if (d?.kind === 'pan') cursor = 'grabbing';
    else if (space.current) cursor = 'grab';
    else if (d?.kind === 'axis' || axisHover.current) cursor = (d?.kind === 'axis' ? d.axis : axisHover.current) === 'x' ? 'ew-resize' : 'ns-resize';
    else if (d?.kind === 'move') cursor = 'move';
    else if (propsRef.current.build) cursor = hover.current ? 'pointer' : 'default';
    else if (propsRef.current.tool === 'select' && hover.current) {
      const f = floating.current;
      const r = f ? { x: f.x, y: f.y, w: f.clip.width, h: f.clip.height } : selection.current;
      if (r && inRect(r, hover.current)) cursor = 'move';
    }
    c.style.cursor = cursor;
  };

  // ---- effects -----------------------------------------------------------------------------

  // Theme colours come from CSS variables so the canvas follows light/dark mode.
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      const get = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb;
      theme.current = {
        checkA: get('--checker-a', '#d9dce2'),
        checkB: get('--checker-b', '#c9cdd5'),
        line: get('--grid-line', 'rgba(0,0,0,0.12)'),
        major: get('--grid-major', 'rgba(0,0,0,0.35)'),
        rulerBg: get('--background', '#ffffff'),
        rulerText: get('--muted-foreground', '#737373'),
        rulerLine: get('--border', '#e5e5e5'),
        accent: get('--brand', '#2f7d3c'),
        dim: get('--stage', '#f0f0f0'),
      };
      requestDraw();
    };
    read();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);

  // Canvas follows its container size.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const v = view.current;
      const first = !v.cw;
      v.cw = r.width;
      v.ch = r.height;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      if (first) fit();
      requestDraw();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // A new grid (generated, opened, resized): fit when its size changed, and drop selections that belonged to the old one.
  useEffect(() => {
    const g = props.grid;
    if (floating.current || selection.current) {
      floating.current = null;
      selection.current = null;
      report();
    }
    const key = g ? `${g.width}x${g.height}` : '';
    if (key !== fittedFor.current) {
      fittedFor.current = key;
      axisPos.current = { x: null, y: null }; // the mirror lines go back to the middle of the new size
      if (measure.current) setMeasure(null);
      if (key) fit();
    }
  }, [props.grid]);

  useEffect(() => {
    if (props.fitSignal) fit();
  }, [props.fitSignal]);

  useEffect(() => {
    colorDirty.current = true;
    requestDraw();
  }, [props.grid, props.version, props.orientation, props.blocks]);

  useEffect(() => {
    requestDraw();
  }, [
    props.viewMode, props.showGrid, props.showRulers, props.atlas, props.tool, props.options, props.overlay, props.overlayOpacity, props.highlight,
    props.build,
  ]);

  // Leaving the select tool, or starting to build, places a floating selection; building also drops the selection.
  const building = !!props.build;
  useEffect(() => {
    if ((props.tool !== 'select' || building) && floating.current) commitFloating();
    if (building && selection.current) {
      selection.current = null;
      report();
      requestDraw();
    }
    updateCursor();
  }, [props.tool, building]);

  // Moving to a step that is out of view (next / previous, or done) brings it to the middle.
  useEffect(() => {
    const b = props.build;
    const v = view.current;
    if (!b || !v.cw || !v.ch) return;
    const r = b.steps.rect(b.step);
    const rw = props.showRulers ? RULER_W : 0, rh = props.showRulers ? RULER_H : 0;
    const left = v.ox + r.x * v.scale, right = left + r.w * v.scale;
    const top = v.oy + r.y * v.scale, bottom = top + r.h * v.scale;
    if (right > 0 && left < v.cw - rw && bottom > rh && top < v.ch) return;
    v.ox += (v.cw - rw) / 2 - (left + right) / 2;
    v.oy += (rh + v.ch) / 2 - (top + bottom) / 2;
    requestDraw();
  }, [props.build?.steps, props.build?.step]);

  // Wheel zoom around the cursor (needs a non-passive listener to stop page scroll).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const v = view.current;
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
      const ns = clamp(v.scale * Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015)), MIN_SCALE, MAX_SCALE);
      v.ox = mx - ((mx - v.ox) * ns) / v.scale;
      v.oy = my - ((my - v.oy) * ns) / v.scale;
      v.scale = ns;
      propsRef.current.onZoom(ns);
      requestDraw();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // Keys handled here: Space (pan), Escape, Enter and the selection shortcuts.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (e.key === 'Escape') {
        if (drag.current?.kind === 'shape' || drag.current?.kind === 'gradient' || drag.current?.kind === 'select') {
          drag.current = null;
          requestDraw();
        } else if (cancelFloating()) {
          // placed nothing
        } else if (measure.current) setMeasure(null);
        else if (selection.current) clearSelection();
        return;
      }
      if (e.key === 'Enter' && floating.current) {
        e.preventDefault();
        commitFloating();
        return;
      }
      if (!propsRef.current.grid) return;
      const building = !!propsRef.current.build; // nothing is edited then, but the view still pans
      if (ctrl && !e.shiftKey && !e.altKey) {
        if (building) return;
        if (k === 'c' && copy()) e.preventDefault();
        else if (k === 'x' && copy() && deleteSelection()) e.preventDefault();
        else if (k === 'v' && paste()) e.preventDefault();
        else if (k === 'a') {
          e.preventDefault();
          selectAll();
        }
        return;
      }
      if (!building && (e.key === 'Delete' || e.key === 'Backspace') && deleteSelection()) {
        e.preventDefault();
        return;
      }
      if (e.code !== 'Space') return;
      e.preventDefault();
      if (!space.current) { space.current = true; updateCursor(); requestDraw(); }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      space.current = false;
      updateCursor();
      requestDraw();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Reset the handle too: under StrictMode's mount/unmount/mount a stale non-zero handle would block every later redraw.
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    },
    [],
  );

  // ---- pointer input -----------------------------------------------------------------------

  const local = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { mx: e.clientX - r.left, my: e.clientY - r.top };
  };

  const cellAt = (e: React.PointerEvent): Cell => {
    const { mx, my } = local(e);
    const v = view.current;
    return { x: Math.floor((mx - v.ox) / v.scale), y: Math.floor((my - v.oy) / v.scale) };
  };

  const onRuler = (e: React.PointerEvent) => {
    if (!propsRef.current.showRulers) return false;
    const { mx, my } = local(e);
    return my < RULER_H || mx > view.current.cw - RULER_W;
  };

  const inside = (g: Grid, c: Cell) => c.x >= 0 && c.y >= 0 && c.x < g.width && c.y < g.height;
  const clampCell = (g: Grid, c: Cell): Cell => ({ x: clamp(c.x, 0, g.width - 1), y: clamp(c.y, 0, g.height - 1) });

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = propsRef.current;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.button === 1 || (e.button === 0 && space.current)) {
      e.preventDefault();
      const v = view.current;
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: v.ox, oy: v.oy };
      updateCursor();
      return;
    }
    const g = p.grid;
    if (!g || onRuler(e)) return;
    const c = cellAt(e);

    // Building: a click picks the step under the cursor and nothing is edited.
    if (p.build) {
      if (e.button === 0 && inside(g, c)) p.build.onStep(p.build.steps.at(c.x, c.y));
      return;
    }

    // A mirror line is moved by its handle.
    if (e.button === 0) {
      const axes = axesFor(p, g);
      const { mx, my } = local(e);
      const hit = hasMirror(axes) ? axisAt(view.current, axes, mx, my, p.showRulers) : null;
      if (hit) {
        drag.current = { kind: 'axis', axis: hit };
        updateCursor();
        return;
      }
    }

    // The select tool may grab a floating piece hanging over the edge.
    if (p.tool === 'select' && e.button === 0) {
      const f = floating.current;
      if (f && inRect({ x: f.x, y: f.y, w: f.clip.width, h: f.clip.height }, c)) {
        drag.current = { kind: 'move', dx: c.x - f.x, dy: c.y - f.y };
        updateCursor();
        return;
      }
      if (!f && selection.current && inRect(selection.current, c) && !e.shiftKey) {
        const lifted = lift();
        if (lifted) {
          drag.current = { kind: 'move', dx: c.x - lifted.x, dy: c.y - lifted.y };
          report();
          updateCursor();
          return;
        }
      }
      if (f) commitFloating();
      const start = clampCell(g, c);
      selection.current = { ...start, w: 1, h: 1 };
      drag.current = { kind: 'select', a: start };
      report();
      requestDraw();
      return;
    }

    if (!inside(g, c)) return;
    const i = c.y * g.width + c.x;

    // Right click or Alt+click picks a block with any tool.
    if (e.button === 2 || (e.button === 0 && (e.altKey || p.tool === 'picker'))) {
      p.onPick(g.cells[i]);
      return;
    }
    if (e.button !== 0) return;

    if (p.tool === 'measure') {
      drag.current = { kind: 'measure' };
      setMeasure({ a: c, b: c });
    } else if (p.tool === 'brush' || p.tool === 'eraser') {
      const value = p.tool === 'eraser' ? AIR : p.currentBlock;
      const pen = penOf(p)!;
      p.history.begin();
      paintLine(g, mirrored(p.history, axesFor(p, g)), c.x, c.y, c.x, c.y, pen.size, value, pen.shape);
      drag.current = { kind: 'paint', lx: c.x, ly: c.y, value, size: pen.size, shape: pen.shape };
      colorDirty.current = true;
      requestDraw();
    } else if (p.tool === 'line' || p.tool === 'rect' || p.tool === 'ellipse') {
      drag.current = { kind: 'shape', a: c, b: c };
      requestDraw();
    } else if (p.tool === 'gradient') {
      // Pressing inside a selection fills the selection; elsewhere it fills the region of identical blocks, like a bucket.
      const sel = selection.current ? clipRect(selection.current, g.width, g.height) : null;
      const area = sel && inRect(sel, c)
        ? rectCells(g, { x: sel.x, y: sel.y }, { x: sel.x + sel.w - 1, y: sel.y + sel.h - 1 }, true, 1)
        : regionCells(g, c.x, c.y);
      drag.current = { kind: 'gradient', a: c, b: c, area, result: null };
      requestDraw();
    } else if (p.tool === 'text') {
      const text = textBitmap(p);
      if (text && paintCells(g, p.history, textCells(text, g.width, g.height, c.x, c.y), p.currentBlock)) edited();
    } else if (p.tool === 'fill') {
      const { diagonal, tolerance } = p.options.fill;
      if (floodFill(g, p.history, c.x, c.y, p.currentBlock, { diagonal, similar: similarFor(tolerance) }) > 0) edited();
    } else if (p.tool === 'replace') {
      if (replaceAll(g, p.history, g.cells[i], p.currentBlock, similarFor(p.options.replace.tolerance)) > 0) edited();
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = propsRef.current;
    const d = drag.current;
    if (d?.kind === 'pan') {
      const v = view.current;
      v.ox = d.ox + e.clientX - d.sx;
      v.oy = d.oy + e.clientY - d.sy;
      requestDraw();
      return;
    }
    const g = p.grid;
    if (!g) return;
    const c = cellAt(e);
    const h = inside(g, c) && !onRuler(e) ? c : null;
    const prev = hover.current;
    if (h?.x !== prev?.x || h?.y !== prev?.y) {
      hover.current = h;
      p.onHover(h);
      updateCursor();
      requestDraw();
    }
    if (!d) {
      const { mx, my } = local(e);
      const axes = axesFor(p, g);
      const over = hasMirror(axes) ? axisAt(view.current, axes, mx, my, p.showRulers) : null;
      if (over !== axisHover.current) {
        axisHover.current = over;
        updateCursor();
      }
    }
    if (d?.kind === 'axis') {
      const { mx, my } = local(e);
      const v = view.current;
      const k = d.axis === 'x' ? snapAxis((mx - v.ox) / v.scale, g.width) : snapAxis((my - v.oy) / v.scale, g.height);
      if (axisPos.current[d.axis] !== k) {
        axisPos.current[d.axis] = k;
        requestDraw();
      }
    } else if (d?.kind === 'measure' && measure.current) {
      const a = measure.current.a;
      let b = clampCell(g, c);
      if (e.shiftKey) b = lockAxis(a, b);
      if (b.x !== measure.current.b.x || b.y !== measure.current.b.y) setMeasure({ a, b });
    } else if (d?.kind === 'paint') {
      const x = clamp(c.x, -d.size, g.width + d.size);
      const y = clamp(c.y, -d.size, g.height + d.size);
      if (x !== d.lx || y !== d.ly) {
        paintLine(g, mirrored(p.history, axesFor(p, g)), d.lx, d.ly, x, y, d.size, d.value, d.shape);
        d.lx = x;
        d.ly = y;
        colorDirty.current = true;
        requestDraw();
      }
    } else if (d?.kind === 'shape') {
      let b = { x: clamp(c.x, -1, g.width), y: clamp(c.y, -1, g.height) };
      if (e.shiftKey) b = p.tool === 'line' ? snapLine(d.a, b) : snapSquare(d.a, b);
      if (b.x !== d.b.x || b.y !== d.b.y) {
        d.b = b;
        requestDraw();
      }
    } else if (d?.kind === 'gradient') {
      let b = clampCell(g, c);
      if (e.shiftKey) b = snapLine(d.a, b);
      if (b.x !== d.b.x || b.y !== d.b.y) {
        d.b = b;
        d.result = d.area.length <= GRADIENT_PREVIEW_MAX ? gradientBlocks(p, g, d) : null;
        requestDraw();
      }
    } else if (d?.kind === 'select') {
      const b = clampCell(g, c);
      const r = rectBetween(d.a, b);
      const s = selection.current;
      if (!s || s.x !== r.x || s.y !== r.y || s.w !== r.w || s.h !== r.h) {
        selection.current = r;
        report();
        requestDraw();
      }
    } else if (d?.kind === 'move' && floating.current) {
      const f = floating.current;
      const x = c.x - d.dx, y = c.y - d.dy;
      if (x !== f.x || y !== f.y) {
        f.x = x;
        f.y = y;
        report();
        requestDraw();
      }
    }
  };

  const endDrag = () => {
    const p = propsRef.current;
    const d = drag.current;
    drag.current = null;
    const g = p.grid;
    if (d?.kind === 'paint' && g && p.history.commit(g)) p.onEdit();
    if (d?.kind === 'shape' && g && paintCells(g, p.history, withMirror(shapeCells(g, d.a, d.b), g.width, g.height, axesFor(p, g)), p.currentBlock)) edited();
    if (d?.kind === 'gradient' && g) {
      const blocks = d.result ?? gradientBlocks(p, g, d);
      if (blocks) {
        p.history.begin();
        d.area.forEach((i, k) => p.history.set(g, i, blocks[k]));
        if (p.history.commit(g)) edited();
      }
    }
    // A click without dragging clears the measurement / selection.
    const m = measure.current;
    if (d?.kind === 'measure' && m && m.a.x === m.b.x && m.a.y === m.b.y) setMeasure(null);
    const s = selection.current;
    if (d?.kind === 'select' && s && s.w === 1 && s.h === 1) {
      selection.current = null;
      report();
    }
    updateCursor();
    requestDraw();
  };

  const onPointerLeave = () => {
    if (axisHover.current) {
      axisHover.current = null;
      updateCursor();
    }
    if (hover.current) {
      hover.current = null;
      propsRef.current.onHover(null);
      requestDraw();
    }
  };

  return (
    <div className="absolute inset-0 overflow-hidden [&_canvas]:block [&_canvas]:touch-none" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={() => drag.current && endDrag()}
        onPointerLeave={onPointerLeave}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor: 'crosshair' }}
        aria-label="Pixel art editor canvas"
      />
    </div>
  );
}
