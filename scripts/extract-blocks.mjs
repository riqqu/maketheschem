// Builds the block palette from your installed Minecraft Java jar.
//
//   npm run extract                -> uses %APPDATA%/.minecraft/versions/26.3/26.3.jar
//   npm run extract -- <jar path>  -> any other version jar
//   MC_JAR=<jar path> npm run extract
//
// Outputs (git-ignored, they contain Mojang assets):
//   src/data/blocks.json  block list with state strings, categories and per-face average colours
//   public/atlas.png      every face texture used, 16x16 tiles in a grid
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yauzl from 'yauzl';
import { PNG } from 'pngjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_JAR = join(process.env.APPDATA ?? '', '.minecraft', 'versions', '26.3', '26.3.jar');
const JAR = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? process.env.MC_JAR ?? DEFAULT_JAR;
const TILE = 16;
const ATLAS_COLUMNS = 32;
/** Bump when blocks.json gains fields; ensure-blocks.mjs re-extracts older data. */
export const FORMAT = 3;

// Properties pinned to one value so a block resolves to exactly one blockstate variant.
const PINNED = { axis: 'y', snowy: 'false', facing: 'south' };

// Full cubes that are still unsuitable: they change after placement, are functional/redstone/technical,
// or are block entities. Everything else is decided from the models and textures.
const DENY_EXACT = new Set([
  'budding_amethyst', 'tnt', 'powder_snow', 'bedrock', 'barrier', 'structure_block', 'jigsaw',
  'spawner', 'trial_spawner', 'vault', 'reinforced_deepslate', 'test_block', 'test_instance_block',
  'furnace', 'blast_furnace', 'smoker', 'barrel', 'dispenser', 'dropper', 'crafter', 'observer',
  'note_block', 'jukebox', 'beehive', 'bee_nest', 'sculk_catalyst', 'sculk_shrieker', 'sculk_sensor',
  'chiseled_bookshelf', 'redstone_block', 'redstone_lamp', 'target', 'piston', 'sticky_piston',
  'carved_pumpkin', 'jack_o_lantern', 'respawn_anchor', 'suspicious_sand', 'suspicious_gravel',
  'potent_sulfur', // forms geysers over magma / under water
  // Turn into dirt/netherrack when another block covers them (every row of a wall would decay).
  'mycelium', 'crimson_nylium', 'warped_nylium',
]);
const DENY_RULES = [
  [/command_block$/, 'technical'],
  [/^infested_/, 'infested (silverfish)'],
  [/^(?!dead_).*_coral_block$/, 'live coral dies out of water'],
  [/^(?!waxed_)(exposed_|weathered_|oxidized_)?(cut_|chiseled_)?copper(_block)?$/, 'unwaxed copper oxidizes'],
];

// Must exist / must not exist after filtering - guards against silent breakage.
const MUST_HAVE = ['white_concrete', 'black_wool', 'terracotta', 'oak_log', 'poplar_log', 'stone'];
const MUST_NOT_HAVE = ['glass', 'oak_leaves', 'grass_block', 'chest', 'tube_coral_block', 'copper_block', 'furnace'];

const CATEGORY_ORDER = [
  'Concrete', 'Wool', 'Terracotta', 'Glazed Terracotta', 'Wood', 'Stone', 'Deepslate', 'Nether',
  'End', 'Copper', 'Ores & Minerals', 'Natural', 'Misc', 'Gravity',
];

