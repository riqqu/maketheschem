import { rgbToOklab } from './oklab';
import { AIR, type RGB } from './types';

export interface PaletteColor {
  /** Value written to the grid (index into BlockData.blocks). */
  value: number;
  rgb: RGB;
}

export interface QuantizeOptions {
  /** Floyd–Steinberg error diffusion strength, 0 (off) to 1 (full). */
  dither: number;
  /** Pixels with alpha below this become air. */
  alphaThreshold?: number;
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

  const labs = new Float64Array(palette.length * 3);
  palette.forEach((p, i) => labs.set(rgbToOklab(p.rgb[0], p.rgb[1], p.rgb[2]), i * 3));

  const cache = new Map<number, number>();
  const nearest = (r: number, g: number, b: number): number => {
    const key = (r << 16) | (g << 8) | b;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const [L, A, B] = rgbToOklab(r, g, b);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const dl = L - labs[i * 3], da = A - labs[i * 3 + 1], db = B - labs[i * 3 + 2];
      const d = dl * dl + da * da + db * db;
      if (d < bestD) { bestD = d; best = i; }
    }
    cache.set(key, best);
    return best;
  };

  const threshold = options.alphaThreshold ?? 128;
  const strength = Math.min(1, Math.max(0, options.dither));

  if (strength === 0) {
    for (let i = 0; i < width * height; i++) {
      const o = i * 4;
      if (pixels[o + 3] < threshold) continue;
      cells[i] = palette[nearest(pixels[o], pixels[o + 1], pixels[o + 2])].value;
    }
    return cells;
  }

  // Serpentine Floyd–Steinberg: diffuse each pixel's error to its unvisited neighbours.
  const err = new Float32Array(width * height * 3);
  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
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
