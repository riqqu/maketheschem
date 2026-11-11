import { useCallback, useRef } from 'react';
import type { Grid } from '../core/grid';
import { encodeGrid, hashGrid } from '../core/serialize';
import { BLOCKS } from '../data';
import { deleteArts, listArts, loadArt, saveArt, type ArtMeta, type ArtSource } from '../lib/db';
import { thumbnail } from '../lib/render';
import { settingsSignature, type ArtSettings } from './settings';
import { useAutosaveHistory, type HistoryStore } from './useAutosaveHistory';

/** Most arts kept; the oldest are dropped beyond this. */
export const HISTORY_LIMIT = 40;

/** What the app currently shows, read at save time. */
export interface ArtSnapshot {
  name: string;
  settings: ArtSettings;
  grid: Grid | null;
  edited: boolean;
  hasImage: boolean;
  blockCount: number;
}

const STORE: HistoryStore<ArtMeta, Awaited<ReturnType<typeof loadArt>>> = { list: listArts, load: loadArt, remove: deleteArts };

const signature = (s: Pick<ArtSnapshot, 'name' | 'settings' | 'edited'>, grid: Grid) =>
  `${s.name}|${s.edited}|${settingsSignature(s.settings)}|${grid.width}x${grid.height}:${hashGrid(grid)}`;

/**
 * One history entry per art. Call begin() when a new art starts, adopt() after opening one, schedule() after every
 * change; saves are debounced, skipped while nothing changed, and serialised.
 */
export function useArtHistory(getSnapshot: () => ArtSnapshot, onError: (message: string) => void) {
  const snapshotRef = useRef(getSnapshot);
  snapshotRef.current = getSnapshot;

  const h = useAutosaveHistory<ArtMeta, Awaited<ReturnType<typeof loadArt>>, Omit<ArtSource, 'id'>>({
    store: STORE,
    limit: HISTORY_LIMIT,
    onError,
    signature: () => {
      const s = snapshotRef.current();
      // Nothing worth keeping until there is an image or a block.
      return s.grid && (s.hasImage || s.blockCount > 0) ? signature(s, s.grid) : null;
    },
    save: async (entry) => {
      const snap = snapshotRef.current();
      const grid = snap.grid!;
      const encoded = encodeGrid(grid, BLOCKS);
      const thumb = await thumbnail(grid, BLOCKS, snap.settings.orientation).catch(() => null);
      const meta: ArtMeta = {
        id: entry.id,
        name: snap.name,
        createdAt: entry.createdAt,
        updatedAt: Date.now(),
        orientation: snap.settings.orientation,
        width: grid.width,
        height: grid.height,
        blockCount: snap.blockCount,
        hasImage: snap.hasImage,
        thumb,
      };
      const source = entry.pending ? { id: entry.id, ...entry.pending } : null;
      await saveArt(meta, { id: entry.id, settings: snap.settings, grid: encoded, edited: snap.edited }, source);
      return meta;
    },
  });

  const { adopt: adoptRaw } = h;
  /** Makes an opened art current, as saved (so merely opening it doesn't save it again). */
  const adopt = useCallback(
    (meta: ArtMeta, state: Pick<ArtSnapshot, 'name' | 'settings' | 'edited'>, grid: Grid) => adoptRaw(meta, signature(state, grid)),
    [adoptRaw],
  );

  return { ...h, adopt };
}
