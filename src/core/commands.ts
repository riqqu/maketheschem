// Vanilla commands for building an art or model without WorldEdit: /fill boxes of one block (merged greedily) and
// /setblock for single blocks, packed into a data pack function for creative worlds.
import { voxelize, type SchemInput, type SchemSource } from './schem';

/** Most blocks one /fill may change (game rule max_block_modifications, formerly commandModificationBlockLimit). */
export const FILL_LIMIT = 32768;
/**
 * Commands per function call. A function stops after max_command_sequence_length (formerly maxCommandChainLength,
 * default 65536) commands, so bigger builds are split into parts that run one per tick.
 */
export const PART_SIZE = 20000;
export const NAMESPACE = 'mts';

export interface Box {
  x0: number;
  y0: number;
  z0: number;
  /** Inclusive. */
  x1: number;
  y1: number;
  z1: number;
  value: number;
}

/**
 * Covers every non-air cell exactly once with boxes of a single value, each at most `maxVolume` cells: from the first
 * uncovered cell (y, then z, then x order) grow along x, then z, then y as long as the whole box stays one value.
 * Boxes come out bottom layer first.
 */
export function mergeBoxes(
  cells: ArrayLike<number>, W: number, H: number, L: number, air: number, maxVolume = FILL_LIMIT,
): Box[] {
  const done = new Uint8Array(W * H * L);
  const boxes: Box[] = [];
  const same = (i: number, v: number) => cells[i] === v && !done[i];
  for (let y = 0; y < H; y++) {
    for (let z = 0; z < L; z++) {
      for (let x = 0; x < W; x++) {
        const i = (y * L + z) * W + x;
        const v = cells[i];
        if (v === air || done[i]) continue;

        let x1 = x;
        while (x1 + 1 < W && x1 + 2 - x <= maxVolume && same(i + x1 + 1 - x, v)) x1++;
        const dx = x1 - x + 1;

        let z1 = z;
        grow: while (z1 + 1 < L && dx * (z1 + 2 - z) <= maxVolume) {
          const row = (y * L + z1 + 1) * W + x;
          for (let k = 0; k < dx; k++) if (!same(row + k, v)) break grow;
          z1++;
        }
        const dz = z1 - z + 1;

        let y1 = y;
        grow: while (y1 + 1 < H && dx * dz * (y1 + 2 - y) <= maxVolume) {
          for (let zz = z; zz <= z1; zz++) {
            const row = ((y1 + 1) * L + zz) * W + x;
            for (let k = 0; k < dx; k++) if (!same(row + k, v)) break grow;
          }
          y1++;
        }

        for (let yy = y; yy <= y1; yy++) {
          for (let zz = z; zz <= z1; zz++) done.fill(1, (yy * L + zz) * W + x, (yy * L + zz) * W + x1 + 1);
        }
        boxes.push({ x0: x, y0: y, z0: z, x1, y1, z1, value: v });
      }
    }
  }
  return boxes;
}

/** Splits a W x H x L box into boxes of at most `maxVolume` cells. */
export function splitBox(W: number, H: number, L: number, maxVolume = FILL_LIMIT): Omit<Box, 'value'>[] {
  const dx = Math.min(W, maxVolume);
  const dz = Math.min(L, Math.max(1, Math.floor(maxVolume / dx)));
  const dy = Math.min(H, Math.max(1, Math.floor(maxVolume / (dx * dz))));
  const out: Omit<Box, 'value'>[] = [];
  for (let y = 0; y < H; y += dy) {
    for (let z = 0; z < L; z += dz) {
      for (let x = 0; x < W; x += dx) {
        out.push({ x0: x, y0: y, z0: z, x1: Math.min(W, x + dx) - 1, y1: Math.min(H, y + dy) - 1, z1: Math.min(L, z + dz) - 1 });
      }
    }
  }
  return out;
}

/** Where the build's bottom north-west corner (its minimum x, y, z) goes. */
export interface Placement {
  /** true: offsets from whoever runs the commands (~x ~y ~z); false: world coordinates. */
  relative: boolean;
  x: number;
  y: number;
  z: number;
}

export interface CommandOptions {
  placement: Placement;
  /** Fill the build's whole box with air first, so running it again or over terrain gives a clean result. */
  clear: boolean;
}

export interface CommandSet {
  /** Without the leading slash (as in a function file). */
  commands: string[];
  fills: number;
  setblocks: number;
  /** Air fills from `clear`. */
  clears: number;
  width: number;
  height: number;
  length: number;
  relative: boolean;
}

/** "minecraft:oak_log[axis=y]" -> "oak_log[axis=y]" (commands default to the minecraft namespace). */
const shortState = (state: string) => (state.startsWith('minecraft:') ? state.slice('minecraft:'.length) : state);

