import { describe, expect, it } from 'vitest';
import { BAYER, noisePenalty, quantize, type PaletteColor } from './quantize';
import { reducePalette } from './reduce';
import { resample } from './resample';
import { AIR } from './types';

const px = (...colors: number[][]) => Uint8ClampedArray.from(colors.flat());

describe('quantize', () => {
  const palette: PaletteColor[] = [
    { value: 10, rgb: [0, 0, 0] },
    { value: 11, rgb: [255, 255, 255] },
    { value: 12, rgb: [200, 30, 30] },
    { value: 13, rgb: [40, 60, 200] },
  ];

  it('maps each palette colour to its own block', () => {
    const pixels = px(...palette.map((p) => [...p.rgb, 255]));
    expect([...quantize(pixels, 4, 1, palette, { dither: 0 })]).toEqual([10, 11, 12, 13]);
  });

  it('picks the perceptually nearest block', () => {
    const pixels = px([180, 40, 40, 255], [30, 50, 170, 255], [240, 240, 240, 255], [20, 20, 20, 255]);
    expect([...quantize(pixels, 4, 1, palette, { dither: 0 })]).toEqual([12, 13, 11, 10]);
  });

  it('turns transparent pixels into air', () => {
    const pixels = px([255, 255, 255, 0], [255, 255, 255, 127], [255, 255, 255, 128]);
    expect([...quantize(pixels, 3, 1, palette, { dither: 0 })]).toEqual([AIR, AIR, 11]);
  });

  it('returns all air for an empty palette', () => {
    expect([...quantize(px([1, 2, 3, 255]), 1, 1, [], { dither: 0 })]).toEqual([AIR]);
  });

  it('dithers mid grey into a black/white mix using only palette blocks', () => {
    const bw: PaletteColor[] = [palette[0], palette[1]];
    const n = 32;
    const pixels = new Uint8ClampedArray(n * n * 4);
    for (let i = 0; i < n * n; i++) pixels.set([128, 128, 128, 255], i * 4);
    const flat = quantize(pixels, n, n, bw, { dither: 0 });
    expect(new Set(flat).size).toBe(1);
    const dithered = quantize(pixels, n, n, bw, { dither: 1 });
    const white = [...dithered].filter((v) => v === 11).length / (n * n);
    expect(new Set(dithered)).toEqual(new Set([10, 11]));
    expect(white).toBeGreaterThan(0.4);
    expect(white).toBeLessThan(0.6);
  });
});

describe('ordered dithering', () => {
  const bw: PaletteColor[] = [{ value: 0, rgb: [0, 0, 0] }, { value: 1, rgb: [255, 255, 255] }];
  const grey = (n: number, v = 128) => {
    const pixels = new Uint8ClampedArray(n * n * 4);
    for (let i = 0; i < n * n; i++) pixels.set([v, v, v, 255], i * 4);
    return pixels;
  };

  it('uses a proper 8x8 Bayer matrix', () => {
    expect([...BAYER].sort((a, b) => a - b)).toEqual(Array.from({ length: 64 }, (_, i) => i));
    expect([...BAYER.slice(0, 8)]).toEqual([0, 32, 8, 40, 2, 34, 10, 42]);
  });

  it('repeats every 8 blocks and differs from error diffusion', () => {
    const n = 16;
    const ordered = quantize(grey(n), n, n, bw, { dither: 1, mode: 'ordered' });
    const diffusion = quantize(grey(n), n, n, bw, { dither: 1, mode: 'diffusion' });
    expect(new Set(ordered)).toEqual(new Set([0, 1]));
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) expect(ordered[(y + 8) * n + x + 8]).toBe(ordered[y * n + x]);
    expect([...ordered]).not.toEqual([...diffusion]);
    expect([...quantize(grey(n), n, n, bw, { dither: 1, mode: 'ordered' })]).toEqual([...ordered]);
  });

  it('does nothing at zero strength', () => {
    expect(new Set(quantize(grey(8, 60), 8, 8, bw, { dither: 0, mode: 'ordered' }))).toEqual(new Set([0]));
  });
});

