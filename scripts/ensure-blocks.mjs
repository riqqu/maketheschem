// Runs the block extraction if its outputs are missing or were made by an older version of the script
// (used by predev/prebuild).
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FORMAT } from './extract-blocks.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const blocksJson = join(root, 'src/data/blocks.json');
const outputs = [blocksJson, join(root, 'public/atlas.png')];

function currentFormat() {
  try {
    return JSON.parse(readFileSync(blocksJson, 'utf8')).format ?? 1;
  } catch {
    return 0;
  }
}

if (outputs.every((p) => existsSync(p)) && currentFormat() >= FORMAT) process.exit(0);

console.log(existsSync(blocksJson) ? 'Block data is outdated - re-extracting it from your Minecraft jar...' : 'Block data not found - extracting it from your Minecraft jar...');
const res = spawnSync(process.execPath, [join(root, 'scripts/extract-blocks.mjs'), ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(res.status ?? 1);
