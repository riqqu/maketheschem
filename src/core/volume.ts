// A 3D block volume in schematic order: x fastest, then z, then y (the Sponge v3 / WorldEdit order).
import type { Grid } from './grid';
import { layout, type Facing } from './layout';
import { AIR, type Orientation } from './types';

export interface Volume {
  /** X */
  width: number;
  /** Y */
  height: number;
  /** Z */
  length: number;
  /** Block indices (AIR for none), index `(y * length + z) * width + x`. */
  cells: Uint16Array;
}

export const volumeIndex = (v: Pick<Volume, 'width' | 'length'>, x: number, y: number, z: number) =>
  (y * v.length + z) * v.width + x;

export function createVolume(width: number, height: number, length: number, fill = AIR): Volume {
  return { width, height, length, cells: new Uint16Array(width * height * length).fill(fill) };
}

/** Places a one-layer grid in the world the same way the exporters always have (see `layout()`). */
export function volumeFromGrid(grid: Grid, orientation: Orientation, facing: Facing = 'south'): Volume {
  const l = layout(grid.width, grid.height, orientation, facing);
  const v = createVolume(l.width, l.height, l.length);
  let k = 0;
  for (let y = 0; y < l.height; y++) {
    for (let z = 0; z < l.length; z++) {
      for (let x = 0; x < l.width; x++) v.cells[k++] = grid.cells[l.cellAt(x, y, z)];
    }
  }
  return v;
}

/** How many of each block (air not counted). */
export function countCells(cells: ArrayLike<number>): Map<number, number> {
  const counts = new Map<number, number>();
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i];
    if (v !== AIR) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
}
