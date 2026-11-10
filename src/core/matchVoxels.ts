// Picks a block for every voxel: up/down-facing surfaces match against top textures, the rest against side textures.
import type { VoxelSurface } from './meshVoxels';
import { BAYER, makeMatcher, ORDERED_SPREAD, type PaletteColor } from './quantize';
import { reducePalette } from './reduce';
import { AIR } from './types';
import type { Volume } from './volume';

export interface VoxelMatchOptions {
  /** Block colours seen from above (same values, same order as `side`). */
  top: readonly PaletteColor[];
  /** Block colours seen from the side. */
  side: readonly PaletteColor[];
  /** Ordered (pattern) dithering strength, 0 = off. */
  dither: number;
  /** Use at most this many block types (0 = no limit). */
  maxTypes: number;
  /** Build everything from this one block instead of matching colours (e.g. STL models without colour). */
  single: number | null;
}

export function matchVoxels(s: VoxelSurface, o: VoxelMatchOptions): Volume {
  const { width: W, height: H, length: L } = s;
  const S = s.surfaceCount;
  const blockOf = new Uint16Array(S).fill(AIR);

  if (o.single !== null) {
    blockOf.fill(o.single);
  } else if (o.side.length > 0) {
    let top = o.top, side = o.side;
    if (o.maxTypes > 0 && side.length > o.maxTypes) {
      // Choose the subset against the colours of the faces most of the model shows.
      let up = 0;
      for (let i = 0; i < S; i++) if (s.axis[i] === 1) up++;
      const pixels = new Uint8ClampedArray(S * 4);
      for (let i = 0; i < S; i++) {
        pixels.set(s.rgb.subarray(i * 3, i * 3 + 3), i * 4);
        pixels[i * 4 + 3] = 255;
      }
      const keep = new Set(reducePalette(pixels, up * 2 > S ? top : side, o.maxTypes).map((p) => p.value));
      top = top.filter((p) => keep.has(p.value));
      side = side.filter((p) => keep.has(p.value));
    }
    if (top.length === 0) top = side;
    const matchTop = makeMatcher(top);
    const matchSide = makeMatcher(side);
    const spread = ORDERED_SPREAD * Math.min(1, Math.max(0, o.dither));
    const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

    for (let i = 0; i < S; i++) {
      const isTop = s.axis[i] === 1;
      let r = s.rgb[i * 3], g = s.rgb[i * 3 + 1], b = s.rgb[i * 3 + 2];
      if (spread > 0) {
        // Lay the 8x8 pattern on the plane the surface faces, so it looks the same as on a flat wall or floor.
        const vi = s.voxel[i];
        const x = vi % W, z = Math.floor(vi / W) % L, y = Math.floor(vi / (W * L));
        const [pa, pb] = s.axis[i] === 1 ? [x, z] : s.axis[i] === 0 ? [z, y] : [x, y];
        const t = ((BAYER[(pb & 7) * 8 + (pa & 7)] + 0.5) / 64 - 0.5) * spread;
        r = clamp(r + t);
        g = clamp(g + t);
        b = clamp(b + t);
      }
      blockOf[i] = isTop ? top[matchTop(r, g, b)].value : side[matchSide(r, g, b)].value;
    }
  }

  const cells = new Uint16Array(W * H * L).fill(AIR);
  for (let i = 0; i < cells.length; i++) {
    const k = s.slot[i];
    if (k >= 0) cells[i] = blockOf[k];
  }
  return { width: W, height: H, length: L, cells };
}
