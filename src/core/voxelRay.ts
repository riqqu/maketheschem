// Which block a ray hits first, by stepping through the grid cell by cell (Amanatides & Woo).
import { AIR } from './types';
import type { Volume } from './volume';

export interface VoxelHit {
  x: number;
  y: number;
  z: number;
  block: number;
}

/** Origin and direction in voxel units (block (x, y, z) spans x..x+1 etc.). */
export function raycastVolume(
  vol: Volume, o: readonly [number, number, number], d: readonly [number, number, number],
): VoxelHit | null {
  const size = [vol.width, vol.height, vol.length];
  // Clip the ray to the volume's box.
  let t0 = 0, t1 = Infinity;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) {
      if (o[a] < 0 || o[a] > size[a]) return null;
      continue;
    }
    let ta = (0 - o[a]) / d[a], tb = (size[a] - o[a]) / d[a];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }

  const cell = [0, 0, 0], step = [0, 0, 0], tMax = [Infinity, Infinity, Infinity], tDelta = [Infinity, Infinity, Infinity];
  for (let a = 0; a < 3; a++) {
    const p = o[a] + d[a] * (t0 + 1e-9);
    cell[a] = Math.min(size[a] - 1, Math.max(0, Math.floor(p)));
    if (d[a] > 0) {
      step[a] = 1;
      tMax[a] = (cell[a] + 1 - o[a]) / d[a];
      tDelta[a] = 1 / d[a];
    } else if (d[a] < 0) {
      step[a] = -1;
      tMax[a] = (cell[a] - o[a]) / d[a];
      tDelta[a] = -1 / d[a];
    }
  }

  for (;;) {
    const block = vol.cells[(cell[1] * vol.length + cell[2]) * vol.width + cell[0]];
    if (block !== AIR) return { x: cell[0], y: cell[1], z: cell[2], block };
    const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : tMax[1] < tMax[2] ? 1 : 2;
    cell[a] += step[a];
    if (cell[a] < 0 || cell[a] >= size[a]) return null;
    tMax[a] += tDelta[a];
  }
}
