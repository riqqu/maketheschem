// The dev server's bridge to your Minecraft worlds (scripts/minecraftSaves.ts): lists them and saves data packs
// straight into one. A static build has no bridge: loadSaves() then resolves to null and only the download is left.
export interface World {
  name: string;
  lastPlayed: number;
}

export interface Saves {
  /** The saves folder on this computer. */
  folder: string;
  /** Last played first. */
  worlds: World[];
}

const HEADERS = { 'X-MTS': '1' };

export async function loadSaves(): Promise<Saves | null> {
  try {
    const r = await fetch('/__mts/worlds', { headers: HEADERS, cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as { saves?: unknown; worlds?: unknown };
    if (typeof j.saves !== 'string' || !Array.isArray(j.worlds)) return null;
    return { folder: j.saves, worlds: j.worlds as World[] };
  } catch {
    return null; // no bridge (static build, or the page's server is gone)
  }
}

/** Writes `<world>/datapacks/<fileName>`; returns the full path. */
export async function saveDatapack(world: string, fileName: string, bytes: Uint8Array): Promise<string> {
  let r: Response;
  try {
    r = await fetch(`/__mts/datapack?world=${encodeURIComponent(world)}&file=${encodeURIComponent(fileName)}`, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/zip' },
      body: new Blob([bytes as BlobPart]),
    });
  } catch {
    throw new Error('The app’s dev server is not running. Start it with npm run dev.');
  }
  const j = (await r.json().catch(() => ({}))) as { path?: string; error?: string };
  if (!r.ok || !j.path) throw new Error(j.error ?? `Saving failed (${r.status})`);
  return j.path;
}
