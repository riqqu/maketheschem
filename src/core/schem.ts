// Sponge Schematic v3 (.schem) as read by WorldEdit 7.3+ and FAWE.
// Spec: https://github.com/SpongePowered/Schematic-Specification/blob/master/versions/schematic-3.md
import type { Grid } from './grid';
import { gzip } from './gzip';
import { layout, rotateState, type Facing } from './layout';
import { nbt, writeNbt, writeVarInt, type NbtTag } from './nbt';
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

export interface SchemInput {
  grid: Grid;
  blocks: readonly BlockInfo[];
  orientation: Orientation;
  /** Walls only; defaults to south. */
  facing?: Facing;
  dataVersion: number;
  name: string;
  /** Milliseconds since epoch; defaults to now. */
  date?: number;
}

/**
 * Block states in the order the spec stores them (x fastest, then z, then y) as indices into a palette
 * that starts with air and numbers the rest in order of first use. Shared with the Litematica writer.
 */
export function voxelize(input: Pick<SchemInput, 'grid' | 'blocks' | 'orientation' | 'facing'>) {
  const { grid, blocks, orientation } = input;
  const facing = orientation === 'wall' ? input.facing ?? 'south' : 'south';
  const l = layout(grid.width, grid.height, orientation, facing);
  if (l.width > 0xffff || l.height > 0xffff || l.length > 0xffff) throw new Error('Schematic too large');

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

  const indices = new Uint32Array(l.width * l.height * l.length);
  let k = 0;
  for (let y = 0; y < l.height; y++) {
    for (let z = 0; z < l.length; z++) {
      for (let x = 0; x < l.width; x++) indices[k++] = paletteIndexOf(grid.cells[l.cellAt(x, y, z)]);
    }
  }
  return { width: l.width, height: l.height, length: l.length, facing, states, indices };
}

export function buildSchematicNbt(input: SchemInput): Uint8Array {
  const v = voxelize(input);
  const data: number[] = [];
  for (const i of v.indices) writeVarInt(data, i);

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
          Orientation: nbt.string(input.orientation),
          Facing: nbt.string(v.facing),
        }),
      }),
      Width: nbt.short(v.width),
      Height: nbt.short(v.height),
      Length: nbt.short(v.length),
      Offset: nbt.intArray([0, 0, 0]),
      Blocks: nbt.compound({
        Palette: nbt.compound(paletteTag),
        Data: nbt.byteArray(Uint8Array.from(data)),
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
