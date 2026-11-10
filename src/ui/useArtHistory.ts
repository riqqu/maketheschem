import { useCallback, useEffect, useRef, useState } from 'react';
import type { Grid } from '../core/grid';
import { encodeGrid, hashGrid } from '../core/serialize';
import { BLOCKS } from '../data';
import { deleteArts, listArts, loadArt, openDb, saveArt, type ArtMeta, type ArtSource } from '../lib/db';
import { thumbnail } from '../lib/render';
import { settingsSignature, type ArtSettings } from './settings';

/** Most arts kept; the oldest are dropped beyond this. */
export const HISTORY_LIMIT = 40;
const SAVE_DELAY = 800;

/** What the app currently shows, read at save time. */
export interface ArtSnapshot {
  name: string;
  settings: ArtSettings;
  grid: Grid | null;
  edited: boolean;
  hasImage: boolean;
  blockCount: number;
}

interface Current {
  id: string;
  createdAt: number;
  /** Original image, written with the first save. */
  pendingSource: ArtSource | null;
  /** Fingerprint of the last saved state. */
  lastSig: string | null;
}

const signature = (s: Pick<ArtSnapshot, 'name' | 'settings' | 'edited'>, grid: Grid) =>
  `${s.name}|${s.edited}|${settingsSignature(s.settings)}|${grid.width}x${grid.height}:${hashGrid(grid)}`;

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * One history entry per art. Call begin() when a new art starts, adopt() after opening one, schedule() after every
 * change; saves are debounced, skipped while nothing changed, and serialised.
 */
export function useArtHistory(getSnapshot: () => ArtSnapshot, onError: (message: string) => void) {
  /** null while the database is being opened. */
  const [available, setAvailable] = useState<boolean | null>(null);
  const [list, setListState] = useState<ArtMeta[]>([]);
  const listRef = useRef<ArtMeta[]>([]);
  const setList = useCallback((next: ArtMeta[]) => {
    listRef.current = next;
    setListState(next);
  }, []);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const current = useRef<Current | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const snapshotRef = useRef(getSnapshot);
  snapshotRef.current = getSnapshot;
  const errorRef = useRef(onError);
  errorRef.current = onError;

  useEffect(() => {
    let live = true;
    openDb().then(async (db) => {
      if (!live) return;
      const items = db ? await listArts().catch(() => []) : [];
      if (!live) return;
      setList(items);
      setAvailable(!!db);
    });
    return () => {
      live = false;
    };
  }, [setList]);

  const write = useCallback(async () => {
    const cur = current.current;
    if (!cur) return;
    const snap = snapshotRef.current();
    const grid = snap.grid;
    if (!grid || (!snap.hasImage && snap.blockCount === 0)) return; // nothing worth keeping yet
    const sig = signature(snap, grid);
    if (sig === cur.lastSig) return;

    const encoded = encodeGrid(grid, BLOCKS);
    const thumb = await thumbnail(grid, BLOCKS, snap.settings.orientation).catch(() => null);
    const now = Date.now();
    const meta: ArtMeta = {
      id: cur.id,
      name: snap.name,
      createdAt: cur.createdAt,
      updatedAt: now,
      orientation: snap.settings.orientation,
      width: grid.width,
      height: grid.height,
      blockCount: snap.blockCount,
      hasImage: snap.hasImage,
      thumb,
    };
    try {
      await saveArt(meta, { id: cur.id, settings: snap.settings, grid: encoded, edited: snap.edited }, cur.pendingSource);
    } catch (e) {
      const quota = e instanceof DOMException && e.name === 'QuotaExceededError';
      errorRef.current(quota ? 'Browser storage is full: delete some arts from the history.' : `Couldn’t save to the history: ${String(e)}`);
      return;
    }
    cur.pendingSource = null;
    cur.lastSig = sig;

    const next = [meta, ...listRef.current.filter((m) => m.id !== meta.id)];
    setList(next.slice(0, HISTORY_LIMIT));
    const drop = next.slice(HISTORY_LIMIT).map((m) => m.id);
    if (drop.length) await deleteArts(drop).catch(() => {});
  }, [setList]);

  /** Saves now (after any save already running). */
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (!available) return queue.current;
    queue.current = queue.current.then(write, write);
    return queue.current;
  }, [available, write]);

  const schedule = useCallback(() => {
    if (!available || !current.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY);
  }, [available, flush]);

  /** Starts a new art (written once it has an image or a block). */
  const begin = useCallback((source: Omit<ArtSource, 'id'> | null) => {
    const id = newId();
    current.current = { id, createdAt: Date.now(), pendingSource: source ? { id, ...source } : null, lastSig: null };
    setCurrentId(id);
    return id;
  }, []);

  /** Makes an opened art current, as saved (so merely opening it doesn't save it again). */
  const adopt = useCallback((meta: ArtMeta, state: Pick<ArtSnapshot, 'name' | 'settings' | 'edited'>, grid: Grid) => {
    current.current = { id: meta.id, createdAt: meta.createdAt, pendingSource: null, lastSig: signature(state, grid) };
    setCurrentId(meta.id);
  }, []);

  const open = useCallback(async (id: string) => {
    await flush();
    return loadArt(id);
  }, [flush]);

  const remove = useCallback(async (id: string) => {
    if (current.current?.id === id) {
      clearTimeout(timer.current);
      current.current = null;
      setCurrentId(null);
    }
    await queue.current.catch(() => {});
    setList(listRef.current.filter((m) => m.id !== id));
    await deleteArts([id]).catch((e) => errorRef.current(`Couldn’t delete: ${String(e)}`));
  }, [setList]);

  return { available, list, currentId, begin, adopt, schedule, flush, open, remove };
}
