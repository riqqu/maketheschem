import { describe, expect, it } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import {
  buildCommands, commandBlockOutputRule, commandBlockParts, commandBlockPlacement, COMMAND_BLOCK_LIMIT, coversCommandBlock,
  datapackFiles, FILL_LIMIT, functionFolder, mergeBoxes, packMeta, splitBox, type Box, type CommandSet,
} from './commands';
import { createGrid } from './grid';
import { AIR, type BlockInfo } from './types';
import { createVolume, volumeIndex } from './volume';
import { crc32, zip } from './zip';

const block = (id: string, state = `minecraft:${id}`): BlockInfo => ({
  id, state, name: id, category: 'Test', gravity: false,
  top: { rgb: [0, 0, 0], tile: 0, texture: '' },
  side: { rgb: [0, 0, 0], tile: 0, texture: '' },
});
const BLOCKS = [block('white_concrete'), block('stone'), block('white_glazed_terracotta', 'minecraft:white_glazed_terracotta[facing=south]')];

/** Checks that boxes cover every non-air cell exactly once with its own value. */
function expectExactCover(cells: ArrayLike<number>, W: number, H: number, L: number, air: number, boxes: Box[], max = FILL_LIMIT) {
  const seen = new Int32Array(W * H * L).fill(-1);
  for (const b of boxes) {
    expect((b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) * (b.z1 - b.z0 + 1)).toBeLessThanOrEqual(max);
    for (let y = b.y0; y <= b.y1; y++) for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) {
      const i = (y * L + z) * W + x;
      expect(seen[i]).toBe(-1);
      seen[i] = b.value;
    }
  }
  for (let i = 0; i < W * H * L; i++) expect(seen[i]).toBe(cells[i] === air ? -1 : cells[i]);
}

describe('mergeBoxes', () => {
  it('turns a solid cube into one box', () => {
    const v = createVolume(4, 4, 4, 1);
    expect(mergeBoxes(v.cells, 4, 4, 4, AIR)).toEqual([{ x0: 0, y0: 0, z0: 0, x1: 3, y1: 3, z1: 3, value: 1 }]);
  });

  it('covers mixed volumes exactly, bottom layer first, within the volume limit', () => {
    const v = createVolume(7, 5, 6);
    for (let y = 0; y < 5; y++) for (let z = 0; z < 6; z++) for (let x = 0; x < 7; x++) {
      const h = (x * 7 + y * 13 + z * 3) % 5;
      v.cells[volumeIndex(v, x, y, z)] = h === 0 ? AIR : h < 3 ? 0 : 1;
    }
    for (const max of [FILL_LIMIT, 8, 1]) {
      const boxes = mergeBoxes(v.cells, 7, 5, 6, AIR, max);
      expectExactCover(v.cells, 7, 5, 6, AIR, boxes, max);
      for (let k = 1; k < boxes.length; k++) expect(boxes[k].y0).toBeGreaterThanOrEqual(boxes[k - 1].y0);
    }
  });

  it('respects the fill limit on large solids', () => {
    const v = createVolume(40, 40, 40, 0);
    const boxes = mergeBoxes(v.cells, 40, 40, 40, AIR);
    expectExactCover(v.cells, 40, 40, 40, AIR, boxes);
    expect(boxes.length).toBe(2); // 64000 blocks need two fills
  });
});

describe('splitBox', () => {
  it('tiles a big box with pieces under the limit', () => {
    const parts = splitBox(300, 50, 300);
    const total = parts.reduce((s, b) => s + (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) * (b.z1 - b.z0 + 1), 0);
    expect(total).toBe(300 * 50 * 300);
    for (const b of parts) expect((b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) * (b.z1 - b.z0 + 1)).toBeLessThanOrEqual(FILL_LIMIT);
  });
});

