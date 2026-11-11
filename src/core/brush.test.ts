import { describe, expect, it } from 'vitest';
import { BRUSH_STEPS, brushRows, clampBrush, MAX_BRUSH, stepBrushSize } from './brush';

const widths = (size: number, shape: 'square' | 'round') => brushRows(size, shape).map((r) => r.dx1 - r.dx0 + 1);
const cellCount = (size: number, shape: 'square' | 'round') => widths(size, shape).reduce((a, b) => a + b, 0);

describe('brushRows', () => {
  it('square brushes are size x size and even sizes extend right and down', () => {
    expect(widths(3, 'square')).toEqual([3, 3, 3]);
    expect(brushRows(3, 'square')[0]).toEqual({ dy: -1, dx0: -1, dx1: 1 });
    expect(brushRows(2, 'square')).toEqual([{ dy: 0, dx0: 0, dx1: 1 }, { dy: 1, dx0: 0, dx1: 1 }]);
    expect(brushRows(1, 'square')).toEqual([{ dy: 0, dx0: 0, dx1: 0 }]);
  });

  it('round brushes are pixel-art discs', () => {
    expect(widths(1, 'round')).toEqual([1]);
    expect(widths(2, 'round')).toEqual([2, 2]);
    expect(widths(3, 'round')).toEqual([1, 3, 1]); // a plus
    expect(widths(4, 'round')).toEqual([2, 4, 4, 2]);
    expect(widths(5, 'round')).toEqual([3, 5, 5, 5, 3]);
    expect(widths(6, 'round')).toEqual([2, 4, 6, 6, 4, 2]);
    expect(widths(7, 'round')).toEqual([3, 5, 7, 7, 7, 5, 3]);
  });

  it('round brushes are symmetric and about pi/4 of the square', () => {
    for (const n of [9, 15, 32, 51, 100]) {
      const w = widths(n, 'round');
      expect(w).toEqual([...w].reverse());
      expect(Math.max(...w)).toBe(n);
      expect(cellCount(n, 'round') / (n * n)).toBeGreaterThan(0.7);
      expect(cellCount(n, 'round') / (n * n)).toBeLessThan(0.85);
    }
  });

  it('keeps every row in one piece, centred on the cell for odd sizes', () => {
    for (const row of brushRows(11, 'round')) expect(row.dx0).toBe(-row.dx1);
  });

  it('clamps the size', () => {
    expect(clampBrush(0)).toBe(1);
    expect(clampBrush(1000)).toBe(MAX_BRUSH);
    expect(clampBrush(NaN)).toBe(1);
    expect(brushRows(1000, 'square')).toHaveLength(MAX_BRUSH);
  });
});

describe('stepBrushSize', () => {
  it('moves along the ladder from any size', () => {
    expect(stepBrushSize(1, 1)).toBe(2);
    expect(stepBrushSize(6, 1)).toBe(8);
    expect(stepBrushSize(7, 1)).toBe(8);
    expect(stepBrushSize(8, -1)).toBe(6);
    expect(stepBrushSize(7, -1)).toBe(6);
    expect(stepBrushSize(64, 1)).toBe(80);
  });

  it('stops at both ends', () => {
    expect(stepBrushSize(1, -1)).toBe(1);
    expect(stepBrushSize(MAX_BRUSH, 1)).toBe(MAX_BRUSH);
    expect(BRUSH_STEPS[0]).toBe(1);
    expect(BRUSH_STEPS[BRUSH_STEPS.length - 1]).toBe(MAX_BRUSH);
  });
});
