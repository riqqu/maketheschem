import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { brushCells, floodFill, paintLine, replaceAll, type Grid, type History } from '../core/grid';
import { lockAxis, rowLineDistance, type Cell, type Measurement } from '../core/measure';
import {
  clipRect, copyRegion, fillRect, inRect, lineCells, paintCells, rectBetween, rectCells, snapLine, snapSquare, stampClip,
  transformClip, transformRegion, type Clip, type ClipTransform, type Rect,
} from '../core/shapes';
import { AIR, faceOf, type BlockInfo, type Orientation } from '../core/types';
import { colorCanvas } from '../lib/render';
import { dashedRect, drawMeasurement, drawRulers, label, outlineCells, RULER_H, RULER_W, screen, type Theme, type View } from './editorDraw';

export type Tool = 'brush' | 'eraser' | 'picker' | 'fill' | 'replace' | 'measure' | 'line' | 'rect' | 'select';
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
  brushSize: number;
  rectFilled: boolean;
  currentBlock: number;
  history: History;
  fitSignal: number;
  /** Source image drawn over the blocks for comparison, or null. */
  overlay: HTMLImageElement | null;
  overlayOpacity: number;
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

interface Floating {
  clip: Clip;
  x: number;
  y: number;
  /** Where a moved selection came from (cleared when it is placed); null for a paste. */
  source: Rect | null;
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'paint'; lx: number; ly: number; value: number }
  | { kind: 'measure' }
  | { kind: 'shape'; a: Cell; b: Cell }
  | { kind: 'select'; a: Cell }
  | { kind: 'move'; dx: number; dy: number };

