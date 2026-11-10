import { describe, expect, it } from 'vitest';
import { gunzipSync } from 'node:zlib';
import pnbt from 'prismarine-nbt';
import { createGrid } from './grid';
import { bitsFor, buildLitematic, packBits } from './litematic';
import { AIR, type BlockInfo } from './types';

const block = (id: string, state = `minecraft:${id}`): BlockInfo => ({
  id, state, name: id, category: 'Test', gravity: false,
  top: { rgb: [0, 0, 0], tile: 0, texture: '' },
  side: { rgb: [0, 0, 0], tile: 0, texture: '' },
});

/** Reference unpacker written the way LitematicaBitArray.getAt reads (BigInt maths, entries may span longs). */
function unpack(longs: bigint[], bits: number, count: number): number[] {
  const mask = (1n << BigInt(bits)) - 1n;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const start = BigInt(i * bits);
    const s = Number(start >> 6n), off = start & 63n;
    let v = BigInt.asUintN(64, longs[s]) >> off;
    if (off + BigInt(bits) > 64n) v |= BigInt.asUintN(64, longs[s + 1]) << (64n - off);
    out.push(Number(v & mask));
  }
  return out;
}

const toBigInts = (pairs: [number, number][]) => pairs.map(([hi, lo]) => (BigInt(hi) << 32n) | BigInt(lo >>> 0)).map((v) => BigInt.asIntN(64, v));

describe('bitsFor', () => {
  it('uses at least two bits', () => {
    expect([1, 2, 3, 4, 5, 16, 17, 300].map(bitsFor)).toEqual([2, 2, 2, 2, 3, 4, 5, 9]);
  });
});

describe('packBits', () => {
  it.each([2, 3, 5, 9, 13])('packs %i-bit entries across long boundaries', (bits) => {
    const n = 257;
    const values = Uint32Array.from({ length: n }, (_, i) => (i * 7919) % (1 << bits));
    const longs = packBits(values, bits);
    expect(longs.length).toBe(Math.ceil((n * bits) / 64));
    expect(unpack([...longs], bits, n)).toEqual([...values]);
  });
});

describe('buildLitematic', () => {
  const BLOCKS = Array.from({ length: 17 }, (_, i) => block(`b${i}`));
  BLOCKS[1] = block('oak_log', 'minecraft:oak_log[axis=y]');

  it('writes a version 7 Litematica schematic with a readable region', async () => {
    // A 6x3 wall using 17 different blocks plus air: palette of 18 -> 5 bits, entries span longs.
    const grid = createGrid(6, 3);
    grid.cells.forEach((_, i) => (grid.cells[i] = i < 17 ? i : AIR));
    const file = await buildLitematic({
      grid, blocks: BLOCKS, orientation: 'wall', dataVersion: 5023, name: 'my art', author: 'me', date: 1_700_000_000_000,
    });
    const { parsed } = await pnbt.parse(Buffer.from(gunzipSync(file)));
    const root = parsed.value as Record<string, any>;
    expect(root.Version.value).toBe(7);
    expect(root.SubVersion.value).toBe(1);
    expect(root.MinecraftDataVersion.value).toBe(5023);
    const meta = root.Metadata.value;
    expect(meta.Name.value).toBe('my art');
    expect(meta.Author.value).toBe('me');
    expect(meta.RegionCount.value).toBe(1);
    expect(meta.TotalVolume.value).toBe(18);
    expect(meta.TotalBlocks.value).toBe(17);
    expect([meta.EnclosingSize.value.x.value, meta.EnclosingSize.value.y.value, meta.EnclosingSize.value.z.value]).toEqual([6, 3, 1]);

    const region = root.Regions.value['my art'].value;
    expect([region.Size.value.x.value, region.Size.value.y.value, region.Size.value.z.value]).toEqual([6, 3, 1]);
    const palette = region.BlockStatePalette.value.value as Record<string, any>[];
    expect(palette[0].Name.value).toBe('minecraft:air');
    const names = palette.map((p) => p.Name.value);
    const oak = palette.find((p) => p.Name.value === 'minecraft:oak_log');
    expect(oak?.Properties.value.axis.value).toBe('y');
    expect(region.BlockStates.type).toBe('longArray');
    for (const k of ['TileEntities', 'Entities', 'PendingBlockTicks', 'PendingFluidTicks']) expect(region[k].value.value).toEqual([]);

    const indices = unpack(toBigInts(region.BlockStates.value), bitsFor(palette.length), 18);
    const at = (x: number, y: number, z: number) => names[indices[y * 6 + z * 6 + x]];
    // Editor row 0 (cells 0-5) is the top layer y=2; the last row holds b12..b16 and one air.
    expect(at(0, 2, 0)).toBe('minecraft:b0');
    expect(at(1, 2, 0)).toBe('minecraft:oak_log');
    expect(at(0, 0, 0)).toBe('minecraft:b12');
    expect(at(5, 0, 0)).toBe('minecraft:air');
  });
});
