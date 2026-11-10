// Background removal on the source image, before it is resized to blocks.
import { rgbToOklab } from './oklab';
import { resample, type RGBAImage, type ResizeMode } from './resample';
import type { RGB } from './types';

/** edges = only background connected to the image border; all = that colour everywhere. */
export type BackgroundMode = 'edges' | 'all';

export interface BackgroundOptions {
  /** Maximum OKLab distance from the background colour (about 0.01-0.5). */
  tolerance: number;
  mode: BackgroundMode;
}

export interface BackgroundResult {
  image: RGBAImage;
  /** Detected background colour, or null if there is no clear one. */
  color: RGB | null;
  /** Fraction of all pixels that were made transparent. */
  removed: number;
}

const OPAQUE = 128;
/** Border pixels this close to the candidate colour count as "the same background". */
const DETECT_RADIUS = 0.1;
/** The candidate must cover at least this share of the opaque border. */
const MIN_DOMINANCE = 0.3;

const dist2 = (a: readonly number[], b: readonly number[]) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

function borderPixels(w: number, h: number): number[] {
  const out: number[] = [];
  for (let x = 0; x < w; x++) {
    out.push(x);
    if (h > 1) out.push((h - 1) * w + x);
  }
  for (let y = 1; y < h - 1; y++) {
    out.push(y * w);
    if (w > 1) out.push(y * w + w - 1);
  }
  return out;
}

/**
 * The dominant colour along the image border, or null when the border is already mostly transparent
 * or has no single dominant colour (e.g. a photo cropped edge to edge).
 */
export function detectBackground(img: RGBAImage): RGB | null {
  const { width: w, height: h, data } = img;
  const border = borderPixels(w, h);
  const opaque = border.filter((p) => data[p * 4 + 3] >= OPAQUE);
  if (opaque.length < border.length * 0.5) return null;

  // Coarse histogram (4 bits per channel) to find the candidate...
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (const p of opaque) {
    const i = p * 4;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    let bin = bins.get(key);
    if (!bin) bins.set(key, (bin = { n: 0, r: 0, g: 0, b: 0 }));
    bin.n++;
    bin.r += data[i];
    bin.g += data[i + 1];
    bin.b += data[i + 2];
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const bin of bins.values()) if (!best || bin.n > best.n) best = bin;
  if (!best) return null;
  const candidate = rgbToOklab(Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n));

  // ...then gather every border pixel near it (robust to colours split across histogram bins).
  let n = 0, r = 0, g = 0, b = 0;
  for (const p of opaque) {
    const i = p * 4;
    if (dist2(rgbToOklab(data[i], data[i + 1], data[i + 2]), candidate) <= DETECT_RADIUS ** 2) {
      n++;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
  }
  if (n < opaque.length * MIN_DOMINANCE) return null;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/** Makes the background transparent. Returns the input unchanged if no background colour is found. */
export function removeBackground(img: RGBAImage, options: BackgroundOptions): BackgroundResult {
  const color = detectBackground(img);
  if (!color) return { image: img, color: null, removed: 0 };

  const { width: w, height: h, data } = img;
  const n = w * h;
  const ref = rgbToOklab(color[0], color[1], color[2]);
  const tol2 = options.tolerance ** 2;
  const cache = new Map<number, boolean>();
  const isBackground = (p: number): boolean => {
    const i = p * 4;
    if (data[i + 3] < OPAQUE) return true; // already transparent counts as background
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    let hit = cache.get(key);
    if (hit === undefined) {
      hit = dist2(rgbToOklab(data[i], data[i + 1], data[i + 2]), ref) <= tol2;
      cache.set(key, hit);
    }
    return hit;
  };

  const remove = new Uint8Array(n);
  if (options.mode === 'all') {
    for (let p = 0; p < n; p++) if (isBackground(p)) remove[p] = 1;
  } else {
    // Flood fill from the border through background-coloured pixels (4-connected).
    const stack = new Int32Array(n);
    let top = 0;
    const visit = (p: number) => {
      if (!remove[p] && isBackground(p)) {
        remove[p] = 1;
        stack[top++] = p;
      }
    };
    for (const p of borderPixels(w, h)) visit(p);
    while (top > 0) {
      const p = stack[--top];
      const x = p % w;
      if (x > 0) visit(p - 1);
      if (x < w - 1) visit(p + 1);
      if (p >= w) visit(p - w);
      if (p < n - w) visit(p + w);
    }
  }

  const out = new Uint8ClampedArray(data);
  let removed = 0;
  for (let p = 0; p < n; p++) {
    if (remove[p] && out[p * 4 + 3] >= OPAQUE) removed++;
    if (remove[p]) out[p * 4 + 3] = 0;
  }
  return { image: { width: w, height: h, data: out }, color, removed: removed / n };
}

/**
 * Grid cells (width x height, row-major) that the background removal turns into air: solid in the original
 * image, transparent once the background is gone. Used to erase the background from an already edited grid.
 */
export function backgroundCells(
  original: RGBAImage, cleaned: RGBAImage, width: number, height: number, resize: ResizeMode,
): Uint8Array {
  const before = resample(original, width, height, resize);
  const after = resample(cleaned, width, height, resize);
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) if (before[i * 4 + 3] >= OPAQUE && after[i * 4 + 3] < OPAQUE) mask[i] = 1;
  return mask;
}