describe('buildCommands', () => {
  // Wall seen from the south: top row "white white stone", bottom row "air white glazed".
  const grid = createGrid(3, 2);
  grid.cells.set([0, 0, 1, AIR, 0, 2]);
  const blocks = BLOCKS;

  it('writes fills and setblocks relative to the player', () => {
    const set = buildCommands({ grid, orientation: 'wall', facing: 'south', blocks }, { placement: { relative: true, x: 1, y: 0, z: 0 }, clear: false });
    expect(set.commands).toEqual([
      'fill ~2 ~ ~ ~2 ~1 ~ white_concrete',
      'setblock ~3 ~ ~ white_glazed_terracotta[facing=south]',
      'setblock ~1 ~1 ~ white_concrete',
      'setblock ~3 ~1 ~ stone',
    ]);
    expect([set.fills, set.setblocks, set.clears]).toEqual([1, 3, 0]);
  });

  it('uses world coordinates, clears first and turns block states with the wall', () => {
    const set = buildCommands(
      { grid, orientation: 'wall', facing: 'east', blocks },
      { placement: { relative: false, x: 100, y: 64, z: -20 }, clear: true },
    );
    expect(set.commands[0]).toBe('fill 100 64 -20 100 65 -18 air');
    expect(set.clears).toBe(1);
    expect(set.commands.some((c) => c.includes('white_glazed_terracotta[facing=east]'))).toBe(true);
    expect(set.commands.every((c) => !c.includes('~'))).toBe(true);
  });

  it('works on 3D volumes', () => {
    const volume = createVolume(2, 2, 2, 1);
    volume.cells[0] = AIR;
    const set = buildCommands({ volume, blocks }, { placement: { relative: true, x: 0, y: 0, z: 0 }, clear: false });
    const placed = set.commands.reduce((n, c) => {
      const nums = c.split(' ').slice(1, -1).map((s) => Number(s.slice(1) || 0));
      return n + (c.startsWith('setblock') ? 1 : (nums[3] - nums[0] + 1) * (nums[4] - nums[1] + 1) * (nums[5] - nums[2] + 1));
    }, 0);
    expect(placed).toBe(7);
  });
});

describe('datapackFiles', () => {
  const set = (n: number, relative = true): CommandSet => ({
    commands: Array.from({ length: n }, (_, i) => `setblock ~${i} ~ ~ stone`),
    fills: 0, setblocks: n, clears: 0, width: n, height: 1, length: 1, relative,
  });

  it('puts small builds in one function', () => {
    const files = datapackFiles(set(3), { name: 'art', packFormat: [121, 0] });
    expect(files.map((f) => f.path)).toEqual(['pack.mcmeta', 'data/mts/function/art.mcfunction']);
    const fn = files[1].text.split('\n');
    expect(fn.filter((l) => l.startsWith('setblock'))).toHaveLength(3);
    expect(fn.some((l) => l.startsWith('#'))).toBe(true);
    expect(JSON.parse(files[0].text)).toEqual({ pack: { description: 'Make the Schem: art', min_format: [121, 0], max_format: 999 } });
  });

  it('splits big builds into scheduled parts that run at a marker', () => {
    const files = datapackFiles(set(5), { name: 'big', packFormat: [121, 0], partSize: 2 });
    const byPath = new Map(files.map((f) => [f.path, f.text]));
    const entry = byPath.get('data/mts/function/big.mcfunction')!;
    expect(entry).toContain('summon minecraft:marker ~ ~ ~ {Tags:["mts.big"]}');
    expect(entry).toContain('function mts:big/part_1');
    expect(byPath.get('data/mts/function/big/part_1.mcfunction')).toContain('execute at @e[type=minecraft:marker,tag=mts.big,limit=1] run function mts:big/body_1');
    expect(byPath.get('data/mts/function/big/part_1.mcfunction')).toContain('schedule function mts:big/part_2 1t');
    expect(byPath.get('data/mts/function/big/part_3.mcfunction')).toContain('kill @e[type=minecraft:marker,tag=mts.big]');
    const bodies = [1, 2, 3].map((k) => byPath.get(`data/mts/function/big/body_${k}.mcfunction`)!.trim().split('\n'));
    expect(bodies.flat()).toEqual(set(5).commands);
  });

  it('needs no marker for world coordinates', () => {
    const files = datapackFiles(set(5, false), { name: 'abs', packFormat: [121, 0], partSize: 2 });
    expect(files.some((f) => f.text.includes('marker'))).toBe(false);
  });

  it('writes the pack format the target version expects', () => {
    expect(packMeta([48, 0], 'x')).toEqual({ pack: { description: 'x', pack_format: 48 } });
    expect(functionFolder([48, 0])).toBe('function');
    expect(functionFolder([26, 0])).toBe('functions');
    expect(packMeta(null, 'x').pack).toHaveProperty('min_format');
  });
});

