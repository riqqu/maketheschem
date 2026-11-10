import { describe, expect, it } from 'vitest';
import { gunzipSync } from 'node:zlib';
import pnbt from 'prismarine-nbt';
import { buildSchem, buildSchematicNbt, cellToBlockPos, schemDimensions } from './schem';
import { createGrid, type Grid } from './grid';
import { AIR, type BlockInfo, type Orientation } from './types';

const block = (id: string, state = `minecraft:${id}`): BlockInfo => ({
  id, state, name: id, category: 'Test', gravity: false,
  top: { rgb: [0, 0, 0], tile: 0, texture: '' },
  side: { rgb: [0, 0, 0], tile: 0, texture: '' },
});

const BLOCKS = [block('white_concrete'), block('oak_log', 'minecraft:oak_log[axis=y]'), block('stone')];
const WHITE = 0, OAK = 1, STONE = 2;

// Editor view (row 0 is the top row):
//   [white] [oak]   [air]
//   [stone] [white] [oak]
function sampleGrid(): Grid {
  const g = createGrid(3, 2);
  g.cells.set([WHITE, OAK, AIR, STONE, WHITE, OAK]);
  return g;
}

function decodeVarInts(bytes: number[]): number[] {
  const out: number[] = [];
  let value = 0, shift = 0;
  for (const signed of bytes) {
    const b = signed & 0xff;
    value |= (b & 0x7f) << shift;
    if (b & 0x80) shift += 7;
    else { out.push(value); value = 0; shift = 0; }
  }
  return out;
}

/** Parses a .schem with prismarine-nbt and returns a lookup of block state by x,y,z. */
async function readSchem(file: Uint8Array) {
  const { parsed } = await pnbt.parse(Buffer.from(file));
  const root = parsed.value as Record<string, any>;
  const s = root.Schematic.value;
  const W = s.Width.value & 0xffff, H = s.Height.value & 0xffff, L = s.Length.value & 0xffff;
  const palette = Object.fromEntries(
    Object.entries(s.Blocks.value.Palette.value as Record<string, { value: number }>).map(([state, t]) => [t.value, state]),
  ) as Record<number, string>;
  const indices = decodeVarInts(s.Blocks.value.Data.value);
  return {
    parsed, s, W, H, L, palette, indices,
    at: (x: number, y: number, z: number) => palette[indices[x + z * W + y * W * L]],
  };
}

describe('schemDimensions / cellToBlockPos', () => {
  it('lays a floor in the X-Z plane', () => {
    expect(schemDimensions(3, 2, 'floor')).toEqual({ width: 3, height: 1, length: 2 });
    expect(cellToBlockPos(2, 1, 2, 'floor')).toEqual({ x: 2, y: 0, z: 1 });
  });
  it('stands a wall in the X-Y plane with the top row highest', () => {
    expect(schemDimensions(3, 2, 'wall')).toEqual({ width: 3, height: 2, length: 1 });
    expect(cellToBlockPos(0, 0, 2, 'wall')).toEqual({ x: 0, y: 1, z: 0 });
    expect(cellToBlockPos(0, 1, 2, 'wall')).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('buildSchem', () => {
  const build = (orientation: Orientation, grid = sampleGrid()) =>
    buildSchem({ grid, blocks: BLOCKS, orientation, dataVersion: 5023, name: 'test art', date: 1_700_000_000_000 });

  it('is gzip-compressed NBT', async () => {
    const file = await build('floor');
    expect([file[0], file[1]]).toEqual([0x1f, 0x8b]);
    const raw = buildSchematicNbt({ grid: sampleGrid(), blocks: BLOCKS, orientation: 'floor', dataVersion: 5023, name: 'test art', date: 1_700_000_000_000 });
    expect(new Uint8Array(gunzipSync(file))).toEqual(raw);
  });

  it('writes the Sponge v3 structure WorldEdit expects', async () => {
    const { parsed, s, palette } = await readSchem(await build('floor'));
    expect(parsed.name).toBe('');
    expect(Object.keys(parsed.value)).toEqual(['Schematic']);
    expect(s.Version).toEqual({ type: 'int', value: 3 });
    expect(s.DataVersion).toEqual({ type: 'int', value: 5023 });
    expect(s.Width.type).toBe('short');
    expect(s.Offset).toEqual({ type: 'intArray', value: [0, 0, 0] });
    expect(s.Metadata.value.Name.value).toBe('test art');
    expect(s.Blocks.value.Data.type).toBe('byteArray');
    expect(s.Blocks.value.BlockEntities.value).toEqual({ type: 'compound', value: [] });
    expect(s.Entities.value).toEqual({ type: 'compound', value: [] });
    // Air is 0 and indices are contiguous.
    expect(palette[0]).toBe('minecraft:air');
    expect(Object.keys(palette).map(Number).sort()).toEqual([0, 1, 2, 3]);
    expect(Object.values(palette)).toContain('minecraft:oak_log[axis=y]');
  });

  it('places floor cells at x = column, z = row', async () => {
    const { W, H, L, at, indices } = await readSchem(await build('floor'));
    expect([W, H, L]).toEqual([3, 1, 2]);
    expect(indices).toHaveLength(6);
    expect(at(0, 0, 0)).toBe('minecraft:white_concrete');
    expect(at(1, 0, 0)).toBe('minecraft:oak_log[axis=y]');
    expect(at(2, 0, 0)).toBe('minecraft:air');
    expect(at(0, 0, 1)).toBe('minecraft:stone');
    expect(at(1, 0, 1)).toBe('minecraft:white_concrete');
    expect(at(2, 0, 1)).toBe('minecraft:oak_log[axis=y]');
  });

  it('places wall cells at x = column, y = flipped row', async () => {
    const { W, H, L, at } = await readSchem(await build('wall'));
    expect([W, H, L]).toEqual([3, 2, 1]);
    // Top editor row is the highest layer.
    expect(at(0, 1, 0)).toBe('minecraft:white_concrete');
    expect(at(1, 1, 0)).toBe('minecraft:oak_log[axis=y]');
    expect(at(2, 1, 0)).toBe('minecraft:air');
    expect(at(0, 0, 0)).toBe('minecraft:stone');
    expect(at(1, 0, 0)).toBe('minecraft:white_concrete');
    expect(at(2, 0, 0)).toBe('minecraft:oak_log[axis=y]');
  });

  it('encodes palette indices above 127 as multi-byte varints', async () => {
    const many = Array.from({ length: 300 }, (_, i) => block(`b${i}`));
    const grid = createGrid(300, 1);
    grid.cells.forEach((_, i) => (grid.cells[i] = 299 - i));
    const file = await buildSchem({ grid, blocks: many, orientation: 'floor', dataVersion: 5023, name: 'x' });
    const { at, indices } = await readSchem(file);
    expect(indices).toHaveLength(300);
    for (let x = 0; x < 300; x++) expect(at(x, 0, 0)).toBe(`minecraft:b${299 - x}`);
  });

  it('refuses grids that reference unknown blocks', () => {
    const grid = createGrid(1, 1, 42);
    expect(() => buildSchematicNbt({ grid, blocks: BLOCKS, orientation: 'floor', dataVersion: 5023, name: 'x' })).toThrow();
  });
});