/** Survives switching between arts. */
let clipboard: Clip | null = null;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
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
  const theme = useRef<Theme>({
    checkA: '#d9dce2',
    checkB: '#c9cdd5',
    line: 'rgba(0,0,0,0.12)',
    major: 'rgba(0,0,0,0.35)',
    rulerBg: '#ffffff',
    rulerText: '#646c79',
    rulerLine: '#c7ccd5',
    accent: '#2f7d3c',
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
      const dx = sx(x), dy = sy(y), dw = sx(x + 1) - dx, dh = sy(y + 1) - dy;
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

    // Line / rectangle preview.
    const d = drag.current;
    if (d?.kind === 'shape') {
      for (const i of shapeCells(g, d.a, d.b)) {
        const x = i % g.width, y = (i - x) / g.width;
        if (x >= x0 && x < x1 && y >= y0 && y < y1) drawBlock(p.currentBlock, x, y, 0.85);
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

    // Grid lines: every block when zoomed in, and every 10 blocks (same origin as the rulers) for counting.
    const rowDist = (r: number) => rowLineDistance(r, g.height, p.orientation);
    if (p.showGrid) {
      ctx.lineWidth = 1;
      if (scale >= 16) {
        ctx.strokeStyle = t.line;
        ctx.beginPath();
        for (let x = x0; x <= x1; x++) { ctx.moveTo(sx(x) + 0.5, sy(y0)); ctx.lineTo(sx(x) + 0.5, sy(y1)); }
        for (let y = y0; y <= y1; y++) { ctx.moveTo(sx(x0), sy(y) + 0.5); ctx.lineTo(sx(x1), sy(y) + 0.5); }
        ctx.stroke();
      }
      if (scale >= 1.5) {
        ctx.strokeStyle = t.major;
        ctx.beginPath();
        for (let x = Math.ceil(x0 / MAJOR) * MAJOR; x <= x1; x += MAJOR) { ctx.moveTo(sx(x) + 0.5, sy(y0)); ctx.lineTo(sx(x) + 0.5, sy(y1)); }
        for (let y = y0; y <= y1; y++) {
          if (rowDist(y) % MAJOR === 0) { ctx.moveTo(sx(x0), sy(y) + 0.5); ctx.lineTo(sx(x1), sy(y) + 0.5); }
        }
        ctx.stroke();
      }
    }

    // Border.
    ctx.strokeStyle = t.major;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx(0) - 0.5, sy(0) - 0.5, sx(g.width) - sx(0) + 1, sy(g.height) - sy(0) + 1);

    // Selection or floating area.
    const sel = f ? { x: f.x, y: f.y, w: f.clip.width, h: f.clip.height } : selection.current;
    if (sel) {
      dashedRect(ctx, sx(sel.x), sy(sel.y), sx(sel.x + sel.w) - sx(sel.x), sy(sel.y + sel.h) - sy(sel.y));
      if (d?.kind === 'select' || d?.kind === 'move') {
        label(ctx, `${sel.w} × ${sel.h}`, sx(sel.x), sy(sel.y) - 28, { top: p.showRulers ? RULER_H : 0, right: cw - (p.showRulers ? RULER_W : 0), bottom: ch });
      }
    }

    // Tool footprint under the cursor.
    const h = hover.current;
    const footprint = p.tool !== 'select' && p.tool !== 'measure';
    if (h && footprint && !space.current && d?.kind !== 'pan' && d?.kind !== 'shape') {
      const size = p.tool === 'brush' || p.tool === 'eraser' || p.tool === 'line' ? p.brushSize : 1;
      const cells = brushCells(g, h.x, h.y, size);
      if (cells.length) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const i of cells) {
          const cx = i % g.width, cy = (i - cx) / g.width;
          minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
        }
        outlineCells(ctx, sx(minX), sy(minY), sx(maxX + 1) - sx(minX), sy(maxY + 1) - sy(minY));
      }
    }
    if (d?.kind === 'shape') {
      const r = rectBetween(d.a, d.b);
      label(ctx, `${r.w} × ${r.h}`, sx(d.b.x + 1) + 8, sy(d.b.y) - 28, { top: p.showRulers ? RULER_H : 0, right: cw - (p.showRulers ? RULER_W : 0), bottom: ch });
    }

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
    const p = propsRef.current;
    return p.tool === 'line' ? lineCells(g, a, b, p.brushSize) : rectCells(g, a, b, p.rectFilled, p.brushSize);
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
    stampClip(g, history, f.clip, f.x, f.y, true);
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
    else if (d?.kind === 'move') cursor = 'move';
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
        rulerBg: get('--panel', '#ffffff'),
        rulerText: get('--muted', '#646c79'),
        rulerLine: get('--border-strong', '#c7ccd5'),
        accent: get('--accent', '#2f7d3c'),
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
  }, [props.viewMode, props.showGrid, props.showRulers, props.atlas, props.tool, props.brushSize, props.overlay, props.overlayOpacity]);

  // Leaving the select tool places a floating selection.
  useEffect(() => {
    if (props.tool !== 'select' && floating.current) commitFloating();
    updateCursor();
  }, [props.tool]);

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
        if (drag.current?.kind === 'shape' || drag.current?.kind === 'select') {
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
      if (ctrl && !e.shiftKey && !e.altKey) {
        if (k === 'c' && copy()) e.preventDefault();
        else if (k === 'x' && copy() && deleteSelection()) e.preventDefault();
        else if (k === 'v' && paste()) e.preventDefault();
        else if (k === 'a') {
          e.preventDefault();
          selectAll();
        }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && deleteSelection()) {
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
      p.history.begin();
      paintLine(g, p.history, c.x, c.y, c.x, c.y, p.brushSize, value);
      drag.current = { kind: 'paint', lx: c.x, ly: c.y, value };
      colorDirty.current = true;
      requestDraw();
    } else if (p.tool === 'line' || p.tool === 'rect') {
      drag.current = { kind: 'shape', a: c, b: c };
      requestDraw();
    } else if (p.tool === 'fill') {
      if (floodFill(g, p.history, c.x, c.y, p.currentBlock) > 0) edited();
    } else if (p.tool === 'replace') {
      if (replaceAll(g, p.history, g.cells[i], p.currentBlock) > 0) edited();
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
    if (d?.kind === 'measure' && measure.current) {
      const a = measure.current.a;
      let b = clampCell(g, c);
      if (e.shiftKey) b = lockAxis(a, b);
      if (b.x !== measure.current.b.x || b.y !== measure.current.b.y) setMeasure({ a, b });
    } else if (d?.kind === 'paint') {
      const x = clamp(c.x, -p.brushSize, g.width + p.brushSize);
      const y = clamp(c.y, -p.brushSize, g.height + p.brushSize);
      if (x !== d.lx || y !== d.ly) {
        paintLine(g, p.history, d.lx, d.ly, x, y, p.brushSize, d.value);
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
    if (d?.kind === 'shape' && g && paintCells(g, p.history, shapeCells(g, d.a, d.b), p.currentBlock)) edited();
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
    if (hover.current) {
      hover.current = null;
      propsRef.current.onHover(null);
      requestDraw();
    }
  };

  return (
    <div className="editor" ref={wrapRef}>
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
