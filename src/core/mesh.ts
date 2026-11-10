// A triangle soup with just enough material data to colour voxels. Plain typed arrays so it can go to a worker.
import type { RGBAImage } from './resample';
import type { RGB } from './types';

export interface MeshMaterial {
  /** Base colour (sRGB 0-255), multiplied with the texture and vertex colours. */
  rgb: RGB;
  /** 0-1. Below 0.5 the material counts as see-through. */
  alpha: number;
  /** Texels with alpha (0-1) below this are holes (glTF alphaMode MASK / BLEND). 0 = ignore texture alpha. */
  alphaCutoff: number;
  /** Index into MeshData.textures, or -1. */
  texture: number;
}

export interface MeshData {
  /** 9 floats per triangle (three xyz corners), Y up. */
  positions: Float32Array;
  /** 6 floats per triangle, or null. v = 0 is the top row of the texture image. */
  uvs: Float32Array | null;
  /** 9 bytes per triangle (sRGB per corner), or null. */
  colors: Uint8Array | null;
  /** Material index per triangle. */
  material: Uint16Array;
  materials: MeshMaterial[];
  textures: RGBAImage[];
}

export const triangleCount = (m: Pick<MeshData, 'positions'>) => Math.floor(m.positions.length / 9);

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

export function bounds(positions: Float32Array): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = positions[i + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  return { min, max };
}

/** Which model axis points up. glTF is Y-up; STL files from CAD and slicers are usually Z-up. */
export type UpAxis = 'y' | 'z';

/**
 * Row-major 3x3 rotation that turns `up` into +Y, then `turns` quarter turns clockwise seen from above.
 * Z-up to Y-up maps (x, y, z) -> (x, z, -y), which keeps the model's front (-Y in Z-up tools) facing +Z (south).
 * Clockwise from above with x east and z south moves east -> south -> west -> north: (x, z) -> (-z, x).
 */
export function orientMatrix(up: UpAxis, turns: number): number[] {
  let m = up === 'z' ? [1, 0, 0, 0, 0, 1, 0, -1, 0] : [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const turn = [0, 0, -1, 0, 1, 0, 1, 0, 0];
  for (let k = 0; k < ((turns % 4) + 4) % 4; k++) {
    const r: number[] = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r.push(turn[i * 3] * m[j] + turn[i * 3 + 1] * m[3 + j] + turn[i * 3 + 2] * m[6 + j]);
    m = r;
  }
  return m;
}

/** Positions rotated by `orientMatrix(up, turns)`. */
export function orientPositions(positions: Float32Array, up: UpAxis, turns: number): Float32Array {
  const m = orientMatrix(up, turns);
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    out[i] = m[0] * x + m[1] * y + m[2] * z;
    out[i + 1] = m[3] * x + m[4] * y + m[5] * z;
    out[i + 2] = m[6] * x + m[7] * y + m[8] * z;
  }
  return out;
}
