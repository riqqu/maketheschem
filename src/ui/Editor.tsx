import { useEffect, useRef } from 'react';
import { brushCells, floodFill, paintLine, replaceAll, type Grid, type History } from '../core/grid';
import { lockAxis, measureLabel, rowLineDistance, rulerSteps, type Cell, type Measurement } from '../core/measure';
import { AIR, faceOf, type BlockInfo, type Orientation } from '../core/types';

export type Tool = 'brush' | 'eraser' | 'picker' | 'fill' | 'replace' | 'measure';
export type ViewMode = 'textures' | 'colors';

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
  currentBlock: number;
  history: History;
  fitSignal: number;
  onEdit: () => void;
  onPick: (value: number) => void;
  onHover: (cell: Cell | null) => void;
  onZoom: (scale: number) => void;
  onMeasure: (m: Measurement | null) => void;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 64;
/** Below this many screen pixels per block, textures are unreadable - draw average colours instead. */
const TEXTURE_MIN_SCALE = 6;
/** Thick grid lines every this many blocks (matches the ruler numbering). */
const MAJOR = 10;
/** Ruler thickness: horizontal ruler along the top, vertical ruler along the right edge. */
const RULER_H = 20;
const RULER_W = 34;
const FONT = '10.5px system-ui, -apple-system, "Segoe UI", sans-serif';

