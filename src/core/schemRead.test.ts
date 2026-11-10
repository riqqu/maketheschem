import { describe, expect, it } from 'vitest';
import { createGrid, type Grid } from './grid';
import { gzip } from './gzip';
import { FACINGS } from './layout';
import { nbt, writeNbt, writeVarInt, type NbtTag } from './nbt';
import { buildSchem } from './schem';
import { parseSchem, schemToGrid } from './schemRead';
import { AIR, type BlockInfo, type Orientation } from './types';

const block = (id: string, state = `minecraft:${id}`): BlockInfo => ({
  id, state, name: id, category: 'Test', gravity: false,
  top: { rgb: [0, 0, 0], tile: 0, texture: '' },
  side: { rgb: [0, 0, 0], tile: 0, texture: '' },
});

const BLOCKS = [
  block('white_concrete'),
  block('oak_log', 'minecraft:oak_log[axis=y]'),
  block('stone'),
  block('white_glazed_terracotta', 'minecraft:white_glazed_terracotta[facing=south]'),
];
const LIMITS = { maxSide: 1024, maxWallHeight: 384 };

// An asymmetric picture so mirroring or flipping shows up.
function sampleGrid(): Grid {
  const g = createGrid(4, 3);
  g.cells.set([0, 1, AIR, 3, 2, 0, 1, AIR, AIR, AIR, 2, 3]);
  return g;
}

const roundTrip = async (orientation: Orientation, facing: (typeof FACINGS)[number]) => {
  const file = await buildSchem({ grid: sampleGrid(), blocks: BLOCKS, orientation, facing, dataVersion: 5023, name: 'art' });
  const parsed = await parseSchem(file);
  return { parsed, ...schemToGrid(parsed, BLOCKS, LIMITS) };
};

/** A v2-style schematic: palette and block data at the root. */
function v2File(width: number, height: number, length: number, palette: Record<string, number>, indices: number[]) {
  const data: number[] = [];
  for (const i of indices) writeVarInt(data, i);
  const pal: Record<string, NbtTag> = {};
  for (const [k, v] of Object.entries(palette)) pal[k] = nbt.int(v);
  return writeNbt('Schematic', nbt.compound({
    Version: nbt.int(2),
    DataVersion: nbt.int(3465),
    Width: nbt.short(width),
    Height: nbt.short(height),
    Length: nbt.short(length),
    PaletteMax: nbt.int(Object.keys(palette).length),
    Palette: nbt.compound(pal),
    BlockData: nbt.byteArray(Uint8Array.from(data)),
  }));
}

describe('parseSchem + schemToGrid', () => {
  it('round-trips floors exactly', async () => {
    const r = await roundTrip('floor', 'south');
    expect(r.orientation).toBe('floor');
    expect([r.grid.width, r.grid.height]).toEqual([4, 3]);
    expect([...r.grid.cells]).toEqual([...sampleGrid().cells]);
    expect(r.parsed.name).toBe('art');
    expect(r.parsed.dataVersion).toBe(5023);
    expect(r.unknown.size).toBe(0);
  });

  it.each(FACINGS)('round-trips a %s-facing wall exactly', async (facing) => {
    const r = await roundTrip('wall', facing);
    expect(r.orientation).toBe('wall');
    expect(r.facing).toBe(facing);
    expect([r.grid.width, r.grid.height]).toEqual([4, 3]);
    expect([...r.grid.cells]).toEqual([...sampleGrid().cells]);
    // Rotated glazed terracotta still maps back by id.
    expect(r.unknown.size).toBe(0);
  });

  it('reads v2 files (uncompressed too) and maps unknown states to air', async () => {
    // 2 wide, 2 tall, 1 long: a south-facing wall. Bottom row y=0 is the editor's last row.
    const raw = v2File(2, 2, 1, { 'minecraft:air': 0, 'minecraft:stone': 1, 'minecraft:oak_log[axis=x]': 2, 'mod:weird': 3 }, [1, 2, 3, 0]);
    for (const bytes of [raw, await gzip(raw)]) {
      const parsed = await parseSchem(bytes);
      expect(parsed.hint).toBeNull();
      const r = schemToGrid(parsed, BLOCKS, LIMITS);
      expect(r.orientation).toBe('wall');
      expect(r.facing).toBe('south');
      expect([...r.grid.cells]).toEqual([AIR, AIR, 2, 1]);
      expect([...r.unknown]).toEqual([['mod:weird', 1]]);
    }
  });

  it('treats a schematic one block wide in X as a west-facing wall', async () => {
    const parsed = await parseSchem(v2File(1, 1, 3, { 'minecraft:air': 0, 'minecraft:stone': 1 }, [1, 0, 1]));
    // Height 1 wins: that is a floor strip.
    expect(schemToGrid(parsed, BLOCKS, LIMITS).orientation).toBe('floor');
    const wall = await parseSchem(v2File(1, 2, 3, { 'minecraft:air': 0, 'minecraft:stone': 1 }, [1, 0, 0, 0, 0, 0]));
    const r = schemToGrid(wall, BLOCKS, LIMITS);
    expect([r.orientation, r.facing, r.grid.width, r.grid.height]).toEqual(['wall', 'west', 3, 2]);
    expect(r.grid.cells[3]).toBe(2); // bottom-left as seen from the west = z 0
  });

  it('rejects builds thicker than one block', async () => {
    const parsed = await parseSchem(v2File(2, 2, 2, { 'minecraft:air': 0 }, [0, 0, 0, 0, 0, 0, 0, 0]));
    expect(() => schemToGrid(parsed, BLOCKS, LIMITS)).toThrow(/one-block-thick/);
  });

  it('rejects walls taller than the limit', async () => {
    const parsed = await parseSchem(v2File(1, 3, 1, { 'minecraft:air': 0 }, [0, 0, 0]));
    expect(() => schemToGrid({ ...parsed, width: 1, height: 3, length: 1 }, BLOCKS, { maxSide: 8, maxWallHeight: 2 })).toThrow(/at most/);
  });

  it('explains legacy MCEdit files and garbage', async () => {
    const legacy = writeNbt('Schematic', nbt.compound({ Materials: nbt.string('Alpha'), Blocks: nbt.byteArray(new Uint8Array(1)) }));
    await expect(parseSchem(legacy)).rejects.toThrow(/MCEdit/);
    await expect(parseSchem(Uint8Array.from([0x1f, 0x8b, 1, 2, 3]))).rejects.toThrow();
    await expect(parseSchem(Uint8Array.from([1, 2, 3]))).rejects.toThrow();
  });

  it('detects block data that does not match the size', async () => {
    await expect(parseSchem(v2File(2, 1, 1, { 'minecraft:air': 0 }, [0]))).rejects.toThrow(/expected 2/);
  });
});