function categorize(id, gravity) {
  if (gravity) return 'Gravity';
  if (/_concrete$/.test(id)) return 'Concrete';
  if (/_wool$/.test(id)) return 'Wool';
  if (/_glazed_terracotta$/.test(id)) return 'Glazed Terracotta';
  if (/terracotta$/.test(id)) return 'Terracotta';
  if (/(planks|_log|_wood|_stem|_hyphae|bamboo_block|bamboo_mosaic)$/.test(id)) return 'Wood';
  if (/^waxed_/.test(id)) return 'Copper';
  if (/_ore$|^raw_\w+_block$|^(coal|iron|gold|diamond|emerald|lapis|netherite|amethyst)_block$|ancient_debris|quartz/.test(id)) return 'Ores & Minerals';
  if (/deepslate/.test(id)) return 'Deepslate';
  if (/nether|blackstone|basalt|crimson|warped|soul_|magma|glowstone|shroomlight|crying_obsidian/.test(id)) return 'Nether';
  if (/end_stone|purpur/.test(id)) return 'End';
  if (/dirt|podzol|clay|moss_block|snow|ice|sponge|hay_block|melon|pumpkin|kelp|honeycomb|bone_block|sculk|froglight|sea_lantern|mangrove_roots|^(packed_)?mud$|resin_block|coral_block/.test(id)) return 'Natural';
  if (/stone|cobble|granite|diorite|andesite|tuff|calcite|brick|prismarine|obsidian|dripstone|smooth_|chiseled_|cut_|resin|cinnabar|sulfur/.test(id)) return 'Stone';
  return 'Misc';
}

// ---------------------------------------------------------------------------------------------

