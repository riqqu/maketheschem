import { describe, expect, it } from 'vitest';
import { quantize, type PaletteColor } from './quantize';
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