type Drag =
  | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'paint'; lx: number; ly: number; value: number }
  | { kind: 'measure' };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function Editor(props: Props) {
  const propsRef = useRef(props);
  propsRef.current = props;

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef({ scale: 8, ox: 0, oy: 0, cw: 0, ch: 0 });
  const colorCanvas = useRef<HTMLCanvasElement | null>(null);
  const colorDirty = useRef(true);
  const hover = useRef<Cell | null>(null);
  const measure = useRef<Measurement | null>(null);
  const drag = useRef<Drag | null>(null);
  const space = useRef(false);
  const frame = useRef(0);
  const fittedFor = useRef('');
  const theme = useRef({
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

  const rebuildColors = (g: Grid) => {
    const { blocks, orientation } = propsRef.current;
    let c = colorCanvas.current;
    if (!c) c = colorCanvas.current = document.createElement('canvas');
    if (c.width !== g.width || c.height !== g.height) {
      c.width = g.width;
      c.height = g.height;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(g.width, g.height);
    const lut = new Uint8Array(blocks.length * 3);
    blocks.forEach((b, i) => lut.set(faceOf(b, orientation).rgb, i * 3));
    for (let i = 0; i < g.cells.length; i++) {
      const v = g.cells[i];
      if (v === AIR || v >= blocks.length) continue;
      img.data[i * 4] = lut[v * 3];
      img.data[i * 4 + 1] = lut[v * 3 + 1];
      img.data[i * 4 + 2] = lut[v * 3 + 2];
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    colorDirty.current = false;
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const p = propsRef.current;
    const { scale, ox, oy, cw, ch } = view.current;
    canvas.dataset.view = `${scale},${ox},${oy}`; // read by the browser tests to locate cells
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const g = p.grid;
    if (!g) return;

    const sx = (x: number) => Math.round(ox + x * scale);
    const sy = (y: number) => Math.round(oy + y * scale);
    const x0 = clamp(Math.floor(-ox / scale), 0, g.width);
    const x1 = clamp(Math.ceil((cw - ox) / scale), 0, g.width);
    const y0 = clamp(Math.floor(-oy / scale), 0, g.height);
    const y1 = clamp(Math.ceil((ch - oy) / scale), 0, g.height);
    const t = theme.current;

    // Air shows as a checkerboard (one square per block when zoomed in).
    ctx.fillStyle = t.checkA;
    ctx.fillRect(sx(0), sy(0), sx(g.width) - sx(0), sy(g.height) - sy(0));
    if (scale >= 4) {
      ctx.fillStyle = t.checkB;
      for (let y = y0; y < y1; y++) {
        for (let x = x0 + ((x0 + y) % 2); x < x1; x += 2) ctx.fillRect(sx(x), sy(y), sx(x + 1) - sx(x), sy(y + 1) - sy(y));
      }
    }

    ctx.imageSmoothingEnabled = false;
    const useTextures = p.viewMode === 'textures' && scale >= TEXTURE_MIN_SCALE && p.atlas;
    if (useTextures && p.atlas) {
      const { tileSize: ts, atlasColumns: cols, blocks, orientation } = p;
      const tiles = blocks.map((b) => faceOf(b, orientation).tile);
      for (let y = y0; y < y1; y++) {
        const dy = sy(y), dh = sy(y + 1) - dy;
        for (let x = x0; x < x1; x++) {
          const v = g.cells[y * g.width + x];
          if (v === AIR || v >= tiles.length) continue;
          const tile = tiles[v];
          const dx = sx(x);
          ctx.drawImage(p.atlas, (tile % cols) * ts, Math.floor(tile / cols) * ts, ts, ts, dx, dy, sx(x + 1) - dx, dh);
        }
      }
    } else {
      if (colorDirty.current || !colorCanvas.current) rebuildColors(g);
      if (colorCanvas.current) ctx.drawImage(colorCanvas.current, sx(0), sy(0), sx(g.width) - sx(0), sy(g.height) - sy(0));
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

    // Tool footprint under the cursor.
    const h = hover.current;
    if (h && !space.current && drag.current?.kind !== 'pan') {
      const size = p.tool === 'brush' || p.tool === 'eraser' ? p.brushSize : 1;
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

    // Measurement: span box, centre-to-centre line, end blocks and a label.
    const m = measure.current;
    if (m) {
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
      const ax = ox + (m.a.x + 0.5) * scale, ay = oy + (m.a.y + 0.5) * scale;
      const bx = ox + (m.b.x + 0.5) * scale, by = oy + (m.b.y + 0.5) * scale;
      ctx.lineCap = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.lineCap = 'butt';

      const text = measureLabel(m);
      ctx.font = `600 12px system-ui, -apple-system, "Segoe UI", sans-serif`;
      const tw = Math.ceil(ctx.measureText(text).width) + 14;
      const top = p.showRulers ? RULER_H : 0, right = cw - (p.showRulers ? RULER_W : 0);
      const lx = clamp(bx + 12, 4, right - tw - 4);
      const ly = clamp(by - 30, top + 4, ch - 26);
      ctx.fillStyle = 'rgba(18,20,24,0.9)';
      ctx.beginPath();
      ctx.roundRect(lx, ly, tw, 22, 5);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(text, lx + 7, ly + 11.5);
    }

    if (p.showRulers) drawRulers(ctx, g, p.orientation);
  };

  /** Black + white outline that stays visible on any block colour. */
  const outlineCells = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  };

  /**
   * Rulers in screen space: block distances from the art's origin corner (left edge; bottom for walls, north edge
   * for floors). Tick spacing adapts to the zoom. Hovered and measured blocks are highlighted on both rulers.
   */
  const drawRulers = (ctx: CanvasRenderingContext2D, g: Grid, orientation: Orientation) => {
    const { scale, ox, oy, cw, ch } = view.current;
    const t = theme.current;
    const { label, minor } = rulerSteps(scale);
    const sx = (x: number) => Math.round(ox + x * scale);
    const sy = (y: number) => Math.round(oy + y * scale);
    const right = cw - RULER_W;
    const rowDist = (r: number) => rowLineDistance(r, g.height, orientation);

    ctx.save();
    ctx.font = FONT;
    ctx.fillStyle = t.rulerBg;
    ctx.fillRect(0, 0, cw, RULER_H);
    ctx.fillRect(right, 0, RULER_W, ch);

    const bands: { from: Cell; to: Cell; alpha: number }[] = [];
    if (measure.current) bands.push({ from: measure.current.a, to: measure.current.b, alpha: 0.28 });
    if (hover.current) bands.push({ from: hover.current, to: hover.current, alpha: 0.5 });

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
      const big = x % label === 0;
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
      const big = d % label === 0;
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

  const updateCursor = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.style.cursor = drag.current?.kind === 'pan' ? 'grabbing' : space.current ? 'grab' : 'crosshair';
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

  // Fit when a grid of a new size appears (and drop a measurement that no longer fits) or when asked.
  useEffect(() => {
    const g = props.grid;
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
  }, [props.viewMode, props.showGrid, props.showRulers, props.atlas, props.tool, props.brushSize]);

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

  // Hold Space to pan with the left mouse button; Escape clears the measurement.
  useEffect(() => {
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]');
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && measure.current) {
        setMeasure(null);
        return;
      }
      if (e.code !== 'Space' || typing(e)) return;
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
    } else if (p.tool === 'fill') {
      if (floodFill(g, p.history, c.x, c.y, p.currentBlock) > 0) p.onEdit();
    } else if (p.tool === 'replace') {
      if (replaceAll(g, p.history, g.cells[i], p.currentBlock) > 0) p.onEdit();
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
    }
  };

  const endDrag = () => {
    const p = propsRef.current;
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'paint' && p.grid && p.history.commit(p.grid)) p.onEdit();
    // A click without dragging clears the measurement.
    const m = measure.current;
    if (d?.kind === 'measure' && m && m.a.x === m.b.x && m.a.y === m.b.y) setMeasure(null);
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