function readJar(path, wanted) {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: true }, (err, zip) => {
      if (err) return reject(err);
      const files = new Map();
      zip.on('error', reject);
      zip.on('end', () => resolve(files));
      zip.on('entry', (entry) => {
        if (entry.fileName.endsWith('/') || !wanted(entry.fileName)) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (err2, stream) => {
          if (err2) return reject(err2);
          const chunks = [];
          stream.on('data', (c) => chunks.push(c));
          stream.on('error', reject);
          stream.on('end', () => {
            files.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

const json = (buf) => JSON.parse(buf.toString('utf8').replace(/^﻿/, ''));
const stripNs = (ref) => ref.replace(/^minecraft:/, '');

// --- blockstate -> model --------------------------------------------------------------------

function pickVariant(blockstate) {
  if (!blockstate.variants) return { reason: 'multipart blockstate' };
  const candidates = Object.entries(blockstate.variants).filter(([key]) =>
    key === '' || key.split(',').every((kv) => {
      const [k, v] = kv.split('=');
      return PINNED[k] === v;
    }),
  );
  if (candidates.length !== 1) return { reason: `${candidates.length} matching variants (other state properties)` };
  const [key, value] = candidates[0];
  return { key, model: Array.isArray(value) ? value[0] : value };
}

// --- model resolution ------------------------------------------------------------------------

const DIRS = {
  up: [0, 1, 0], down: [0, -1, 0], north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0],
};
const FACES = Object.keys(DIRS);

// Blockstate rotations: X first, then Y, each in 90 degree steps (matches the game's model rotation).
function rotate([x, y, z], rx, ry) {
  for (let i = 0; i < ((rx / 90) % 4 + 4) % 4; i++) [x, y, z] = [x, z, -y];
  for (let i = 0; i < ((ry / 90) % 4 + 4) % 4; i++) [x, y, z] = [-z, y, x];
  return [x, y, z];
}

function worldFaceToModelFace(rx, ry) {
  const map = {};
  for (const face of FACES) {
    const v = rotate(DIRS[face], rx, ry);
    const world = FACES.find((f) => DIRS[f].every((c, i) => c === v[i]));
    map[world] = face;
  }
  return map;
}

function makeModelResolver(files) {
  return function resolveModel(ref) {
    const chain = [];
    let cur = ref;
    while (cur) {
      const buf = files.get(`assets/minecraft/models/${stripNs(cur)}.json`);
      if (!buf) return { reason: `model ${cur} not found (builtin/entity model)` };
      const m = json(buf);
      chain.push(m);
      cur = m.parent;
      if (chain.length > 20) return { reason: 'model parent loop' };
    }
    const textures = {};
    for (let i = chain.length - 1; i >= 0; i--) Object.assign(textures, chain[i].textures ?? {});
    const elements = chain.find((m) => m.elements)?.elements;
    if (!elements) return { reason: 'no elements' };
    return { textures, elements };
  };
}

// Texture entries are either "ns:path" / "#ref" strings or, in newer versions, { "sprite": "...", ... }.
const textureString = (t) => (typeof t === 'string' ? t : typeof t?.sprite === 'string' ? t.sprite : null);

function resolveTextureRef(ref, textures) {
  let cur = textureString(ref);
  for (let i = 0; i < 10 && cur?.startsWith('#'); i++) cur = textureString(textures[cur.slice(1)]);
  return cur && !cur.startsWith('#') ? stripNs(cur) : null;
}

function checkFullCube(elements) {
  if (elements.length !== 1) return `${elements.length} model elements`;
  const el = elements[0];
  const full = el.from.every((c) => c === 0) && el.to.every((c) => c === 16);
  if (!full) return 'not a full cube';
  if (el.rotation && el.rotation.angle) return 'rotated element';
  for (const f of FACES) {
    if (!el.faces?.[f]) return `missing ${f} face`;
    if (el.faces[f].tintindex !== undefined) return 'biome/colour tinted';
  }
  return null;
}

// --- textures --------------------------------------------------------------------------------

// sRGB -> OKLab, a copy of src/core/oklab.ts (this script runs in plain Node and cannot import TypeScript).
const LINEAR = Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
function oklab(r, g, b) {
  const lr = LINEAR[r], lg = LINEAR[g], lb = LINEAR[b];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function makeTextureLoader(files) {
  const cache = new Map();
  return function loadTexture(name) {
    if (cache.has(name)) return cache.get(name);
    const buf = files.get(`assets/minecraft/textures/${name}.png`);
    let result;
    if (!buf) {
      result = { reason: `texture ${name} missing` };
    } else {
      const png = PNG.sync.read(buf);
      let opaque = true;
      for (let i = 3; i < png.data.length; i += 4) if (png.data[i] !== 255) { opaque = false; break; }
      if (!opaque) {
        result = { reason: `texture ${name} has transparency` };
      } else {
        // Animated textures are vertical strips of square frames: use frame 0, scaled to 16x16.
        const size = png.width;
        const tile = Buffer.alloc(TILE * TILE * 4);
        let r = 0, g = 0, b = 0;
        for (let y = 0; y < TILE; y++) {
          for (let x = 0; x < TILE; x++) {
            const sx = Math.floor((x * size) / TILE);
            const sy = Math.floor((y * size) / TILE);
            const si = (sy * png.width + sx) * 4;
            const di = (y * TILE + x) * 4;
            png.data.copy(tile, di, si, si + 4);
          }
        }
        // Average over the whole first frame at native resolution.
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const i = (y * png.width + x) * 4;
            r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2];
          }
        }
        const n = size * size;
        // Texture noise: RMS OKLab distance of the texels from their mean. High for ores, patterns and speckles.
        const labs = [];
        let mL = 0, mA = 0, mB = 0;
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const i = (y * png.width + x) * 4;
            const lab = oklab(png.data[i], png.data[i + 1], png.data[i + 2]);
            labs.push(lab);
            mL += lab[0]; mA += lab[1]; mB += lab[2];
          }
        }
        mL /= n; mA /= n; mB /= n;
        let v = 0;
        for (const [L, A, B] of labs) v += (L - mL) ** 2 + (A - mA) ** 2 + (B - mB) ** 2;
        const noise = Math.round(Math.sqrt(v / n) * 10000) / 10000;
        result = { name, tile, rgb: [Math.round(r / n), Math.round(g / n), Math.round(b / n)], noise };
      }
    }
    cache.set(name, result);
    return result;
  };
}

function resolveTagValues(files, tag, seen = new Set()) {
  if (seen.has(tag)) return [];
  seen.add(tag);
  const buf = files.get(`data/minecraft/tags/block/${tag}.json`);
  if (!buf) throw new Error(`block tag ${tag} not found in jar`);
  const out = [];
  for (const v of json(buf).values) {
    const id = typeof v === 'string' ? v : v.id;
    if (id.startsWith('#')) out.push(...resolveTagValues(files, stripNs(id.slice(1)), seen));
    else out.push(stripNs(id));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------

/** [major, minor] data pack format from version.json (newer jars split it into major/minor). */
function dataPackFormat(pv) {
  if (typeof pv === 'number') return [pv, 0];
  if (pv && Number.isInteger(pv.data_major)) return [pv.data_major, pv.data_minor ?? 0];
  if (pv && Number.isInteger(pv.data)) return [pv.data, 0];
  return null;
}

async function main() {
  if (!existsSync(JAR)) {
    console.error(`Minecraft jar not found: ${JAR}\nRun the game version once in the launcher, or pass a path: npm run extract -- <path to jar>`);
    process.exit(1);
  }
  console.log(`Reading ${JAR}`);
  const files = await readJar(JAR, (f) =>
    f === 'version.json' ||
    f === 'assets/minecraft/lang/en_us.json' ||
    f.startsWith('assets/minecraft/blockstates/') ||
    f.startsWith('assets/minecraft/models/block/') ||
    f.startsWith('assets/minecraft/textures/block/') ||
    f.startsWith('data/minecraft/tags/block/'),
  );

  const version = json(files.get('version.json'));
  const lang = json(files.get('assets/minecraft/lang/en_us.json'));
  const gravityIds = new Set([...resolveTagValues(files, 'sand'), ...resolveTagValues(files, 'concrete_powders'), 'gravel']);
  const resolveModel = makeModelResolver(files);
  const loadTexture = makeTextureLoader(files);

  const accepted = [];
  const rejected = [];

  const blockstatePaths = [...files.keys()].filter((f) => f.startsWith('assets/minecraft/blockstates/') && f.endsWith('.json')).sort();
  for (const path of blockstatePaths) {
    const id = path.slice('assets/minecraft/blockstates/'.length, -'.json'.length);
    const reject = (reason) => rejected.push({ id, reason });

    if (DENY_EXACT.has(id)) { reject('denylist: functional/unstable'); continue; }
    const rule = DENY_RULES.find(([re]) => re.test(id));
    if (rule) { reject(`denylist: ${rule[1]}`); continue; }

    const variant = pickVariant(json(files.get(path)));
    if (variant.reason) { reject(variant.reason); continue; }

    const model = resolveModel(variant.model.model);
    if (model.reason) { reject(model.reason); continue; }
    const cubeProblem = checkFullCube(model.elements);
    if (cubeProblem) { reject(cubeProblem); continue; }

    const faceMap = worldFaceToModelFace(variant.model.x ?? 0, variant.model.y ?? 0);
    const faces = {};
    let faceProblem = null;
    for (const [slot, worldFace] of [['top', 'up'], ['side', 'south']]) {
      const modelFace = faceMap[worldFace];
      const texName = resolveTextureRef(model.elements[0].faces[modelFace].texture, model.textures);
      if (!texName) { faceProblem = `unresolved texture for ${worldFace}`; break; }
      const tex = loadTexture(texName);
      if (tex.reason) { faceProblem = tex.reason; break; }
      faces[slot] = tex;
    }
    // The faces we never show must be opaque too (a see-through back/bottom still reads as a hole).
    if (!faceProblem) {
      for (const f of FACES) {
        const texName = resolveTextureRef(model.elements[0].faces[f].texture, model.textures);
        const tex = texName ? loadTexture(texName) : { reason: 'unresolved texture' };
        if (tex.reason) { faceProblem = tex.reason; break; }
      }
    }
    if (faceProblem) { reject(faceProblem); continue; }

    const gravity = gravityIds.has(id);
    accepted.push({
      id,
      state: `minecraft:${id}${variant.key ? `[${variant.key}]` : ''}`,
      name: lang[`block.minecraft.${id}`] ?? id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      category: categorize(id, gravity),
      gravity,
      faces,
    });
  }

  // Atlas: each distinct texture once.
  const tileIndex = new Map();
  const tiles = [];
  for (const b of accepted) {
    for (const tex of Object.values(b.faces)) {
      if (!tileIndex.has(tex.name)) {
        tileIndex.set(tex.name, tiles.length);
        tiles.push(tex.tile);
      }
    }
  }
  const rows = Math.ceil(tiles.length / ATLAS_COLUMNS);
  const atlas = new PNG({ width: ATLAS_COLUMNS * TILE, height: rows * TILE });
  atlas.data.fill(0);
  tiles.forEach((tile, i) => {
    const ox = (i % ATLAS_COLUMNS) * TILE;
    const oy = Math.floor(i / ATLAS_COLUMNS) * TILE;
    for (let y = 0; y < TILE; y++) tile.copy(atlas.data, ((oy + y) * atlas.width + ox) * 4, y * TILE * 4, (y + 1) * TILE * 4);
  });

  accepted.sort((a, b) =>
    CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name),
  );

  const out = {
    format: FORMAT,
    minecraftVersion: version.name ?? version.id,
    dataVersion: version.world_version,
    dataPackFormat: dataPackFormat(version.pack_version),
    tileSize: TILE,
    atlasColumns: ATLAS_COLUMNS,
    categories: CATEGORY_ORDER.filter((c) => accepted.some((b) => b.category === c)),
    blocks: accepted.map((b) => ({
      id: b.id,
      state: b.state,
      name: b.name,
      category: b.category,
      gravity: b.gravity,
      top: { rgb: b.faces.top.rgb, tile: tileIndex.get(b.faces.top.name), texture: b.faces.top.name, noise: b.faces.top.noise },
      side: { rgb: b.faces.side.rgb, tile: tileIndex.get(b.faces.side.name), texture: b.faces.side.name, noise: b.faces.side.noise },
    })),
  };

  // Self-checks.
  const ids = new Set(accepted.map((b) => b.id));
  const missing = MUST_HAVE.filter((id) => !ids.has(id));
  const leaked = MUST_NOT_HAVE.filter((id) => ids.has(id));
  if (!Number.isInteger(out.dataVersion)) throw new Error('version.json has no integer world_version');
  if (missing.length || leaked.length) {
    for (const id of missing) console.error(`  missing: ${id} - ${rejected.find((r) => r.id === id)?.reason ?? 'no blockstate'}`);
    for (const id of leaked) console.error(`  should have been excluded: ${id}`);
    throw new Error('Self-check failed, block data not written.');
  }

  mkdirSync(join(ROOT, 'src/data'), { recursive: true });
  mkdirSync(join(ROOT, 'public'), { recursive: true });
  writeFileSync(join(ROOT, 'src/data/blocks.json'), JSON.stringify(out, null, 1));
  writeFileSync(join(ROOT, 'public/atlas.png'), PNG.sync.write(atlas));

  if (process.env.VERBOSE || process.argv.includes('--list')) {
    for (const c of out.categories) {
      const list = out.blocks.filter((b) => b.category === c);
      console.log(`\n[${c}] (${list.length})\n  ${list.map((b) => b.state.replace('minecraft:', '')).join(', ')}`);
    }
  }
  console.log(
    `\nMinecraft ${out.minecraftVersion} (data version ${out.dataVersion}): ${out.blocks.length} usable blocks, ` +
      `${tiles.length} textures, ${rejected.length} blockstates skipped.`,
  );
  console.log(out.categories.map((c) => `${c}: ${out.blocks.filter((b) => b.category === c).length}`).join(' | '));
}

if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase()) {
  main().catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
