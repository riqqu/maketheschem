// Reads Sponge schematics (.schem v1-v3, as written by WorldEdit 7+ and this app) back into an editor grid.
import { createGrid, type Grid } from './grid';
import { maybeGunzip } from './gzip';
import { FACINGS, layout, stateId, type Facing } from './layout';
import { child, numberChild, readNbt, type NbtCompound } from './nbt';
import { META_KEY } from './schem';
import { AIR, type BlockInfo, type Orientation } from './types';

export interface ParsedSchem {
  width: number; // X
  height: number; // Y
  length: number; // Z
  dataVersion: number | null;
  name: string | null;
  /** Orientation and facing recorded by this app, if the file came from it. */
  hint: { orientation: Orientation; facing: Facing } | null;
  /** Palette states by index. */
  states: string[];
  /** Palette index per block, x fastest, then z, then y. */
  indices: Uint32Array;
}

const AIR_STATES = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air', 'minecraft:structure_void']);

function decodeVarInts(bytes: Uint8Array, count: number): Uint32Array {
  const out = new Uint32Array(count);
  let k = 0, value = 0, shift = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    value |= (b & 0x7f) << shift;
    if (b & 0x80) {
      shift += 7;
      if (shift > 28) throw new Error('Corrupt block data (varint too long)');
    } else {
      if (k >= count) throw new Error('Block data is longer than the schematic size');
      out[k++] = value >>> 0;
      value = 0;
      shift = 0;
    }
  }
  if (k !== count) throw new Error(`Block data has ${k} entries, expected ${count}`);
  return out;
}

export function parseSchemNbt(root: NbtCompound): ParsedSchem {
  // v3 wraps everything in a "Schematic" compound; v1/v2 keep it at the root.
  const s = child(root, 'Schematic', 'compound') ?? root;
  const blocks = child(s, 'Blocks', 'compound');
  let palette = child(blocks, 'Palette', 'compound');
  let data = child(blocks, 'Data', 'byteArray');
  if (!palette || !data) {
    palette = child(s, 'Palette', 'compound');
    data = child(s, 'BlockData', 'byteArray');
  }
  if (!palette || !data) {
    if (child(s, 'Blocks', 'byteArray') || child(s, 'Materials', 'string')) {
      throw new Error('This is an old MCEdit .schematic file. Only Sponge .schem files (WorldEdit 7 and newer) can be opened.');
    }
    throw new Error('Not a Sponge schematic: no block palette found.');
  }

  const dim = (n: string) => {
    const v = numberChild(s, n);
    if (v === undefined) throw new Error(`Schematic has no ${n}`);
    return v & 0xffff;
  };
  const width = dim('Width'), height = dim('Height'), length = dim('Length');
  if (width * height * length === 0) throw new Error('The schematic is empty.');

  let max = 0;
  const byIndex = new Map<number, string>();
  for (const [state, tag] of Object.entries(palette.value)) {
    if (tag.type !== 'int') continue;
    byIndex.set(tag.value, state);
    max = Math.max(max, tag.value);
  }
  const states = Array.from({ length: max + 1 }, (_, i) => byIndex.get(i) ?? 'minecraft:air');
  const indices = decodeVarInts(data.value, width * height * length);
  for (const i of indices) if (i > max) throw new Error('Block data refers to a missing palette entry');

  const meta = child(s, 'Metadata', 'compound');
  const ours = child(meta, META_KEY, 'compound');
  const o = child(ours, 'Orientation', 'string')?.value;
  const f = child(ours, 'Facing', 'string')?.value as Facing | undefined;
  const hint = (o === 'wall' || o === 'floor') && f && FACINGS.includes(f) ? { orientation: o as Orientation, facing: f } : null;

  return {
    width, height, length,
    dataVersion: numberChild(s, 'DataVersion') ?? null,
    name: child(meta, 'Name', 'string')?.value ?? child(s, 'Name', 'string')?.value ?? null,
    hint, states, indices,
  };
}

export async function parseSchem(bytes: Uint8Array): Promise<ParsedSchem> {
  let raw: Uint8Array;
  try {
    raw = await maybeGunzip(bytes);
  } catch {
    throw new Error('The file is not a valid (gzip-compressed) schematic.');
  }
  return parseSchemNbt(readNbt(raw).root);
}

export interface SchemGrid {
  grid: Grid;
  orientation: Orientation;
  facing: Facing;
  /** Block states that matched no usable block (now air), with their counts. */
  unknown: Map<string, number>;
}

export interface GridLimits {
  maxSide: number;
  maxWallHeight: number;
}

/** Maps a parsed one-layer schematic onto a grid of `blocks` indices. */
export function schemToGrid(p: ParsedSchem, blocks: readonly BlockInfo[], limits: GridLimits): SchemGrid {
  let orientation: Orientation;
  let facing: Facing;
  let gridW: number, gridH: number;
  if (p.height === 1) {
    orientation = 'floor';
    facing = 'south';
    gridW = p.width;
    gridH = p.length;
  } else if (p.length === 1) {
    orientation = 'wall';
    facing = p.hint?.orientation === 'wall' && (p.hint.facing === 'north' || p.hint.facing === 'south') ? p.hint.facing : 'south';
    gridW = p.width;
    gridH = p.height;
  } else if (p.width === 1) {
    orientation = 'wall';
    facing = p.hint?.orientation === 'wall' && p.hint.facing === 'east' ? 'east' : 'west';
    gridW = p.length;
    gridH = p.height;
  } else {
    throw new Error(
      `This schematic is ${p.width} × ${p.height} × ${p.length}. Only one-block-thick builds (a wall or a floor) can be opened.`,
    );
  }
  const maxH = orientation === 'wall' ? limits.maxWallHeight : limits.maxSide;
  if (gridW > limits.maxSide || gridH > maxH) {
    throw new Error(`This ${orientation} is ${gridW} × ${gridH}; the editor allows at most ${limits.maxSide} × ${maxH}.`);
  }

  const byState = new Map<string, number>();
  const byId = new Map<string, number>();
  blocks.forEach((b, i) => {
    byState.set(b.state, i);
    if (!byId.has(b.id)) byId.set(b.id, i);
  });
  const unknown = new Map<string, number>();
  const valueOf = p.states.map((state) => {
    if (AIR_STATES.has(state)) return AIR;
    return byState.get(state) ?? byId.get(stateId(state)) ?? -1;
  });

  const grid = createGrid(gridW, gridH);
  const l = layout(gridW, gridH, orientation, facing);
  for (let row = 0; row < gridH; row++) {
    for (let col = 0; col < gridW; col++) {
      const { x, y, z } = l.blockPos(col, row);
      const pi = p.indices[x + z * p.width + y * p.width * p.length];
      const v = valueOf[pi];
      if (v >= 0) grid.cells[row * gridW + col] = v;
      else unknown.set(p.states[pi], (unknown.get(p.states[pi]) ?? 0) + 1);
    }
  }
  return { grid, orientation, facing, unknown };
}
