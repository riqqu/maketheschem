// Gradient fill: a colour ramp between two blocks laid over an area and matched to blocks with the app's dithering.
import type { Cell } from './measure';
import { oklabToRgb, rgbToOklab } from './oklab';
import { makeMatcher, quantize, type DitherKind, type PaletteColor } from './quantize';

export type GradientDither = 'off' | DitherKind;

/** The ordered pattern repeats every 8 blocks: starting on a multiple of 8 makes it line up from one fill to the next. */
const ALIGN = 8;
/** Points along the ramp that are matched to find the blocks it steps through. */
const RAMP_SAMPLES = 64;

/**
 * The block for each cell of `area` (indices into a grid `width` wide) of a gradient that runs from block `from` at
 * cell `a` to block `to` at cell `b`. Before `a` it is all `from`, past `b` all `to`; in between the colours blend in
 * OKLab. The blocks it steps through are the ones of `palette` (and the two ends) that sit closest to the ramp, and
 * the dithering mixes only those: matched against the whole palette, the dither's colour noise would pick blocks of
 * every hue. Returns one value per cell of `area`, in order. A gradient of no length is all `from`.
 */
export function gradientFill(
  width: number,
  area: readonly number[],
  a: Cell,
  b: Cell,
  from: PaletteColor,
  to: PaletteColor,
  palette: readonly PaletteColor[],
  dither: GradientDither,
): Uint16Array {
  const out = new Uint16Array(area.length);
  if (area.length === 0) return out;

  let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
  for (const i of area) {
    const x = i % width, y = (i - x) / width;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const x0 = Math.floor(minX / ALIGN) * ALIGN, y0 = Math.floor(minY / ALIGN) * ALIGN;
  const w = maxX - x0 + 1, h = maxY - y0 + 1;

  const c0 = rgbToOklab(from.rgb[0], from.rgb[1], from.rgb[2]);
  const c1 = rgbToOklab(to.rgb[0], to.rgb[1], to.rgb[2]);
  /** The ramp's colour a fraction t of the way from `from` to `to`. */
  const colorAt = (t: number) => oklabToRgb(c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t);

  // The ends carry no texture penalty, so each is matched exactly where the ramp is still its own colour.
  const candidates: PaletteColor[] = [
    { ...from, penalty: 0 },
    { ...to, penalty: 0 },
    ...palette.filter((p) => p.value !== from.value && p.value !== to.value),
  ];
  const nearest = makeMatcher(candidates);
  const ramp = new Map<number, PaletteColor>();
  for (let s = 0; s <= RAMP_SAMPLES; s++) {
    const [r, g, bl] = colorAt(s / RAMP_SAMPLES);
    const c = candidates[nearest(r, g, bl)];
    ramp.set(c.value, c);
  }

  // The ramp as a picture: cells of the area opaque, everything else transparent (and so left alone by the matching).
  const pixels = new Uint8ClampedArray(w * h * 4);
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  for (const i of area) {
    const x = i % width, y = (i - x) / width;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / len2));
    const [r, g, bl] = colorAt(t);
    const o = ((y - y0) * w + (x - x0)) * 4;
    pixels[o] = r;
    pixels[o + 1] = g;
    pixels[o + 2] = bl;
    pixels[o + 3] = 255;
  }

  const cells = quantize(pixels, w, h, [...ramp.values()], { dither: dither === 'off' ? 0 : 1, mode: dither === 'off' ? undefined : dither });
  area.forEach((i, k) => {
    const x = i % width, y = (i - x) / width;
    out[k] = cells[(y - y0) * w + (x - x0)];
  });
  return out;
}
