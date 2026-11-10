// Sponge Schematic v3 (.schem) as read by WorldEdit 7.3+ and FAWE.
// Spec: https://github.com/SpongePowered/Schematic-Specification/blob/master/versions/schematic-3.md
import type { Grid } from './grid';
import { nbt, writeNbt, writeVarInt, type NbtTag } from './nbt';
import { AIR, type BlockInfo, type Orientation } from './types';

const AIR_STATE = 'minecraft:air';

export interface SchemDimensions {
  width: number; // X
  height: number; // Y
  length: number; // Z
}

/**
 * floor: the grid lies in the X-Z plane at y=0 (columns -> +X/east, rows -> +Z/south).
 *        Reads correctly from above with north at the top.
 * wall:  the grid stands in the X-Y plane at z=0 (columns -> +X/east, rows -> down).
 *        Reads correctly from the south side looking north.
 */
export function schemDimensions(gridWidth: number, gridHeight: number, orientation: Orientation): SchemDimensions {
  return orientation === 'floor'
    ? { width: gridWidth, height: 1, length: gridHeight }
    : { width: gridWidth, height: gridHeight, length: 1 };
}

/** Schematic block position of an editor cell. */
export function cellToBlockPos(col: number, row: number, gridHeight: number, orientation: Orientation) {
  return orientation === 'floor' ? { x: col, y: 0, z: row } : { x: col, y: gridHeight - 1 - row, z: 0 };
}

export interface SchemInput {
  grid: Grid;
  blocks: readonly BlockInfo[];
  orientation: Orientation;
  dataVersion: number;
  name: string;
  /** Milliseconds since epoch; defaults to now. */
  date?: number;
}

export function buildSchematicNbt(input: SchemInput): Uint8Array {
  const { grid, blocks, orientation, dataVersion } = input;
  const dims = schemDimensions(grid.width, grid.height, orientation);
  if (dims.width > 0xffff || dims.height > 0xffff || dims.length > 0xffff) throw new Error('Schematic too large');

  // Palette: air is always 0, the rest numbered in order of first use (contiguous, no gaps).
  const palette = new Map<string, number>([[AIR_STATE, 0]]);
  const valueToPalette = new Map<number, number>([[AIR, 0]]);
  const paletteIndexOf = (value: number): number => {
    let p = valueToPalette.get(value);
    if (p === undefined) {
      const block = blocks[value];
      if (!block) throw new Error(`Grid contains unknown block index ${value}`);
      p = palette.get(block.state);
      if (p === undefined) {
        p = palette.size;
        palette.set(block.state, p);
      }
      valueToPalette.set(value, p);
    }
    return p;
  };

  // Block data in the spec's order: index = x + z * Width + y * Width * Length.
  const data: number[] = [];
  for (let y = 0; y < dims.height; y++) {
    for (let z = 0; z < dims.length; z++) {
      for (let x = 0; x < dims.width; x++) {
        const row = orientation === 'floor' ? z : grid.height - 1 - y;
        writeVarInt(data, paletteIndexOf(grid.cells[row * grid.width + x]));
      }
    }
  }

  const paletteTag: Record<string, NbtTag> = {};
  for (const [state, index] of palette) paletteTag[state] = nbt.int(index);

  return writeNbt('', nbt.compound({
    Schematic: nbt.compound({
      Version: nbt.int(3),
      DataVersion: nbt.int(dataVersion),
      Metadata: nbt.compound({
        Name: nbt.string(input.name),
        Date: nbt.long(BigInt(Math.floor(input.date ?? Date.now()))),
      }),
      Width: nbt.short(dims.width),
      Height: nbt.short(dims.height),
      Length: nbt.short(dims.length),
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

export async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Complete gzipped .schem file contents. */
export async function buildSchem(input: SchemInput): Promise<Uint8Array> {
  return gzip(buildSchematicNbt(input));
}
