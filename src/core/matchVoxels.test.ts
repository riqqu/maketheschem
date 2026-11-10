import { describe, expect, it } from 'vitest';
import { matchVoxels } from './matchVoxels';
import type { VoxelSurface } from './meshVoxels';
import type { PaletteColor } from './quantize';
import { AIR } from './types';
import { buildFaceMesh } from './voxelMesh';
import { createVolume } from './volume';

// Two voxels side by side along x: slot 0 faces up, slot 1 faces sideways, both mid grey.
function surface(): VoxelSurface {
  return {
    width: 3, height: 1, length: 1,
    slot: Int32Array.from([0, 1, -1]),
    voxel: Uint32Array.from([0, 1]),
    rgb: Uint8Array.from([128, 128, 128, 128, 128, 128]),
    axis: Uint8Array.from([1, 0]),
    surfaceCount: 2, interiorCount: 0,
  };
}

// Block 0 looks grey from above and red from the side; block 1 the other way round.
const TOP: PaletteColor[] = [{ value: 0, rgb: [128, 128, 128] }, { value: 1, rgb: [200, 0, 0] }];
const SIDE: PaletteColor[] = [{ value: 0, rgb: [200, 0, 0] }, { value: 1, rgb: [128, 128, 128] }];

describe('matchVoxels', () => {
  it('matches up-facing voxels with top faces and the rest with side faces', () => {
    const v = matchVoxels(surface(), { top: TOP, side: SIDE, dither: 0, maxTypes: 0, single: null });
    expect([...v.cells]).toEqual([0, 1, AIR]);
  });

  it('fills everything with one block in single-block mode', () => {
    const v = matchVoxels(surface(), { top: TOP, side: SIDE, dither: 0, maxTypes: 0, single: 7 });
    expect([...v.cells]).toEqual([7, 7, AIR]);
  });

  it('limits the number of block types', () => {
    const v = matchVoxels(surface(), { top: TOP, side: SIDE, dither: 0, maxTypes: 1, single: null });
    expect(new Set([...v.cells].filter((c) => c !== AIR)).size).toBe(1);
  });

  it('gives interior voxels the block of the surface voxel they copy', () => {
    const s = { ...surface(), slot: Int32Array.from([0, 1, 1]), interiorCount: 1 };
    expect([...matchVoxels(s, { top: TOP, side: SIDE, dither: 0, maxTypes: 0, single: null }).cells]).toEqual([0, 1, 1]);
  });
});

describe('buildFaceMesh', () => {
  it('only emits faces that touch air', () => {
    const v = createVolume(2, 1, 1, 0);
    const m = buildFaceMesh(v, [5, 6], 32);
    expect(m.quads).toBe(10);
    expect(m.indices.length).toBe(60);
    expect(Math.max(...m.positions)).toBe(2);
    // Top faces use the top tile (5), sides the side tile (6), both in atlas row 0.
    const cols = new Set<number>(), rows = new Set<number>();
    for (let i = 0; i < m.tiles.length; i += 2) {
      cols.add(m.tiles[i]);
      rows.add(m.tiles[i + 1]);
    }
    expect([...cols].sort()).toEqual([5, 6]);
    expect([...rows]).toEqual([0]);
    expect(Math.min(...m.uvs)).toBe(0);
    expect(Math.max(...m.uvs)).toBe(1);
  });

  it('winds every quad counter-clockwise seen from outside', () => {
    const m = buildFaceMesh(createVolume(1, 1, 1, 0), [0, 0], 32);
    for (let q = 0; q < m.quads; q++) {
      const p = (k: number) => [0, 1, 2].map((a) => m.positions[q * 12 + k * 3 + a]);
      const [a, b, c] = [p(0), p(1), p(2)];
      const u = b.map((v, i) => v - a[i]), w = c.map((v, i) => v - a[i]);
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const centre = [0, 1, 2].map((a2) => (p(0)[a2] + p(2)[a2]) / 2 - 0.5);
      expect(n[0] * centre[0] + n[1] * centre[1] + n[2] * centre[2]).toBeGreaterThan(0);
    }
  });
});

describe('raycastVolume', () => {
  it('finds the first block along the ray and misses empty space', async () => {
    const { raycastVolume } = await import('./voxelRay');
    const v = createVolume(4, 1, 1);
    v.cells[2] = 5;
    v.cells[3] = 6;
    expect(raycastVolume(v, [-3, 0.5, 0.5], [1, 0, 0])).toEqual({ x: 2, y: 0, z: 0, block: 5 });
    expect(raycastVolume(v, [9, 0.5, 0.5], [-1, 0, 0])).toEqual({ x: 3, y: 0, z: 0, block: 6 });
    expect(raycastVolume(v, [0.5, 5, 0.5], [0, -1, 0])).toBeNull();
    expect(raycastVolume(v, [2.5, 5, 0.5], [0, -1, 0])?.block).toBe(5);
  });
});
