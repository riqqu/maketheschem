import { useSyncExternalStore } from 'react';
import { clampSidebar, sanitizeSidebarWidths, SIDEBAR_DEFAULTS, type Side, type SidebarWidths } from '../core/sidebar';
import { loadJSON, saveJSON } from '../lib/storage';

const SIDEBARS_KEY = 'mts.sidebars.v1';

// One store for the whole app: the pixel art and 3D workspaces each render their own frame, and both must show the same widths.
let widths: SidebarWidths = sanitizeSidebarWidths(loadJSON<unknown>(SIDEBARS_KEY, null));
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export function setSidebarWidth(side: Side, width: number) {
  const next = clampSidebar(side, width, window.innerWidth);
  if (next === widths[side]) return;
  widths = { ...widths, [side]: next };
  saveJSON(SIDEBARS_KEY, widths);
  listeners.forEach((l) => l());
}

export const resetSidebarWidth = (side: Side) => setSidebarWidth(side, SIDEBAR_DEFAULTS[side]);

export const useSidebarWidths = () => useSyncExternalStore(subscribe, () => widths);

const subscribeResize = (listener: () => void) => {
  window.addEventListener('resize', listener);
  return () => window.removeEventListener('resize', listener);
};

/** The window width, so a sidebar's effective width follows a window that shrinks after it was set. */
export const useViewportWidth = () => useSyncExternalStore(subscribeResize, () => window.innerWidth);
