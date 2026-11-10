import { describe, expect, it } from 'vitest';
import { brushCells, countBlocks, createGrid, floodFill, History, paintLine, replaceAll, resizeGrid } from './grid';
import { AIR } from './types';

const rows = (g: { width: number; cells: Uint16Array }) =>
  Array.from({ length: g.cells.length / g.width }, (_, y) => [...g.cells.subarray(y * g.width, (y + 1) * g.width)]);

describe('paintLine', () => {
  it('draws a gapless diagonal stroke and undoes it as one step', () => {
    const g = createGrid(4, 4, 0);
    const h = new History();
    h.begin();
    paintLine(g, h, 0, 0, 3, 3, 1, 5);
    expect(h.commit(g)).toBe(true);
    expect(rows(g)).toEqual([[5, 0, 0, 0], [0, 5, 0, 0], [0, 0, 5, 0], [0, 0, 0, 5]]);
    h.undo(g);
    expect(g.cells.every((v) => v === 0)).toBe(true);
    h.redo(g);
    expect(g.cells[15]).toBe(5);
  });

  it('applies the brush size and clips at the edges', () => {
    const g = createGrid(3, 3, 0);
    expect(brushCells(g, 0, 0, 3).sort()).toEqual([0, 1, 3, 4]);
    expect(brushCells(g, 1, 1, 2).sort()).toEqual([4, 5, 7, 8]);
  });
});

describe('floodFill', () => {
  it('fills only the 4-connected region', () => {
    const g = createGrid(3, 3, 0);
    g.cells.set([0, 1, 0, 1, 1, 0, 0, 0, 1]);
    const h = new History();
    // [0 1 0]      [0 1 7]
    // [1 1 0]  ->  [1 1 7]   (bottom-left 0s and top-left 0 are not connected to the start)
    // [0 0 1]      [0 0 1]
    expect(floodFill(g, h, 2, 0, 7)).toBe(2);
    expect(rows(g)).toEqual([[0, 1, 7], [1, 1, 7], [0, 0, 1]]);
    h.undo(g);
    expect(rows(g)).toEqual([[0, 1, 0], [1, 1, 0], [0, 0, 1]]);
  });

  it('is a no-op when the colour already matches', () => {
    const g = createGrid(2, 2, 3);
    const h = new History();
    expect(floodFill(g, h, 0, 0, 3)).toBe(0);
    expect(h.canUndo).toBe(false);
  });
});

describe('replaceAll and countBlocks', () => {
  it('replaces every matching cell and counts blocks without air', () => {
    const g = createGrid(2, 2, AIR);
    g.cells.set([1, 2, 1, AIR]);
    const h = new History();
    expect(replaceAll(g, h, 1, 9)).toBe(2);
    expect([...g.cells]).toEqual([9, 2, 9, AIR]);
    expect(countBlocks(g)).toEqual(new Map([[9, 2], [2, 1]]));
    h.undo(g);
    expect([...g.cells]).toEqual([1, 2, 1, AIR]);
  });
});

describe('History', () => {
  it('does not record empty operations and clears redo on new edits', () => {
    const g = createGrid(2, 1, 0);
    const h = new History();
    h.begin();
    expect(h.commit(g)).toBe(false);
    expect(h.canUndo).toBe(false);
    h.begin(); h.set(g, 0, 1); h.commit(g);
    h.undo(g);
    expect(h.canRedo).toBe(true);
    h.begin(); h.set(g, 1, 2); h.commit(g);
    expect(h.canRedo).toBe(false);
  });

  it('topId identifies the same step again after undo + redo', () => {
    const g = createGrid(2, 1, 0);
    const h = new History();
    expect(h.topId).toBeNull();
    h.begin(); h.set(g, 0, 1); h.commit(g);
    const first = h.topId;
    h.begin(); h.set(g, 1, 1); h.commit(g);
    const second = h.topId;
    expect(second).not.toBe(first);
    h.undo(g);
    expect(h.topId).toBe(first);
    h.redo(g);
    expect(h.topId).toBe(second);
  });
});

describe('resizeGrid', () => {
  it('keeps the top-left area and pads with air', () => {
    const g = createGrid(2, 2, 0);
    g.cells.set([1, 2, 3, 4]);
    expect(rows(resizeGrid(g, 3, 1))).toEqual([[1, 2, AIR]]);
    expect(rows(resizeGrid(g, 1, 3))).toEqual([[1], [3], [AIR]]);
  });
});