export function buildCommands(input: SchemSource & Pick<SchemInput, 'blocks'>, options: CommandOptions): CommandSet {
  const v = voxelize(input);
  const { placement: p } = options;
  const coord = (base: number, n: number) => {
    const c = base + n;
    return p.relative ? (c === 0 ? '~' : `~${c}`) : String(c);
  };
  const pos = (x: number, y: number, z: number) => `${coord(p.x, x)} ${coord(p.y, y)} ${coord(p.z, z)}`;

  const commands: string[] = [];
  let clears = 0, fills = 0, setblocks = 0;
  if (options.clear) {
    for (const b of splitBox(v.width, v.height, v.length)) {
      commands.push(`fill ${pos(b.x0, b.y0, b.z0)} ${pos(b.x1, b.y1, b.z1)} air`);
      clears++;
    }
  }
  const states = v.states.map(shortState);
  for (const b of mergeBoxes(v.indices, v.width, v.height, v.length, 0)) {
    if (b.x0 === b.x1 && b.y0 === b.y1 && b.z0 === b.z1) {
      commands.push(`setblock ${pos(b.x0, b.y0, b.z0)} ${states[b.value]}`);
      setblocks++;
    } else {
      commands.push(`fill ${pos(b.x0, b.y0, b.z0)} ${pos(b.x1, b.y1, b.z1)} ${states[b.value]}`);
      fills++;
    }
  }
  return { commands, fills, setblocks, clears, width: v.width, height: v.height, length: v.length, relative: p.relative };
}

// ---- data pack ----------------------------------------------------------------------------------

export interface PackFile {
  path: string;
  text: string;
}

export interface DatapackOptions {
  /** Function name: lowercase letters, digits, _ and - (see sanitizeName). */
  name: string;
  /** Data pack format [major, minor] of the target Minecraft version; null/undefined = any version from 1.21.9 on. */
  packFormat?: readonly [number, number] | null;
  partSize?: number;
}

/** Formats from 82 (1.21.9) declare min/max_format; before that, pack_format. Folders lost their plural s at 45 (1.21). */
export function packMeta(format: readonly [number, number] | null | undefined, description: string) {
  const [major, minor] = format ?? [82, 0];
  if (major >= 82) return { pack: { description, min_format: [major, minor], max_format: 999 } };
  return { pack: { description, pack_format: major } };
}

export const functionFolder = (format: readonly [number, number] | null | undefined) => ((format?.[0] ?? 82) >= 45 ? 'function' : 'functions');

/** The command that runs the build. */
export const functionCommand = (name: string) => `/function ${NAMESPACE}:${name}`;

/**
 * pack.mcmeta plus `<name>.mcfunction`. Up to `partSize` commands run straight from it. Bigger builds run in parts,
 * one per tick, chained with /schedule. Scheduled functions run at the world spawn, so for relative placement the
 * first call leaves a marker entity where it was run and every part runs at that marker.
 */
export function datapackFiles(set: CommandSet, o: DatapackOptions): PackFile[] {
  const partSize = o.partSize ?? PART_SIZE;
  const fn = `data/${NAMESPACE}/${functionFolder(o.packFormat)}/${o.name}`;
  const id = `${NAMESPACE}:${o.name}`;
  const tag = `${NAMESPACE}.${o.name}`;
  const marker = `@e[type=minecraft:marker,tag=${tag}]`;
  const done = `tellraw @a "Make the Schem: ${o.name} is built (${set.width} x ${set.height} x ${set.length})"`;
  const header = [
    `# Make the Schem: ${o.name}, ${set.width} x ${set.height} x ${set.length}, ${set.commands.length} commands`,
    `# Run: ${functionCommand(o.name)}${set.relative ? ' (builds relative to where you stand)' : ''}`,
  ];
  const files: PackFile[] = [
    { path: 'pack.mcmeta', text: JSON.stringify(packMeta(o.packFormat, `Make the Schem: ${o.name}`), null, 2) + '\n' },
  ];

  if (set.commands.length <= partSize) {
    files.push({ path: `${fn}.mcfunction`, text: [...header, ...set.commands, done, ''].join('\n') });
    return files;
  }

  const parts = Math.ceil(set.commands.length / partSize);
  const entry = [...header, `# ${parts} parts, one per tick`];
  if (set.relative) entry.push(`kill ${marker}`, `summon minecraft:marker ~ ~ ~ {Tags:["${tag}"]}`);
  entry.push(`function ${id}/part_1`, '');
  files.push({ path: `${fn}.mcfunction`, text: entry.join('\n') });

  for (let k = 1; k <= parts; k++) {
    const body = set.commands.slice((k - 1) * partSize, k * partSize);
    files.push({ path: `${fn}/body_${k}.mcfunction`, text: [...body, ''].join('\n') });
    const part = [
      set.relative ? `execute at @e[type=minecraft:marker,tag=${tag},limit=1] run function ${id}/body_${k}` : `function ${id}/body_${k}`,
    ];
    if (k < parts) part.push(`schedule function ${id}/part_${k + 1} 1t`);
    else {
      if (set.relative) part.push(`kill ${marker}`);
      part.push(done);
    }
    files.push({ path: `${fn}/part_${k}.mcfunction`, text: [...part, ''].join('\n') });
  }
  return files;
}