describe('palette penalties', () => {
  it('steer matching away from penalised (noisy) blocks', () => {
    const near: PaletteColor = { value: 1, rgb: [200, 30, 30] };
    const far: PaletteColor = { value: 2, rgb: [170, 50, 50] };
    const pixels = Uint8ClampedArray.from([200, 30, 30, 255]);
    expect(quantize(pixels, 1, 1, [near, far], { dither: 0 })[0]).toBe(1);
    expect(quantize(pixels, 1, 1, [{ ...near, penalty: noisePenalty(0.15, 1) }, far], { dither: 0 })[0]).toBe(2);
    // Smoothness 0 turns the penalty off.
    expect(noisePenalty(0.15, 0)).toBe(0);
  });
});

describe('reducePalette', () => {
  const palette: PaletteColor[] = [
    { value: 0, rgb: [0, 0, 0] },
    { value: 1, rgb: [255, 255, 255] },
    { value: 2, rgb: [220, 20, 20] },
    { value: 3, rgb: [20, 20, 220] },
    { value: 4, rgb: [20, 200, 20] },
  ];
  // Mostly red and blue, a few green pixels, no black or white.
  const image = (() => {
    const colors = [...Array(60).fill([220, 20, 20]), ...Array(35).fill([20, 20, 220]), ...Array(5).fill([20, 200, 20])];
    return Uint8ClampedArray.from(colors.flatMap((c) => [...c, 255]));
  })();

  it('keeps the colours that cover the most pixels, in palette order', () => {
    expect(reducePalette(image, palette, 2).map((p) => p.value)).toEqual([2, 3]);
    expect(reducePalette(image, palette, 3).map((p) => p.value)).toEqual([2, 3, 4]);
  });

  it('returns the whole palette when it is already small enough', () => {
    expect(reducePalette(image, palette, 10)).toHaveLength(5);
  });

  it('stops early when more colours would not help', () => {
    const red = Uint8ClampedArray.from([220, 20, 20, 255, 220, 20, 20, 255]);
    expect(reducePalette(red, palette, 4).map((p) => p.value)).toEqual([2]);
  });

  it('ignores transparent pixels', () => {
    const px = Uint8ClampedArray.from([255, 255, 255, 0, 220, 20, 20, 255]);
    expect(reducePalette(px, palette, 1).map((p) => p.value)).toEqual([2]);
  });
});

describe('resample', () => {
  it('smooth averages the covered area', () => {
    const src = { width: 2, height: 2, data: px([255, 0, 0, 255], [0, 0, 255, 255], [0, 0, 0, 255], [255, 255, 255, 255]) };
    expect([...resample(src, 1, 1, 'smooth')]).toEqual([128, 64, 128, 255]);
  });

  it('smooth ignores the colour of transparent pixels', () => {
    const src = { width: 2, height: 1, data: px([255, 0, 0, 255], [0, 255, 0, 0]) };
    expect([...resample(src, 1, 1, 'smooth')]).toEqual([255, 0, 0, 128]);
  });

  it('smooth handles non-integer ratios and upscaling', () => {
    const src = { width: 3, height: 1, data: px([0, 0, 0, 255], [90, 90, 90, 255], [180, 180, 180, 255]) };
    expect([...resample(src, 2, 1, 'smooth')]).toEqual([30, 30, 30, 255, 150, 150, 150, 255]);
    const one = { width: 1, height: 1, data: px([7, 8, 9, 255]) };
    expect([...resample(one, 2, 2, 'smooth')]).toEqual([7, 8, 9, 255, 7, 8, 9, 255, 7, 8, 9, 255, 7, 8, 9, 255]);
  });

  it('sharp samples pixel centres without blending', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < 16; i++) data.set([i * 10, 0, 0, 255], i * 4);
    const out = resample({ width: 4, height: 4, data }, 2, 2, 'sharp');
    // Centres of the 2x2 blocks fall on source pixels (1,1), (3,1), (1,3), (3,3).
    expect([out[0], out[4], out[8], out[12]]).toEqual([50, 70, 130, 150]);
  });
});
