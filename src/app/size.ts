import type { Orientation } from '../core/types';

export const MAX_SIDE = 1024;
/** Overworld build height (-64..319). A taller wall cannot be pasted. */
export const MAX_WALL_HEIGHT = 384;

export const maxHeightFor = (o: Orientation) => (o === 'wall' ? MAX_WALL_HEIGHT : MAX_SIDE);

export interface Size {
  width: number;
  height: number;
}

const clampInt = (v: number, max: number) => Math.min(max, Math.max(1, Math.round(Number.isFinite(v) ? v : 1)));

/** aspect = height / width. Keeps the ratio while respecting the limits. */
export function sizeFromWidth(w: number, aspect: number, maxW: number, maxH: number): Size {
  let width = clampInt(w, maxW);
  let height = clampInt(width * aspect, Number.MAX_SAFE_INTEGER);
  if (height > maxH) {
    height = maxH;
    width = clampInt(height / aspect, maxW);
  }
  return { width, height };
}

export function sizeFromHeight(h: number, aspect: number, maxW: number, maxH: number): Size {
  let height = clampInt(h, maxH);
  let width = clampInt(height / aspect, Number.MAX_SAFE_INTEGER);
  if (width > maxW) {
    width = maxW;
    height = clampInt(width * aspect, maxH);
  }
  return { width, height };
}

/** Longest side = n. */
export function sizeFromLongest(n: number, aspect: number, maxW: number, maxH: number): Size {
  return aspect > 1 ? sizeFromHeight(n, aspect, maxW, maxH) : sizeFromWidth(n, aspect, maxW, maxH);
}

export function clampSize(s: Size, maxW: number, maxH: number): Size {
  return { width: clampInt(s.width, maxW), height: clampInt(s.height, maxH) };
}
