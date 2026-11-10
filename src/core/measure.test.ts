import { describe, expect, it } from 'vitest';
import { lockAxis, measureLabel, measureStats, measureSummary, rowLineDistance, rulerSteps } from './measure';

describe('measureStats / labels', () => {
  it('counts both end blocks in the span', () => {
    expect(measureStats({ a: { x: 3, y: 2 }, b: { x: 15, y: 7 } })).toEqual({ spanX: 13, spanY: 6, dx: 12, dy: 5, distance: 13 });
    expect(measureStats({ a: { x: 9, y: 4 }, b: { x: 2, y: 4 } })).toMatchObject({ spanX: 8, spanY: 1, dx: 7, dy: 0 });
  });

  it('labels straight lines by block count and diagonals by span and length', () => {
    expect(measureLabel({ a: { x: 0, y: 0 }, b: { x: 12, y: 0 } })).toBe('13 blocks');
    expect(measureLabel({ a: { x: 4, y: 9 }, b: { x: 4, y: 1 } })).toBe('9 blocks');
    expect(measureLabel({ a: { x: 4, y: 4 }, b: { x: 4, y: 4 } })).toBe('1 block');
    expect(measureLabel({ a: { x: 3, y: 2 }, b: { x: 15, y: 7 } })).toBe('13 × 6 · 13.0 diag');
  });

  it('uses in-game axis names in the summary', () => {
    const m = { a: { x: 3, y: 2 }, b: { x: 15, y: 7 } };
    expect(measureSummary(m, 'wall')).toBe('13 × 6 blocks · Δx 12 · Δy 5 · 13.0 straight');
    expect(measureSummary(m, 'floor')).toBe('13 × 6 blocks · Δx 12 · Δz 5 · 13.0 straight');
    expect(measureSummary({ a: { x: 0, y: 0 }, b: { x: 5, y: 0 } }, 'floor')).toBe('6 × 1 blocks · Δx 5 · Δz 0');
  });
});

describe('lockAxis', () => {
  it('keeps the dominant axis', () => {
    expect(lockAxis({ x: 10, y: 10 }, { x: 20, y: 13 })).toEqual({ x: 20, y: 10 });
    expect(lockAxis({ x: 10, y: 10 }, { x: 8, y: 30 })).toEqual({ x: 10, y: 30 });
  });
});

describe('rulerSteps', () => {
  it('numbers every block when zoomed in and fewer ticks when zoomed out', () => {
    expect(rulerSteps(40)).toEqual({ label: 1, minor: 1 });
    expect(rulerSteps(12)).toEqual({ label: 5, minor: 1 });
    expect(rulerSteps(5.7)).toEqual({ label: 10, minor: 1 });
    expect(rulerSteps(2)).toEqual({ label: 20, minor: 5 });
    expect(rulerSteps(0.5)).toEqual({ label: 100, minor: 10 });
  });

  it('keeps labels at least the minimum distance apart', () => {
    for (const scale of [0.2, 0.7, 1, 3, 7, 13, 30, 64]) {
      const { label, minor } = rulerSteps(scale);
      expect(label * scale).toBeGreaterThanOrEqual(36);
      expect(label % minor).toBe(0);
    }
  });
});

describe('rowLineDistance', () => {
  it('counts walls up from the bottom and floors down from the north edge', () => {
    expect(rowLineDistance(0, 40, 'wall')).toBe(40);
    expect(rowLineDistance(40, 40, 'wall')).toBe(0);
    expect(rowLineDistance(30, 40, 'wall')).toBe(10);
    expect(rowLineDistance(10, 40, 'floor')).toBe(10);
  });
});
