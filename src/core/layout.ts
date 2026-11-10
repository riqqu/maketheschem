// Where each editor cell goes in the world, shared by every exporter and the .schem importer.
import type { Orientation } from './types';

/** The side a wall's picture faces, i.e. where the viewer stands. Floors ignore it. */
export type Facing = 'south' | 'north' | 'east' | 'west';
export const FACINGS: readonly Facing[] = ['south', 'west', 'north', 'east'];

export interface BlockPos {
  x: number;
  y: number;
  z: number;
}

export interface Layout {
  /** Schematic size: X (width), Y (height), Z (length). */
  width: number;
  height: number;
  length: number;
  /** World position of an editor cell (row 0 = top row). */
  blockPos(col: number, row: number): BlockPos;
  /** Editor cell index (row * gridWidth + col) at a world position inside the layout. */
  cellAt(x: number, y: number, z: number): number;
}

/**
 * floor: the grid lies in the X-Z plane (columns -> +X/east, rows -> +Z/south), read from above with north at the top.
 * wall:  the grid stands upright, top row highest. Columns run left to right as seen by a viewer standing on the
 *        `facing` side: south x = col, north x = W-1-col, west z = col, east z = W-1-col.
 */
export function layout(gridW: number, gridH: number, orientation: Orientation, facing: Facing = 'south'): Layout {
  if (orientation === 'floor') {
    return {
      width: gridW, height: 1, length: gridH,
      blockPos: (col, row) => ({ x: col, y: 0, z: row }),
      cellAt: (x, _y, z) => z * gridW + x,
    };
  }
  const rowOf = (y: number) => gridH - 1 - y;
  switch (facing) {
    case 'south':
      return {
        width: gridW, height: gridH, length: 1,
        blockPos: (col, row) => ({ x: col, y: gridH - 1 - row, z: 0 }),
        cellAt: (x, y) => rowOf(y) * gridW + x,
      };
    case 'north':
      return {
        width: gridW, height: gridH, length: 1,
        blockPos: (col, row) => ({ x: gridW - 1 - col, y: gridH - 1 - row, z: 0 }),
        cellAt: (x, y) => rowOf(y) * gridW + (gridW - 1 - x),
      };
    case 'west':
      return {
        width: 1, height: gridH, length: gridW,
        blockPos: (col, row) => ({ x: 0, y: gridH - 1 - row, z: col }),
        cellAt: (_x, y, z) => rowOf(y) * gridW + z,
      };
    case 'east':
      return {
        width: 1, height: gridH, length: gridW,
        blockPos: (col, row) => ({ x: 0, y: gridH - 1 - row, z: gridW - 1 - col }),
        cellAt: (_x, y, z) => rowOf(y) * gridW + (gridW - 1 - z),
      };
  }
}

const COMPASS = ['north', 'east', 'south', 'west'] as const;

/** Clockwise quarter turns (seen from above) that take a south-facing wall to `facing`. */
export function quarterTurns(facing: Facing): number {
  return (COMPASS.indexOf(facing) - COMPASS.indexOf('south') + 4) % 4;
}

/**
 * Rotates the direction-dependent properties of a block state ("minecraft:x[facing=south,axis=x]") by the same
 * turn as the wall, so the face the viewer sees stays the one shown in the editor.
 */
export function rotateState(state: string, facing: Facing): string {
  const turns = quarterTurns(facing);
  const open = state.indexOf('[');
  if (turns === 0 || open < 0 || !state.endsWith(']')) return state;
  const props = state.slice(open + 1, -1).split(',').map((kv) => {
    const [k, v] = kv.split('=');
    if (k === 'facing') {
      const i = COMPASS.indexOf(v as (typeof COMPASS)[number]);
      return i < 0 ? kv : `${k}=${COMPASS[(i + turns) % 4]}`;
    }
    if (k === 'axis' && turns % 2 === 1 && (v === 'x' || v === 'z')) return `${k}=${v === 'x' ? 'z' : 'x'}`;
    return kv;
  });
  return `${state.slice(0, open)}[${props.join(',')}]`;
}

/** "minecraft:oak_log[axis=y]" -> "oak_log"; other namespaces keep their prefix. */
export function stateId(state: string): string {
  const open = state.indexOf('[');
  const name = open < 0 ? state : state.slice(0, open);
  return name.startsWith('minecraft:') ? name.slice('minecraft:'.length) : name;
}
