import { describe, expect, it } from 'vitest';
import { orientPositions, type MeshData, type MeshMaterial } from './mesh';
import { closestBarycentric, triBoxOverlap, voxelDimensions, voxelizeMesh, type VoxelSurface } from './meshVoxels';

const WHITE: MeshMaterial = { rgb: [255, 255, 255], alpha: 1, alphaCutoff: 0, texture: -1 };

/** Axis-aligned box from (0,0,0) to (sx,sy,sz) as 12 triangles. */
function boxMesh(sx = 1, sy = 1, sz = 1, material: MeshMaterial = WHITE): MeshData {
  const c = (i: number) => [(i & 1) * sx, ((i >> 1) & 1) * sy, ((i >> 2) & 1) * sz];
  const quads = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  const pos: number[] = [];
  for (const [a, b, cc, d] of quads) pos.push(...c(a), ...c(b), ...c(cc), ...c(a), ...c(cc), ...c(d));
  return { positions: Float32Array.from(pos), uvs: null, colors: null, material: new Uint16Array(12), materials: [material], textures: [] };
}

const filled = (s: VoxelSurface) => {
  let n = 0;
  for (const v of s.slot) if (v >= 0) n++;
  return n;
};
const at = (s: VoxelSurface, x: number, y: number, z: number) => s.slot[(y * s.length + z) * s.width + x];

describe('triBoxOverlap', () => {
  const tri = (...v: number[]) => Float64Array.from(v);
  it('detects a triangle through the cube and one beside it', () => {
    expect(triBoxOverlap(tri(-1, 0, -1, 1, 0, -1, 0, 0, 1), 0.5)).toBe(true);
    expect(triBoxOverlap(tri(-1, 0.6, -1, 1, 0.6, -1, 0, 0.6, 1), 0.5)).toBe(false);
  });
  it('separates a triangle whose bounding box overlaps but which misses the corner', () => {
    // Diagonal triangle cutting near the (+,+,+) corner region, but past it.
    expect(triBoxOverlap(tri(2, 0, 0, 0, 2, 0, 0, 0, 2), 0.5)).toBe(false);
    expect(triBoxOverlap(tri(1.4, 0, 0, 0, 1.4, 0, 0, 0, 1.4), 0.5)).toBe(true);
  });
});

describe('closestBarycentric', () => {
  const t = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  const out = new Float64Array(3);
  it('is the projection inside the triangle and the nearest corner outside', () => {
    closestBarycentric([0.25, 0.25, 5], t, out);
    expect([...out].map((v) => +v.toFixed(6))).toEqual([0.5, 0.25, 0.25]);
    closestBarycentric([-3, -3, 0], t, out);
    expect([...out]).toEqual([1, 0, 0]);
  });
});

describe('orientPositions', () => {
  it('turns Z-up into Y-up without mirroring and turns clockwise from above', () => {
    expect([...orientPositions(Float32Array.from([1, 2, 3]), 'z', 0)]).toEqual([1, 3, -2]);
    // east (+x) -> south (+z) after one clockwise turn
    expect([...orientPositions(Float32Array.from([1, 0, 0]), 'y', 1)].map((v) => v + 0)).toEqual([0, 0, 1]);
  });
});

describe('voxelizeMesh', () => {
  const opts = { size: 4, interior: 'hollow' as const, up: 'y' as const, turns: 0 };

  it('turns a cube into a closed shell, or a full block when solid', () => {
    const hollow = voxelizeMesh(boxMesh(), opts);
    expect([hollow.width, hollow.height, hollow.length]).toEqual([4, 4, 4]);
    expect(filled(hollow)).toBe(64 - 8);
    expect(at(hollow, 1, 1, 1)).toBe(-1);
    const solid = voxelizeMesh(boxMesh(), { ...opts, interior: 'solid' });
    expect(filled(solid)).toBe(64);
    expect(solid.interiorCount).toBe(8);
  });

  it('scales the longest side to the size and keeps proportions', () => {
    const s = voxelizeMesh(boxMesh(2, 1, 0.5), { ...opts, size: 8 });
    expect([s.width, s.height, s.length]).toEqual([8, 4, 2]);
    expect(voxelDimensions(boxMesh(2, 1, 0.5), { size: 8, up: 'y', turns: 1 })).toEqual({ width: 2, height: 4, length: 8 });
  });

  it('leaves no gaps under a slanted triangle', () => {
    const mesh: MeshData = { ...boxMesh(), positions: Float32Array.from([0, 0, 0, 10, 3, 0, 0, 7, 10]), material: new Uint16Array(1) };
    const s = voxelizeMesh(mesh, { ...opts, size: 10 });
    // Every column the triangle covers has at least one voxel.
    for (let z = 0; z < s.length; z++) {
      for (let x = 0; x < s.width; x++) {
        if (x / 10 + z / 10 > 0.95) continue; // outside the triangle's footprint (with a margin)
        let any = false;
        for (let y = 0; y < s.height; y++) if (at(s, x, y, z) >= 0) any = true;
        expect(any, `column ${x},${z}`).toBe(true);
      }
    }
  });

  it('takes colours from the material, vertex colours and texture', () => {
    const red = voxelizeMesh(boxMesh(1, 1, 1, { ...WHITE, rgb: [200, 0, 0] }), opts);
    expect([...red.rgb.subarray(0, 3)]).toEqual([200, 0, 0]);

    // A floor quad (y = 0) textured with a 2x1 texture: left half black, right half white.
    const quad = Float32Array.from([0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0]);
    const uvs = Float32Array.from([0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0]);
    const tex = { width: 2, height: 1, data: Uint8ClampedArray.from([0, 0, 0, 255, 255, 255, 255, 0]) };
    const mesh: MeshData = {
      positions: quad, uvs, colors: null, material: new Uint16Array(2),
      materials: [{ ...WHITE, texture: 0, alphaCutoff: 0.5 }], textures: [tex],
    };
    const s = voxelizeMesh(mesh, { ...opts, size: 4 });
    expect(s.height).toBe(1);
    const colourAt = (x: number, z: number) => [...s.rgb.subarray(at(s, x, 0, z) * 3, at(s, x, 0, z) * 3 + 3)];
    expect(colourAt(0, 1)).toEqual([0, 0, 0]);
    // The right half of the texture is transparent: no voxels there.
    expect(at(s, 3, 0, 1)).toBe(-1);
    expect(s.axis[at(s, 0, 0, 1)]).toBe(1); // faces up
  });

  it('skips see-through materials', () => {
    expect(() => voxelizeMesh(boxMesh(1, 1, 1, { ...WHITE, alpha: 0.2 }), opts)).toThrow(/Nothing to build/);
  });
});
