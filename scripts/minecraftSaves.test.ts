import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listWorlds, savesMiddleware } from './minecraftSaves';

const PAGE = { 'sec-fetch-site': 'same-origin', 'x-mts': '1' };

async function call(saves: string, method: string, url: string, headers: Record<string, string> = PAGE, body = Buffer.alloc(0)) {
  const req = Object.assign(Readable.from([body]), { method, url, headers }) as unknown as IncomingMessage;
  let status = 0, text = '', passed = false;
  const res = {
    set statusCode(s: number) { status = s; },
    setHeader() {},
    end(t: string) { text = t; },
  } as unknown as ServerResponse;
  await savesMiddleware(saves)(req, res, () => { passed = true; });
  return { status, json: text ? JSON.parse(text) : null, passed };
}

describe('Minecraft saves bridge', () => {
  let saves: string;
  beforeEach(async () => {
    saves = await mkdtemp(join(tmpdir(), 'mts-saves-'));
    for (const w of ['Old World', 'New World']) {
      await mkdir(join(saves, w), { recursive: true });
      await writeFile(join(saves, w, 'level.dat'), '');
      await new Promise((r) => setTimeout(r, 15)); // distinct modification times
    }
    await mkdir(join(saves, 'not a world'));
  });
  afterEach(() => rm(saves, { recursive: true, force: true }));

  it('lists folders with a level.dat, last played first', async () => {
    expect((await listWorlds(saves)).map((w) => w.name)).toEqual(['New World', 'Old World']);
    expect(await listWorlds(join(saves, 'missing'))).toEqual([]);
    const r = await call(saves, 'GET', '/__mts/worlds');
    expect(r.status).toBe(200);
    expect(r.json.worlds.map((w: { name: string }) => w.name)).toEqual(['New World', 'Old World']);
  });

  it('writes the data pack into the world’s datapacks folder', async () => {
    const zip = Buffer.from('PK fake zip');
    const r = await call(saves, 'POST', '/__mts/datapack?world=New%20World&file=art_datapack.zip', PAGE, zip);
    expect(r.status).toBe(200);
    expect(await readFile(join(saves, 'New World', 'datapacks', 'art_datapack.zip'))).toEqual(zip);
  });

  it('refuses other pages, unknown worlds and paths', async () => {
    expect((await call(saves, 'GET', '/__mts/worlds', { 'sec-fetch-site': 'cross-site', 'x-mts': '1' })).status).toBe(403);
    expect((await call(saves, 'GET', '/__mts/worlds', { 'sec-fetch-site': 'same-origin' })).status).toBe(403);
    expect((await call(saves, 'POST', '/__mts/datapack?world=not%20a%20world&file=a.zip')).status).toBe(404);
    expect((await call(saves, 'POST', '/__mts/datapack?world=..&file=a.zip')).status).toBe(404);
    expect((await call(saves, 'POST', '/__mts/datapack?world=New%20World&file=..%2Fx.zip')).status).toBe(400);
    expect((await call(saves, 'POST', '/__mts/datapack?world=New%20World&file=a.mcfunction')).status).toBe(400);
  });

  it('leaves other requests to the app', async () => {
    expect((await call(saves, 'GET', '/index.html', {})).passed).toBe(true);
  });
});
