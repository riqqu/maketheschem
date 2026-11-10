// Grid <-> storable form. Cells refer to block ids (not indices) so saved art survives a different block list.
import { createGrid, type Grid } from './grid';
import { AIR, type BlockInfo } from './types';

export interface EncodedGrid {
  width: number;
  height: number;
  /** Block ids used, in order of first use. */
  ids: string[];
  /** Index into `ids` per cell, AIR (0xffff) for air. */
  cells: Uint16Array;
}

export function encodeGrid(grid: Grid, blocks: readonly BlockInfo[]): EncodedGrid {
  const ids: string[] = [];
  const local = new Map<number, number>();
  const cells = new Uint16Array(grid.cells.length);
  for (let i = 0; i < grid.cells.length; i++) {
    const v = grid.cells[i];
    if (v === AIR) {
      cells[i] = AIR;
      continue;
    }
    let l = local.get(v);
    if (l === undefined) {
      const block = blocks[v];
      if (!block) throw new Error(`Grid contains unknown block index ${v}`);
      l = ids.length;
      ids.push(block.id);
      local.set(v, l);
    }
    cells[i] = l;
  }
  return { width: grid.width, height: grid.height, ids, cells };
}

export interface DecodedGrid {
  grid: Grid;
  /** Ids no longer available (their cells became air), with counts. */
  missing: Map<string, number>;
}

export function decodeGrid(enc: EncodedGrid, indexById: ReadonlyMap<string, number>): DecodedGrid {
  const { width, height } = enc;
  if (!(width > 0 && height > 0) || enc.cells.length !== width * height) throw new Error('Saved grid is corrupt');
  const grid = createGrid(width, height);
  const values = enc.ids.map((id) => indexById.get(id) ?? -1);
  const missing = new Map<string, number>();
  for (let i = 0; i < enc.cells.length; i++) {
    const l = enc.cells[i];
    if (l === AIR) continue;
    const v = values[l] ?? -1;
    if (v >= 0) grid.cells[i] = v;
    else {
      const id = enc.ids[l] ?? '?';
      missing.set(id, (missing.get(id) ?? 0) + 1);
    }
  }
  return { grid, missing };
}

/** Fast content hash (FNV-1a) used to skip saving unchanged art. */
export function hashGrid(grid: Grid): number {
  let h = 0x811c9dc5 ^ grid.width ^ (grid.height << 16);
  const c = grid.cells;
  for (let i = 0; i < c.length; i++) {
    h ^= c[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