describe('commandBlockParts', () => {
  /** Minecart commands in a part, unescaped, in order. */
  const cartsOf = (part: string) =>
    [...part.matchAll(/Command:'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\(.)/g, '$1'));
  /** Brackets balance outside quoted strings. */
  const balanced = (s: string) => {
    const stack: string[] = [];
    let quote: string | null = null;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (quote) {
        if (ch === '\\') i++;
        else if (ch === quote) quote = null;
      } else if (ch === "'" || ch === '"') quote = ch;
      else if (ch === '{' || ch === '[') stack.push(ch);
      else if (ch === '}' || ch === ']') {
        if (stack.pop() !== (ch === '}' ? '{' : '[')) return false;
      }
    }
    return stack.length === 0 && quote === null;
  };
  const commands = Array.from({ length: 900 }, (_, i) => `fill ~${i} ~-2 ~ ~${i} ~1 ~3 white_glazed_terracotta[facing=south]`);

  it('splits commands into parts that fit a command block, in order', () => {
    const parts = commandBlockParts(commands);
    expect(parts.length).toBeGreaterThan(1);
    const all: string[] = [];
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(COMMAND_BLOCK_LIMIT);
      expect(p.startsWith('summon falling_block ~ ~1 ~ {BlockState:{Name:redstone_block}')).toBe(true);
      expect(balanced(p)).toBe(true);
      const carts = cartsOf(p);
      // Every part ends by clearing the rail (keeping the command block) and removing the minecarts.
      expect(carts.slice(-2)).toEqual([
        'setblock ~ ~1 ~ command_block{auto:1,Command:"fill ~ ~ ~ ~ ~-2 ~ air"}',
        'kill @e[type=command_block_minecart,distance=..1]',
      ]);
      all.push(...carts.slice(0, -2));
    }
    expect(all).toEqual(commands);
  });

  it('escapes quotes and backslashes', () => {
    const [part] = commandBlockParts([`say it's a \\ test`]);
    expect(balanced(part)).toBe(true);
    expect(cartsOf(part)[0]).toBe(`say it's a \\ test`);
  });

  it('counts relative positions from the command block, not the minecarts', () => {
    expect(commandBlockPlacement({ relative: true, x: 1, y: 0, z: 0 })).toEqual({ relative: true, x: 1, y: -2, z: 0 });
    expect(commandBlockPlacement({ relative: false, x: 1, y: 64, z: 0 })).toEqual({ relative: false, x: 1, y: 64, z: 0 });
    const size = { width: 4, height: 2, length: 3 };
    expect(coversCommandBlock({ relative: true, x: 0, y: 0, z: 0 }, size)).toBe(true);
    expect(coversCommandBlock({ relative: true, x: 1, y: 0, z: 0 }, size)).toBe(false);
    expect(coversCommandBlock({ relative: true, x: -3, y: 4, z: -2 }, size)).toBe(false);
    expect(coversCommandBlock({ relative: true, x: -3, y: 3, z: -2 }, size)).toBe(true);
  });

  it('names the chat output game rule for the version', () => {
    expect(commandBlockOutputRule([121, 0])).toBe('command_block_output');
    expect(commandBlockOutputRule([88, 0])).toBe('commandBlockOutput');
  });
});

describe('zip', () => {
  /** Reads a zip through its central directory, independently of the writer. */
  const read = (bytes: Uint8Array) => {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocd = bytes.length - 22;
    expect(v.getUint32(eocd, true)).toBe(0x06054b50);
    const count = v.getUint16(eocd + 10, true);
    let p = v.getUint32(eocd + 16, true);
    const out = new Map<string, string>();
    for (let k = 0; k < count; k++) {
      expect(v.getUint32(p, true)).toBe(0x02014b50);
      const method = v.getUint16(p + 10, true);
      const crc = v.getUint32(p + 16, true);
      const size = v.getUint32(p + 20, true);
      const nameLen = v.getUint16(p + 28, true);
      const local = v.getUint32(p + 42, true);
      const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const raw = bytes.subarray(start, start + size);
      const data = method === 8 ? new Uint8Array(inflateRawSync(raw)) : raw;
      expect(crc32(data)).toBe(crc);
      out.set(name, new TextDecoder().decode(data));
      p += 46 + nameLen;
    }
    return out;
  };

  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789')).toString(16)).toBe('cbf43926');
  });

  it('writes archives that unzip to the same files', async () => {
    const enc = new TextEncoder();
    const big = 'fill ~ ~ ~ ~1 ~ ~ stone\n'.repeat(500);
    const bytes = await zip([
      { path: 'pack.mcmeta', data: enc.encode('{"pack":{}}') },
      { path: 'data/mts/function/a.mcfunction', data: enc.encode(big) },
    ]);
    const files = read(bytes);
    expect(files.get('pack.mcmeta')).toBe('{"pack":{}}');
    expect(files.get('data/mts/function/a.mcfunction')).toBe(big);
    expect(bytes.length).toBeLessThan(big.length); // compressed
  });
});
