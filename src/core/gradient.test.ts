import { describe, expect, it } from 'vitest';
import { gradientFill } from './gradient';
import { oklabToRgb, rgbToOklab } from './oklab';
import type { PaletteColor } from './quantize';

const BLACK = 0, DARK = 1, MID = 2, LIGHT = 3, WHITE = 4, RED = 5;
const swatch = (value: number, v: number): PaletteColor => ({ value, rgb: [v, v, v] });
const black = swatch(BLACK, 0), white = swatch(WHITE, 255);
const greys = [black, swatch(DARK, 64), swatch(MID, 128), swatch(LIGHT, 192), white];

/** All cells of a w x h block at (x0, y0) in a grid `gridW` wide. */
const area = (gridW: number, x0: number, y0: number, w: number, h: number) =>
  Array.from({ length: w * h }, (_, k) => (y0 + Math.floor(k / w)) * gridW + x0 + (k % w));

const fraction = (values: ArrayLike<number>, which: number, from = 0, to = values.length) => {
  let n = 0;
  for (let i = from; i < to; i++) if (values[i] === which) n++;
  return n / (to - from);
};

describe('oklabToRgb', () => {
  it('undoes rgbToOklab', () => {
    for (const [r, g, b] of [[0, 0, 0], [255, 255, 255], [200, 40, 40], [30, 200, 90], [12, 99, 250], [128, 128, 128]]) {
      const [L, a, bb] = rgbToOklab(r, g, b);
      const [r2, g2, b2] = oklabToRgb(L, a, bb);
      expect(Math.abs(r2 - r)).toBeLessThanOrEqual(1);
      expect(Math.abs(g2 - g)).toBeLessThanOrEqual(1);
      expect(Math.abs(b2 - b)).toBeLessThanOrEqual(1);
    }
  });

  it('clamps colours outside the gamut', () => {
    const [r, g, b] = oklabToRgb(0.6, 0.4, 0.3);
    for (const c of [r, g, b]) expect(c >= 0 && c <= 255 && Number.isInteger(c)).toBe(true);
  });
});

