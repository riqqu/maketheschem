import { rgbToOklab } from './oklab';
import { AIR, type RGB } from './types';

export interface PaletteColor {
  /** Value written to the grid (index into BlockData.blocks). */
  value: number;
  rgb: RGB;
  /** Added to the squared OKLab distance when matching (e.g. for noisy textures). */
  penalty?: number;
}

/** diffusion = serpentine Floyd–Steinberg (smooth gradients), ordered = 8x8 Bayer pattern (regular, tidy). */
export type DitherKind = 'diffusion' | 'ordered';

export interface QuantizeOptions {
  /** Dithering strength, 0 (off) to 1 (full). */
  dither: number;
  /** How to dither when `dither` > 0; defaults to diffusion. */
  mode?: DitherKind;
  /** Pixels with alpha below this become air. */
  alphaThreshold?: number;
}

/** Penalty in squared OKLab units for a texture noise value at smoothness 1 (see scripts/extract-blocks.mjs). */
export const NOISE_WEIGHT = 0.5;
export const noisePenalty = (noise: number | undefined, smoothness: number) => NOISE_WEIGHT * smoothness * (noise ?? 0) ** 2;

/** 8x8 Bayer matrix (row-major), values 0..63: bit-reversed interleave of (x xor y, y). */
export const BAYER = (() => {
  const m = new Uint8Array(64);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      let v = 0;
      for (let bit = 0, xx = y, yy = x ^ y; bit < 3; bit++, xx >>= 1, yy >>= 1) v = (v << 2) | ((yy & 1) << 1) | (xx & 1);
      m[y * 8 + x] = v;
    }
  }
  return m;
})();
/** RGB offset range of the ordered pattern at full strength. */
const ORDERED_SPREAD = 72;

/** Nearest-colour lookup in OKLab (plus each colour's penalty), cached per RGB value. */
export function makeMatcher(palette: readonly PaletteColor[]) {
  const labs = new Float64Array(palette.length * 3);
  const penalty = new Float64Array(palette.length);
  palette.forEach((p, i) => {
    labs.set(rgbToOklab(p.rgb[0], p.rgb[1], p.rgb[2]), i * 3);
    penalty[i] = p.penalty ?? 0;
  });
  const cache = new Map<number, number>();
  return (r: number, g: number, b: number): number => {
    const key = (r << 16) | (g << 8) | b;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const [L, A, B] = rgbToOklab(r, g, b);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const dl = L - labs[i * 3], da = A - labs[i * 3 + 1], db = B - labs[i * 3 + 2];
      const d = dl * dl + da * da + db * db + penalty[i];
      if (d < bestD) { bestD = d; best = i; }
    }
    cache.set(key, best);
    return best;
  };
}

/** Maps every pixel of an RGBA buffer to the perceptually nearest palette colour (OKLab). */
export function quantize(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  palette: readonly PaletteColor[],
  options: QuantizeOptions,
): Uint16Array {
  const cells = new Uint16Array(width * height).fill(AIR);
  if (palette.length === 0) return cells;

  const nearest = makeMatcher(palette);
  const threshold = options.alphaThreshold ?? 128;
  const strength = Math.min(1, Math.max(0, options.dither));
  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

  if (strength === 0 || options.mode === 'ordered') {
    const spread = ORDERED_SPREAD * strength;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const o = i * 4;
        if (pixels[o + 3] < threshold) continue;
        if (spread === 0) {
          cells[i] = palette[nearest(pixels[o], pixels[o + 1], pixels[o + 2])].value;
        } else {
          const t = ((BAYER[(y & 7) * 8 + (x & 7)] + 0.5) / 64 - 0.5) * spread;
          cells[i] = palette[nearest(clamp(pixels[o] + t), clamp(pixels[o + 1] + t), clamp(pixels[o + 2] + t))].value;
        }
      }
    }
    return cells;
  }

  // Serpentine Floyd–Steinberg: diffuse each pixel's error to its unvisited neighbours.
  const err = new Float32Array(width * height * 3);
  const spread = (x: number, y: number, er: number, eg: number, eb: number, f: number) => {
    if (x < 0 || x >= width || y >= height) return;
    const j = (y * width + x) * 3;
    err[j] += er * f; err[j + 1] += eg * f; err[j + 2] += eb * f;
  };

  for (let y = 0; y < height; y++) {
    const ltr = y % 2 === 0;
    const dir = ltr ? 1 : -1;
    for (let k = 0; k < width; k++) {
      const x = ltr ? k : width - 1 - k;
      const i = y * width + x;
      const o = i * 4;
      if (pixels[o + 3] < threshold) continue;
      const r = clamp(pixels[o] + err[i * 3]);
      const g = clamp(pixels[o + 1] + err[i * 3 + 1]);
      const b = clamp(pixels[o + 2] + err[i * 3 + 2]);
      const p = palette[nearest(r, g, b)];
      cells[i] = p.value;
      const er = (r - p.rgb[0]) * strength;
      const eg = (g - p.rgb[1]) * strength;
      const eb = (b - p.rgb[2]) * strength;
      spread(x + dir, y, er, eg, eb, 7 / 16);
      spread(x - dir, y + 1, er, eg, eb, 3 / 16);
      spread(x, y + 1, er, eg, eb, 5 / 16);
      spread(x + dir, y + 1, er, eg, eb, 1 / 16);
    }
  }
  return cells;
}
