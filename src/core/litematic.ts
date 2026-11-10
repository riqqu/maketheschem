// Litematica schematic (.litematic), format version 7 as written by Litematica for Minecraft 1.20.5+.
// Layout follows fi.dy.masa.litematica.schematic.LitematicaSchematic / LitematicaBlockStateContainer.
import { gzip } from './gzip';
import { nbt, writeNbt, type NbtCompound, type NbtTag } from './nbt';
import { voxelize, type SchemInput } from './schem';

export const LITEMATIC_VERSION = 7;
export const LITEMATIC_SUBVERSION = 1;

export interface LitematicInput extends SchemInput {
  author?: string;
  description?: string;
}

/** Bits per palette index: at least 2, enough for every palette entry. */
export const bitsFor = (paletteSize: number) => Math.max(2, 32 - Math.clz32(Math.max(1, paletteSize - 1)));

/**
 * Packs values tightly, `bits` each, low bits first; an entry may span two longs (LitematicaBitArray).
 * Returns ceil(n * bits / 64) longs.
 */
export function packBits(values: Uint32Array, bits: number): BigInt64Array {
  const longs = Math.ceil((values.length * bits) / 64);
  // A little-endian stream of 32-bit words: long j = words[2j] | words[2j+1] << 32.
  const words = new Uint32Array(longs * 2);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const b = i * bits;
    const w = Math.floor(b / 32);
    const o = b % 32;
    words[w] |= v << o;
    if (o + bits > 32) words[w + 1] |= v >>> (32 - o);
  }
  const out = new BigInt64Array(longs);
  for (let j = 0; j < longs; j++) out[j] = BigInt.asIntN(64, (BigInt(words[2 * j + 1]) << 32n) | BigInt(words[2 * j]));
  return out;
}

/** "minecraft:oak_log[axis=y]" -> { Name: "minecraft:oak_log", Properties: { axis: "y" } } */
function paletteEntry(state: string): NbtTag {
  const open = state.indexOf('[');
  if (open < 0) return nbt.compound({ Name: nbt.string(state) });
  const props: Record<string, NbtTag> = {};
  for (const kv of state.slice(open + 1, -1).split(',')) {
    const [k, v] = kv.split('=');
    props[k] = nbt.string(v);
  }
  return nbt.compound({ Name: nbt.string(state.slice(0, open)), Properties: nbt.compound(props) });
}

const vec3 = (x: number, y: number, z: number) => nbt.compound({ x: nbt.int(x), y: nbt.int(y), z: nbt.int(z) });

export function buildLitematicNbt(input: LitematicInput): Uint8Array {
  const v = voxelize(input);
  const bits = bitsFor(v.states.length);
  let totalBlocks = 0;
  for (const i of v.indices) if (i !== 0) totalBlocks++;
  const time = BigInt(Math.floor(input.date ?? Date.now()));

  const region: NbtCompound = nbt.compound({
    Position: vec3(0, 0, 0),
    Size: vec3(v.width, v.height, v.length),
    BlockStatePalette: nbt.list('compound', v.states.map(paletteEntry)),
    BlockStates: nbt.longArray(packBits(v.indices, bits)),
    TileEntities: nbt.list('compound', []),
    Entities: nbt.list('compound', []),
    PendingBlockTicks: nbt.list('compound', []),
    PendingFluidTicks: nbt.list('compound', []),
  });

  return writeNbt('', nbt.compound({
    MinecraftDataVersion: nbt.int(input.dataVersion),
    Version: nbt.int(LITEMATIC_VERSION),
    SubVersion: nbt.int(LITEMATIC_SUBVERSION),
    Metadata: nbt.compound({
      Name: nbt.string(input.name),
      Author: nbt.string(input.author ?? ''),
      Description: nbt.string(input.description ?? ''),
      EnclosingSize: vec3(v.width, v.height, v.length),
      RegionCount: nbt.int(1),
      TotalVolume: nbt.int(v.width * v.height * v.length),
      TotalBlocks: nbt.int(totalBlocks),
      TimeCreated: nbt.long(time),
      TimeModified: nbt.long(time),
    }),
    Regions: nbt.compound({ [input.name || 'pixel_art']: region }),
  }));
}

/** Complete gzipped .litematic file contents. */
export async function buildLitematic(input: LitematicInput): Promise<Uint8Array> {
  return gzip(buildLitematicNbt(input));
}