describe('gradientFill', () => {
  const W = 17;
  const row = area(W, 0, 0, W, 1);
  const line = (dither: 'off' | 'diffusion' | 'ordered', palette = greys) =>
    gradientFill(W, row, { x: 0, y: 0 }, { x: W - 1, y: 0 }, black, white, palette, dither);

  it('runs from one end block to the other, through the palette in order', () => {
    const v = line('off');
    expect(v[0]).toBe(BLACK);
    expect(v[W - 1]).toBe(WHITE);
    expect(new Set(v)).toEqual(new Set([BLACK, DARK, MID, LIGHT, WHITE]));
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThanOrEqual(v[i - 1]);
  });

  it('uses the end blocks even when the palette does not list them', () => {
    const v = line('off', []);
    expect(new Set(v)).toEqual(new Set([BLACK, WHITE]));
    expect(v[0]).toBe(BLACK);
    expect(v[W - 1]).toBe(WHITE);
  });

  it('holds the end colours before the start and past the end', () => {
    const wide = area(W, 0, 0, W, 1);
    const v = gradientFill(W, wide, { x: 6, y: 0 }, { x: 10, y: 0 }, black, white, greys, 'off');
    for (let x = 0; x <= 6; x++) expect(v[x]).toBe(BLACK);
    for (let x = 10; x < W; x++) expect(v[x]).toBe(WHITE);
  });

  it('can run in any direction', () => {
    const col = area(5, 2, 0, 1, 5);
    const down = gradientFill(5, col, { x: 2, y: 0 }, { x: 2, y: 4 }, black, white, greys, 'off');
    const up = gradientFill(5, col, { x: 2, y: 4 }, { x: 2, y: 0 }, black, white, greys, 'off');
    expect(down[0]).toBe(BLACK);
    expect(down[4]).toBe(WHITE);
    expect(up[0]).toBe(WHITE);
    expect(up[4]).toBe(BLACK);
    const diag = area(8, 0, 0, 8, 8);
    const d = gradientFill(8, diag, { x: 0, y: 0 }, { x: 7, y: 7 }, black, white, greys, 'off');
    expect(d[0]).toBe(BLACK);
    expect(d[63]).toBe(WHITE);
    expect(d[7]).toBe(d[56]); // the same distance along the diagonal
  });

  it('is all the first block for a gradient of no length', () => {
    const v = gradientFill(W, row, { x: 3, y: 0 }, { x: 3, y: 0 }, black, white, greys, 'ordered');
    expect(Array.from(v).every((x) => x === BLACK)).toBe(true);
  });

  it('returns a value for each cell of an area of any shape, in its order', () => {
    const odd = [20, 3, 11, 12, 40];
    const v = gradientFill(10, odd, { x: 0, y: 0 }, { x: 9, y: 4 }, black, white, greys, 'off');
    expect(v).toHaveLength(odd.length);
    expect(gradientFill(10, [], { x: 0, y: 0 }, { x: 1, y: 1 }, black, white, greys, 'off')).toHaveLength(0);
  });

  it('blends the two end colours with an ordered pattern', () => {
    const block = area(16, 0, 0, 16, 8);
    const v = gradientFill(16, block, { x: 0, y: 0 }, { x: 15, y: 0 }, black, white, [], 'ordered');
    expect(new Set(v)).toEqual(new Set([BLACK, WHITE]));
    // Whites become more common from left to right: ~0 at one end, ~1 at the other, about half in the middle.
    const col = (x: number) => Array.from({ length: 8 }, (_, y) => v[y * 16 + x]);
    expect(fraction(col(0), WHITE)).toBeLessThanOrEqual(0.25);
    expect(fraction(col(15), WHITE)).toBeGreaterThanOrEqual(0.75);
    expect(fraction(v, WHITE)).toBeGreaterThan(0.35);
    expect(fraction(v, WHITE)).toBeLessThan(0.65);
  });

  it('blends the two end colours by diffusing the error', () => {
    const block = area(32, 0, 0, 32, 8);
    const v = gradientFill(32, block, { x: 0, y: 0 }, { x: 31, y: 0 }, black, white, [], 'diffusion');
    expect(new Set(v)).toEqual(new Set([BLACK, WHITE]));
    const left = Array.from({ length: 8 * 8 }, (_, k) => v[Math.floor(k / 8) * 32 + (k % 8)]);
    const right = Array.from({ length: 8 * 8 }, (_, k) => v[Math.floor(k / 8) * 32 + 24 + (k % 8)]);
    expect(fraction(left, WHITE)).toBeLessThan(0.35);
    expect(fraction(right, WHITE)).toBeGreaterThan(0.65);
  });

  it('keeps the ordered pattern in step with the grid, wherever the area starts', () => {
    const a1 = gradientFill(40, area(40, 0, 0, 16, 8), { x: 0, y: 0 }, { x: 15, y: 0 }, black, white, [], 'ordered');
    const a2 = gradientFill(40, area(40, 8, 0, 16, 8), { x: 8, y: 0 }, { x: 23, y: 0 }, black, white, [], 'ordered');
    expect(Array.from(a2)).toEqual(Array.from(a1));
  });

  it('mixes only the blocks along the ramp, however much the dither shifts the colour', () => {
    // A pink of the same lightness as the middle grey: close to the ramp, but not on it.
    const PINK = 9;
    const pink: PaletteColor = { value: PINK, rgb: [190, 120, 120] };
    for (const dither of ['off', 'ordered', 'diffusion'] as const) {
      const block = area(24, 0, 0, 24, 12);
      const v = gradientFill(24, block, { x: 0, y: 0 }, { x: 23, y: 0 }, black, white, [...greys, pink], dither);
      expect(new Set(v).has(PINK), dither).toBe(false);
      expect(v.every((x) => greys.some((g) => g.value === x)), dither).toBe(true);
    }
  });

  it('uses a block that is on the ramp even when it is not grey', () => {
    // From red to blue the ramp runs through purple: a purple block in the palette is part of it.
    const RED_ = 5, BLUE = 6, PURPLE = 7, GREEN = 8;
    const red: PaletteColor = { value: RED_, rgb: [220, 30, 30] };
    const blue: PaletteColor = { value: BLUE, rgb: [30, 30, 220] };
    const purple: PaletteColor = { value: PURPLE, rgb: [125, 40, 125] };
    const green: PaletteColor = { value: GREEN, rgb: [30, 200, 40] };
    const v = gradientFill(W, row, { x: 0, y: 0 }, { x: W - 1, y: 0 }, red, blue, [purple, green], 'off');
    expect(new Set(v).has(PURPLE)).toBe(true);
    expect(new Set(v).has(GREEN)).toBe(false);
  });

  it('works for a coloured gradient through the palette', () => {
    const red: PaletteColor = { value: RED, rgb: [200, 40, 40] };
    const v = gradientFill(W, row, { x: 0, y: 0 }, { x: W - 1, y: 0 }, black, red, [...greys, red], 'off');
    expect(v[0]).toBe(BLACK);
    expect(v[W - 1]).toBe(RED);
  });

  it('ignores the texture penalty at the ends', () => {
    const noisy: PaletteColor[] = [{ value: BLACK, rgb: [0, 0, 0], penalty: 5 }, { value: WHITE, rgb: [255, 255, 255], penalty: 5 }];
    const v = gradientFill(W, row, { x: 0, y: 0 }, { x: W - 1, y: 0 }, black, white, noisy, 'off');
    expect(v[0]).toBe(BLACK);
    expect(v[W - 1]).toBe(WHITE);
  });
});
