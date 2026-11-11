// Dev-server bridge to your Minecraft worlds: lists them and saves data packs straight into one, so a build is just
// /reload and /function in game. The page can't do this alone: browsers refuse folders inside AppData, where
// .minecraft lives. Runs only with `npm run dev` / `npm run preview`, and answers only the app's own page.
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Plugin } from 'vite';

export interface World {
  /** Folder name. */
  name: string;
  /** level.dat's last change: when the world was last saved. */
  lastPlayed: number;
}

/** The launcher's default saves folder; MTS_SAVES overrides it (another launcher or game directory). */
export function defaultSavesFolder(): string {
  if (process.env.MTS_SAVES) return process.env.MTS_SAVES;
  if (process.platform === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), '.minecraft', 'saves');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'minecraft', 'saves');
  return join(homedir(), '.minecraft', 'saves');
}

/** Folders in `saves` with a level.dat, last played first. */
export async function listWorlds(saves: string): Promise<World[]> {
  const entries = await readdir(saves, { withFileTypes: true }).catch(() => []);
  const worlds: World[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const level = await stat(join(saves, e.name, 'level.dat')).catch(() => null);
    if (level?.isFile()) worlds.push({ name: e.name, lastPlayed: level.mtimeMs });
  }
  return worlds.sort((a, b) => b.lastPlayed - a.lastPlayed);
}

const MAX_BYTES = 64 * 1024 * 1024;
const PACK_FILE = /^[a-z0-9_-]{1,80}\.zip$/;

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('The data pack is too big'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * GET /__mts/worlds -> { saves, worlds }; POST /__mts/datapack?world=<folder>&file=<name>.zip with the zip as body
 * -> writes <saves>/<world>/datapacks/<file>. The world must be one of the listed folders and the file a plain
 * name, so nothing outside a world's datapacks folder can be written. Requests need Sec-Fetch-Site: same-origin
 * (which only the app's own page sends) and X-MTS: 1 (which a cross-site page can't add without a CORS preflight).
 */
export function savesMiddleware(saves: string) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/__mts/')) return next();
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(body));
    };
    if (req.headers['sec-fetch-site'] !== 'same-origin' || req.headers['x-mts'] !== '1') return send(403, { error: 'Forbidden' });
    try {
      if (url.pathname === '/__mts/worlds' && req.method === 'GET') return send(200, { saves, worlds: await listWorlds(saves) });
      if (url.pathname === '/__mts/datapack' && req.method === 'POST') {
        const world = url.searchParams.get('world') ?? '';
        const file = url.searchParams.get('file') ?? '';
        if (!PACK_FILE.test(file)) return send(400, { error: `Not a data pack file name: ${file}` });
        if (!(await listWorlds(saves)).some((w) => w.name === world)) return send(404, { error: `No world “${world}” in ${saves}` });
        const body = await readBody(req, MAX_BYTES);
        const dir = join(saves, world, 'datapacks');
        await mkdir(dir, { recursive: true });
        try {
          await writeFile(join(dir, file), body);
        } catch (e) {
          const code = (e as NodeJS.ErrnoException).code;
          if (code === 'EBUSY' || code === 'EPERM') {
            return send(409, { error: `Couldn't replace ${file}: Minecraft has it open. Leave the world, or save under another name.` });
          }
          throw e;
        }
        return send(200, { path: join(dir, file) });
      }
      return send(404, { error: 'Not found' });
    } catch (e) {
      return send(500, { error: e instanceof Error ? e.message : String(e) });
    }
  };
}

export function minecraftSaves(saves = defaultSavesFolder()): Plugin {
  return {
    name: 'mts-minecraft-saves',
    configureServer(server) {
      server.middlewares.use(savesMiddleware(saves));
    },
    configurePreviewServer(server) {
      server.middlewares.use(savesMiddleware(saves));
    },
  };
}
