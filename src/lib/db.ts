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

/** Light record for the 3D model history list. */
export interface ModelMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  width: number;
  height: number;
  length: number;
  blockCount: number;
  thumb: Blob | null;
}

export interface ModelData {
  id: string;
  /** ModelSettings at save time (validated again on load). */
  settings: unknown;
}

/** The model file, written once per entry. The blocks are rebuilt from it and the settings. */
export type ModelSource = ArtSource;

const DB_NAME = 'make-the-schem';
// 2 added a store for picked folders, since removed again. Browsers that opened version 2 refuse a lower one.
// 3 added the 3D model history.
const DB_VERSION = 3;
const META = 'meta', DATA = 'data', SOURCES = 'sources';
const MODEL_META = 'modelMeta', MODEL_DATA = 'modelData', MODEL_SOURCES = 'modelSources';
const STORES = [META, DATA, SOURCES, MODEL_META, MODEL_DATA, MODEL_SOURCES];

let dbPromise: Promise<IDBDatabase | null> | null = null;

export function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      };
      req.onsuccess = () => {
        // Let a newer version of the app in another tab upgrade the database instead of being blocked.
        req.result.onversionchange = () => req.result.close();
        resolve(req.result);
      };
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

// ---- 3D models ------------------------------------------------------------------------------

/** Newest first. */
export async function listModels(): Promise<ModelMeta[]> {
  const db = await openDb();
  if (!db) return [];
  const all = await result(db.transaction(MODEL_META).objectStore(MODEL_META).getAll() as IDBRequest<ModelMeta[]>);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadModel(id: string): Promise<{ meta: ModelMeta; data: ModelData; source: ModelSource } | null> {
  const db = await need();
  const tx = db.transaction([MODEL_META, MODEL_DATA, MODEL_SOURCES]);
  const [meta, data, source] = await Promise.all([
    result(tx.objectStore(MODEL_META).get(id) as IDBRequest<ModelMeta | undefined>),
    result(tx.objectStore(MODEL_DATA).get(id) as IDBRequest<ModelData | undefined>),
    result(tx.objectStore(MODEL_SOURCES).get(id) as IDBRequest<ModelSource | undefined>),
  ]);
  return meta && data && source ? { meta, data, source } : null;
}

/** Writes the entry; the model file only when given (it never changes after the entry is created). */
export async function saveModel(meta: ModelMeta, data: ModelData, source: ModelSource | null): Promise<void> {
  const db = await need();
  const tx = db.transaction([MODEL_META, MODEL_DATA, MODEL_SOURCES], 'readwrite');
  tx.objectStore(MODEL_META).put(meta);
  tx.objectStore(MODEL_DATA).put(data);
  if (source) tx.objectStore(MODEL_SOURCES).put(source);
  await done(tx);
}

export async function deleteModels(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await need();
  const tx = db.transaction([MODEL_META, MODEL_DATA, MODEL_SOURCES], 'readwrite');
  for (const id of ids) for (const s of [MODEL_META, MODEL_DATA, MODEL_SOURCES]) tx.objectStore(s).delete(id);
  await done(tx);
}
