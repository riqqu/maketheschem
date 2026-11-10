// Art history in IndexedDB. Unavailable storage (private windows, blocked site data) must never break the app:
// openDb() then resolves to null and the history is hidden.
import type { EncodedGrid } from '../core/serialize';
import type { Orientation } from '../core/types';

/** Light record for the history list. */
export interface ArtMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  orientation: Orientation;
  width: number;
  height: number;
  blockCount: number;
  hasImage: boolean;
  thumb: Blob | null;
}

export interface ArtData {
  id: string;
  /** ArtSettings at save time (validated again on load). */
  settings: unknown;
  grid: EncodedGrid;
  edited: boolean;
}

/** The original image file, written once per art. */
export interface ArtSource {
  id: string;
  blob: Blob;
  name: string;
  type: string;
}

const DB_NAME = 'make-the-schem';
const DB_VERSION = 1;
const META = 'meta', DATA = 'data', SOURCES = 'sources';

let dbPromise: Promise<IDBDatabase | null> | null = null;

export function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of [META, DATA, SOURCES]) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });

const result = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function need(): Promise<IDBDatabase> {
  const db = await openDb();
  if (!db) throw new Error('Browser storage is not available');
  return db;
}

/** Newest first. */
export async function listArts(): Promise<ArtMeta[]> {
  const db = await openDb();
  if (!db) return [];
  const all = await result(db.transaction(META).objectStore(META).getAll() as IDBRequest<ArtMeta[]>);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadArt(id: string): Promise<{ meta: ArtMeta; data: ArtData; source: ArtSource | null } | null> {
  const db = await need();
  const tx = db.transaction([META, DATA, SOURCES]);
  const [meta, data, source] = await Promise.all([
    result(tx.objectStore(META).get(id) as IDBRequest<ArtMeta | undefined>),
    result(tx.objectStore(DATA).get(id) as IDBRequest<ArtData | undefined>),
    result(tx.objectStore(SOURCES).get(id) as IDBRequest<ArtSource | undefined>),
  ]);
  return meta && data ? { meta, data, source: source ?? null } : null;
}

/** Writes the art; the source image only when given (it never changes after the art is created). */
export async function saveArt(meta: ArtMeta, data: ArtData, source: ArtSource | null): Promise<void> {
  const db = await need();
  const tx = db.transaction([META, DATA, SOURCES], 'readwrite');
  tx.objectStore(META).put(meta);
  tx.objectStore(DATA).put(data);
  if (source) tx.objectStore(SOURCES).put(source);
  await done(tx);
}

export async function deleteArts(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await need();
  const tx = db.transaction([META, DATA, SOURCES], 'readwrite');
  for (const id of ids) for (const s of [META, DATA, SOURCES]) tx.objectStore(s).delete(id);
  await done(tx);
}
