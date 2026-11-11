import { useCallback, useEffect, useRef, useState } from 'react';
import { openDb } from '../lib/db';

export interface HistoryStore<Meta extends { id: string }, Rec> {
  /** Newest first. */
  list(): Promise<Meta[]>;
  load(id: string): Promise<Rec | null>;
  remove(ids: string[]): Promise<void>;
}

/** The entry being worked on. `pending` is written with its first save (the source file), then dropped. */
export interface HistoryEntry<P> {
  id: string;
  createdAt: number;
  pending: P | null;
}

interface Options<Meta extends { id: string }, Rec, P> {
  store: HistoryStore<Meta, Rec>;
  /** Most entries kept; the oldest are dropped beyond this. */
  limit: number;
  /** Fingerprint of what would be saved now, or null while there is nothing worth keeping. */
  signature: () => string | null;
  /** Writes the current state under the entry and returns its list record. */
  save: (entry: HistoryEntry<P>) => Promise<Meta>;
  onError: (message: string) => void;
}

const SAVE_DELAY = 800;

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * An autosaved history with one entry per piece of work. Call begin() when new work starts, adopt() after opening an
 * entry, schedule() after every change; saves are debounced, skipped while nothing changed, and serialised.
 */
export function useAutosaveHistory<Meta extends { id: string }, Rec, P>(options: Options<Meta, Rec, P>) {
  const opts = useRef(options);
  opts.current = options;
  /** null while the database is being opened. */
  const [available, setAvailable] = useState<boolean | null>(null);
  const [list, setListState] = useState<Meta[]>([]);
  const listRef = useRef<Meta[]>([]);
  const setList = useCallback((next: Meta[]) => {
    listRef.current = next;
    setListState(next);
  }, []);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const current = useRef<(HistoryEntry<P> & { lastSig: string | null }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let live = true;
    openDb().then(async (db) => {
      if (!live) return;
      const items = db ? await opts.current.store.list().catch(() => []) : [];
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
    const o = opts.current;
    const sig = o.signature();
    if (sig === null || sig === cur.lastSig) return;
    let meta: Meta;
    try {
      meta = await o.save(cur);
    } catch (e) {
      const quota = e instanceof DOMException && e.name === 'QuotaExceededError';
      o.onError(quota ? 'Browser storage is full: delete some entries from the history.' : `Couldn’t save to the history: ${String(e)}`);
      return;
    }
    cur.pending = null;
    cur.lastSig = sig;

    const next = [meta, ...listRef.current.filter((m) => m.id !== meta.id)];
    setList(next.slice(0, o.limit));
    const drop = next.slice(o.limit).map((m) => m.id);
    if (drop.length) await o.store.remove(drop).catch(() => {});
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

  /** Starts a new entry (written once signature() is non-null). */
  const begin = useCallback((pending: P | null) => {
    clearTimeout(timer.current); // a save scheduled for the previous work must not land on the new entry
    const id = newId();
    current.current = { id, createdAt: Date.now(), pending, lastSig: null };
    setCurrentId(id);
    return id;
  }, []);

  /** Makes an opened entry current, as saved (so merely opening it doesn't save it again). */
  const adopt = useCallback((meta: { id: string; createdAt: number }, sig: string) => {
    clearTimeout(timer.current);
    current.current = { id: meta.id, createdAt: meta.createdAt, pending: null, lastSig: sig };
    setCurrentId(meta.id);
  }, []);

  const open = useCallback(async (id: string) => {
    await flush();
    return opts.current.store.load(id);
  }, [flush]);

  const remove = useCallback(async (id: string) => {
    if (current.current?.id === id) {
      clearTimeout(timer.current);
      current.current = null;
      setCurrentId(null);
    }
    await queue.current.catch(() => {});
    setList(listRef.current.filter((m) => m.id !== id));
    await opts.current.store.remove([id]).catch((e) => opts.current.onError(`Couldn’t delete: ${String(e)}`));
  }, [setList]);

  return { available, list, currentId, begin, adopt, schedule, flush, open, remove };
}
