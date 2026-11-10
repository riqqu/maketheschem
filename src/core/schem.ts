// Sponge Schematic v3 (.schem) as read by WorldEdit 7.3+ and FAWE.
// Spec: https://github.com/SpongePowered/Schematic-Specification/blob/master/versions/schematic-3.md
import type { Grid } from './grid';
import { gzip } from './gzip';
import { layout, rotateState, type Facing } from './layout';
import { volumeFromGrid, type Volume } from './volume';
import { nbt, writeNbt, type NbtTag } from './nbt';
import { AIR, type BlockInfo, type Orientation } from './types';

export { gzip } from './gzip';

const AIR_STATE = 'minecraft:air';
/** Our own Metadata entry: lets the importer restore the exact orientation and facing. */
export const META_KEY = 'MakeTheSchem';

export interface SchemDimensions {
  width: number; // X
  height: number; // Y
  length: number; // Z
}

/** See `layout()`: floors lie in the X-Z plane, walls stand upright facing `facing` (south by default). */
export function schemDimensions(
  gridWidth: number, gridHeight: number, orientation: Orientation, facing: Facing = 'south',
): SchemDimensions {
  const { width, height, length } = layout(gridWidth, gridHeight, orientation, facing);
  return { width, height, length };
}

/** Schematic block position of an editor cell (south-facing walls). */
export function cellToBlockPos(col: number, row: number, gridHeight: number, orientation: Orientation) {
  return orientation === 'floor' ? { x: col, y: 0, z: row } : { x: col, y: gridHeight - 1 - row, z: 0 };
}

/** What to export: a one-layer art placed by orientation/facing, or a ready 3D volume (e.g. from a model). */
export type SchemSource =
  | {
      grid: Grid;
      orientation: Orientation;
      /** Walls only; defaults to south. */
      facing?: Facing;
      volume?: undefined;
    }
  | { volume: Volume; grid?: undefined; orientation?: undefined; facing?: undefined };

export type SchemInput = SchemSource & {
  blocks: readonly BlockInfo[];
  dataVersion: number;
  name: string;
  /** Milliseconds since epoch; defaults to now. */
  date?: number;
};

/**
 * Block states in the order the spec stores them (x fastest, then z, then y) as indices into a palette
 * that starts with air and numbers the rest in order of first use. Shared with the Litematica writer.
 */
export function voxelize(input: SchemSource & Pick<SchemInput, 'blocks'>) {
  const { blocks } = input;
  const facing: Facing = input.volume === undefined && input.orientation === 'wall' ? input.facing ?? 'south' : 'south';
  const vol = input.volume ?? volumeFromGrid(input.grid, input.orientation, facing);
  if (vol.width > 0xffff || vol.height > 0xffff || vol.length > 0xffff) throw new Error('Schematic too large');

  const states: string[] = [AIR_STATE];
  const stateIndex = new Map<string, number>([[AIR_STATE, 0]]);
  const valueToPalette = new Map<number, number>([[AIR, 0]]);
  const paletteIndexOf = (value: number): number => {
    let p = valueToPalette.get(value);
    if (p === undefined) {
      const block = blocks[value];
      if (!block) throw new Error(`Grid contains unknown block index ${value}`);
      const state = rotateState(block.state, facing);
      p = stateIndex.get(state);
      if (p === undefined) {
        p = states.length;
        states.push(state);
        stateIndex.set(state, p);
      }
      valueToPalette.set(value, p);
    }
    return p;
  };

  // The volume is already in x, z, y order.
  const indices = new Uint32Array(vol.cells.length);
  for (let k = 0; k < vol.cells.length; k++) indices[k] = paletteIndexOf(vol.cells[k]);
  return { width: vol.width, height: vol.height, length: vol.length, facing, states, indices };
}

/** Bytes the varint of `n` takes. */
const varIntSize = (n: number) => (n < 0x80 ? 1 : n < 0x4000 ? 2 : n < 0x200000 ? 3 : n < 0x10000000 ? 4 : 5);

export function buildSchematicNbt(input: SchemInput): Uint8Array {
  const v = voxelize(input);
  // Varints straight into bytes: a 3D build can have millions of entries.
  const data = new Uint8Array(v.indices.length * varIntSize(v.states.length - 1));
  let o = 0;
  for (let x of v.indices) {
    while (x >= 0x80) {
      data[o++] = (x & 0x7f) | 0x80;
      x >>>= 7;
    }
    data[o++] = x;
  }

  const paletteTag: Record<string, NbtTag> = {};
  v.states.forEach((state, index) => (paletteTag[state] = nbt.int(index)));

  return writeNbt('', nbt.compound({
    Schematic: nbt.compound({
      Version: nbt.int(3),
      DataVersion: nbt.int(input.dataVersion),
      Metadata: nbt.compound({
        Name: nbt.string(input.name),
        Date: nbt.long(BigInt(Math.floor(input.date ?? Date.now()))),
        [META_KEY]: nbt.compound({
          Orientation: nbt.string(input.volume ? 'model' : input.orientation),
          Facing: nbt.string(v.facing),
        }),
      }),
      Width: nbt.short(v.width),
      Height: nbt.short(v.height),
      Length: nbt.short(v.length),
      Offset: nbt.intArray([0, 0, 0]),
      Blocks: nbt.compound({
        Palette: nbt.compound(paletteTag),
        Data: nbt.byteArray(data.subarray(0, o)),
        BlockEntities: nbt.list('compound', []),
      }),
      Entities: nbt.list('compound', []),
    }),
  }));
}

/** Complete gzipped .schem file contents. */
export async function buildSchem(input: SchemInput): Promise<Uint8Array> {
  return gzip(buildSchematicNbt(input));
}
