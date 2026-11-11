import { describe, expect, it } from 'vitest';
import { avoidBlocks } from './avoid';
import { createGrid, History } from './grid';
import type { PaletteColor } from './quantize';
import { AIR, type RGB } from './types';

// 0 red, 1 dark red, 2 green, 3 blue
const colors: RGB[] = [[220, 30, 30], [150, 20, 20], [30, 200, 40], [30, 40, 210]];
const palette = (...values: number[]): PaletteColor[] => values.map((value) => ({ value, rgb: colors[value] }));

describe('avoidBlocks', () => {
  it('re-matches only the avoided block, to the nearest allowed one', () => {
    const grid = createGrid(3, 2);
    grid.cells.set([0, 2, 3, 0, AIR, 1]);
    const r = avoidBlocks(grid, new History(), new Set([0]), palette(1, 2, 3), colors);
    expect(Array.from(grid.cells)).toEqual([1, 2, 3, 1, AIR, 1]);
    expect(r).toEqual([{ from: 0, to: 1, count: 2 }]);
  });

  it('never picks an avoided block, even when the palette still lists it', () => {
    const grid = createGrid(2, 1);
    grid.cells.set([0, 1]);
    avoidBlocks(grid, new History(), new Set([0]), palette(0, 1, 2), colors);
    expect(Array.from(grid.cells)).toEqual([1, 1]);
  });

  it('handles several avoided blocks in one undo step', () => {
    const grid = createGrid(3, 1);
    grid.cells.set([0, 1, 2]);
    const history = new History();
    const r = avoidBlocks(grid, history, new Set([0, 1]), palette(3), colors);
    expect(Array.from(grid.cells)).toEqual([3, 3, 2]);
    expect(r.map((x) => x.from).sort()).toEqual([0, 1]);
    history.undo(grid);
    expect(Array.from(grid.cells)).toEqual([0, 1, 2]);
    expect(history.canUndo).toBe(false);
  });

  it('changes nothing without an allowed block', () => {
    const grid = createGrid(2, 1);
    grid.cells.set([0, 1]);
    const history = new History();
    expect(avoidBlocks(grid, history, new Set([0]), palette(0), colors)).toEqual([]);
    expect(avoidBlocks(grid, history, new Set([0]), [], colors)).toEqual([]);
    expect(Array.from(grid.cells)).toEqual([0, 1]);
    expect(history.canUndo).toBe(false);
  });

  it('leaves the history alone when the art does not hold the block', () => {
    const grid = createGrid(2, 1);
    grid.cells.set([2, 3]);
    const history = new History();
    expect(avoidBlocks(grid, history, new Set([0]), palette(1, 2), colors)).toEqual([]);
    expect(history.canUndo).toBe(false);
  });

  it('ignores air and blocks it has no colour for', () => {
    const grid = createGrid(2, 1);
    grid.cells.set([AIR, 9]);
    expect(avoidBlocks(grid, new History(), new Set([AIR, 9]), palette(1), colors)).toEqual([]);
    expect(Array.from(grid.cells)).toEqual([AIR, 9]);
  });
});
