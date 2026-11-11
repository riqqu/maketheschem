// "Avoid this block": re-match only the cells of the avoided blocks, leaving every other cell as it is.
import type { Grid, History } from './grid';
import { makeMatcher, type PaletteColor } from './quantize';
import type { RGB } from './types';

export interface Replacement {
  from: number;
  to: number;
  count: number;
}

/**
 * Replaces every cell of the avoided blocks with the block of `palette` closest in colour (OKLab, with the palette's
 * texture penalties, like a fresh match). Blocks of `palette` that are avoided themselves are never used. One undo
 * step. `colors` is indexed by block value. Returns what became what; empty when nothing changed.
 */
export function avoidBlocks(
  grid: Grid, history: History, avoided: ReadonlySet<number>, palette: readonly PaletteColor[], colors: readonly RGB[],
): Replacement[] {
  const allowed = palette.filter((p) => !avoided.has(p.value));
  if (allowed.length === 0 || avoided.size === 0) return [];
  const nearest = makeMatcher(allowed);
  const target = new Map<number, number>();
  for (const from of avoided) {
    const rgb = colors[from];
    if (rgb) target.set(from, allowed[nearest(Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2]))].value);
  }

  const counts = new Map<number, number>();
  history.begin();
  for (let i = 0; i < grid.cells.length; i++) {
    const from = grid.cells[i];
    const to = target.get(from);
    if (to !== undefined && history.set(grid, i, to)) counts.set(from, (counts.get(from) ?? 0) + 1);
  }
  history.commit(grid);
  return [...counts].map(([from, count]) => ({ from, to: target.get(from)!, count }));
}
