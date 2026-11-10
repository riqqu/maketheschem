// Runs the block extraction once if its outputs are missing (used by predev/prebuild).
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputs = [join(root, 'src/data/blocks.json'), join(root, 'public/atlas.png')];

if (outputs.every((p) => existsSync(p))) process.exit(0);

console.log('Block data not found - extracting it from your Minecraft jar...');
const res = spawnSync(process.execPath, [join(root, 'scripts/extract-blocks.mjs')], { stdio: 'inherit' });
process.exit(res.status ?? 1);
