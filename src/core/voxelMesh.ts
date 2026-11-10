// Geometry for the 3D preview: one textured quad per block face that touches air.
import { AIR } from './types';
import type { Volume } from './volume';

export interface FaceMesh {
  /** 12 floats per quad (4 corners). */
  positions: Float32Array;
  /** 8 floats per quad: texture position inside the tile, 0..1, v = 0 at the top. */
  uvs: Float32Array;
  /**
   * 8 floats per quad: the atlas tile (column, row from the top), the same at all four corners. Kept apart from the
   * UVs so the shader can clamp sampling inside the tile (antialiasing samples just outside a face otherwise bleed in
   * the neighbouring tile).
   */
  tiles: Float32Array;
  /** 4 floats per quad: per-corner brightness, baked Minecraft-style face shading. */
  shade: Float32Array;
  /** 6 indices per quad (two counter-clockwise triangles). */
  indices: Uint32Array;
  /** Per quad: the voxel index it belongs to (for hover picking: quad = triangle >> 1). */
  voxel: Uint32Array;
  quads: number;
}

interface FaceDef {
  dx: number;
  dy: number;
  dz: number;
  /** Corners BL, BR, TR, TL as seen from outside (texture upright; top/bottom have north up). */
  corners: number[];
  top: boolean;
  shade: number;
}

const FACES: FaceDef[] = [
  { dx: 1, dy: 0, dz: 0, corners: [1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1], top: false, shade: 0.6 },
  { dx: -1, dy: 0, dz: 0, corners: [0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0], top: false, shade: 0.6 },
  { dx: 0, dy: 1, dz: 0, corners: [0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0], top: true, shade: 1 },
  { dx: 0, dy: -1, dz: 0, corners: [1, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0], top: true, shade: 0.45 },
  { dx: 0, dy: 0, dz: 1, corners: [0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1], top: false, shade: 0.8 },
  { dx: 0, dy: 0, dz: -1, corners: [1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0], top: false, shade: 0.8 },
];
/** Texture corner (u, v) for BL, BR, TR, TL. */
const CORNER_UV = [0, 1, 1, 1, 1, 0, 0, 0];

/**
 * @param tiles atlas tile per block and face: `tiles[2*block]` = top, `tiles[2*block + 1]` = side
 * @param atlasColumns tiles per atlas row
 */
export function buildFaceMesh(vol: Volume, tiles: ArrayLike<number>, atlasColumns: number): FaceMesh {
  const { width: W, height: H, length: L, cells } = vol;
  const at = (x: number, y: number, z: number) =>
    x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= L ? AIR : cells[(y * L + z) * W + x];

  let quads = 0;
  for (let y = 0; y < H; y++) {
    for (let z = 0; z < L; z++) {
      for (let x = 0; x < W; x++) {
        if (cells[(y * L + z) * W + x] === AIR) continue;
        for (const f of FACES) if (at(x + f.dx, y + f.dy, z + f.dz) === AIR) quads++;
      }
    }
  }

  const positions = new Float32Array(quads * 12);
  const uvs = new Float32Array(quads * 8);
  const tileArr = new Float32Array(quads * 8);
  const shade = new Float32Array(quads * 4);
  const indices = new Uint32Array(quads * 6);
  const voxel = new Uint32Array(quads);
  let q = 0;
  for (let y = 0; y < H; y++) {
    for (let z = 0; z < L; z++) {
      for (let x = 0; x < W; x++) {
        const vi = (y * L + z) * W + x;
        const block = cells[vi];
        if (block === AIR) continue;
        for (const f of FACES) {
          if (at(x + f.dx, y + f.dy, z + f.dz) !== AIR) continue;
          const tile = tiles[block * 2 + (f.top ? 0 : 1)];
          const col = tile % atlasColumns, row = Math.floor(tile / atlasColumns);
          for (let c = 0; c < 4; c++) {
            positions[q * 12 + c * 3] = x + f.corners[c * 3];
            positions[q * 12 + c * 3 + 1] = y + f.corners[c * 3 + 1];
            positions[q * 12 + c * 3 + 2] = z + f.corners[c * 3 + 2];
            uvs[q * 8 + c * 2] = CORNER_UV[c * 2];
            uvs[q * 8 + c * 2 + 1] = CORNER_UV[c * 2 + 1];
            tileArr[q * 8 + c * 2] = col;
            tileArr[q * 8 + c * 2 + 1] = row;
            shade[q * 4 + c] = f.shade;
          }
          const b = q * 4;
          indices.set([b, b + 1, b + 2, b, b + 2, b + 3], q * 6);
          voxel[q] = vi;
          q++;
        }
      }
    }
  }
  return { positions, uvs, tiles: tileArr, shade, indices, voxel, quads };
}
