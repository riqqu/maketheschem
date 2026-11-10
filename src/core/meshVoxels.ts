// Turns a triangle mesh into voxels: a closed shell where the surface passes, coloured from the model's
// textures / vertex colours / materials, optionally filled inside.
import { bounds, orientPositions, triangleCount, type MeshData, type UpAxis } from './mesh';

export type Interior = 'hollow' | 'solid';

export interface VoxelizeOptions {
  /** Blocks along the model's longest side. */
  size: number;
  interior: Interior;
  up: UpAxis;
  /** Quarter turns clockwise seen from above. */
  turns: number;
}

export const MIN_MODEL_SIZE = 4;
export const MAX_MODEL_SIZE = 256;

/** Voxels before block matching. Surface voxels each own a colour slot; interior voxels reuse their nearest one. */
export interface VoxelSurface {
  width: number;
  height: number;
  length: number;
  /** Per voxel (index `(y*length + z)*width + x`): -1 = air, otherwise a colour slot. */
  slot: Int32Array;
  /** Per slot: the voxel it belongs to. */
  voxel: Uint32Array;
  /** Per slot: averaged sRGB colour (3 bytes). */
  rgb: Uint8Array;
  /** Per slot: main direction of the surface there, 0 = x (east/west), 1 = y (up/down), 2 = z (north/south). */
  axis: Uint8Array;
  surfaceCount: number;
  interiorCount: number;
}

/**
 * Where the model lands in the voxel grid: voxel = orient(p) * scale + offset (per axis), with the longest side
 * spanning `size` blocks and the model centred on its shorter axes. Shared with the 3D preview's source view.
 */
export function voxelTransform(mesh: Pick<MeshData, 'positions'>, o: Pick<VoxelizeOptions, 'size' | 'up' | 'turns'>) {
  return fit(orientPositions(mesh.positions, o.up, o.turns), o.size);
}

/** Grid size a model gets at `size` blocks along its longest side, without voxelizing it. */
export function voxelDimensions(mesh: Pick<MeshData, 'positions'>, o: Pick<VoxelizeOptions, 'size' | 'up' | 'turns'>) {
  const { dims } = voxelTransform(mesh, o);
  return { width: dims[0], height: dims[1], length: dims[2] };
}

function fit(positions: Float32Array, size: number) {
  const b = bounds(positions);
  const extent = [0, 1, 2].map((a) => Math.max(0, b.max[a] - b.min[a]));
  const longest = Math.max(...extent);
  if (!Number.isFinite(longest) || longest <= 0) throw new Error('The model has no size (no triangles, or all in one point).');
  const scale = clampSize(size) / longest;
  const dims = extent.map((e) => Math.max(1, Math.ceil(e * scale - 1e-6)));
  const offset = [0, 1, 2].map((a) => (dims[a] - extent[a] * scale) / 2 - b.min[a] * scale);
  return { positions, dims, scale, offset };
}

const clampSize = (n: number) => Math.min(MAX_MODEL_SIZE, Math.max(MIN_MODEL_SIZE, Math.round(n)));

// ---- geometry helpers ---------------------------------------------------------------------------

/**
 * Triangle (9 coords, relative to the box centre) vs axis-aligned cube of half size `h`: separating axis test
 * (Akenine-Möller). Touching counts as overlapping, so neighbouring voxels along a surface always connect.
 */
export function triBoxOverlap(t: Float64Array, h: number): boolean {
  const x0 = t[0], y0 = t[1], z0 = t[2], x1 = t[3], y1 = t[4], z1 = t[5], x2 = t[6], y2 = t[7], z2 = t[8];
  // The box's own axes: the triangle's bounding box must overlap the cube.
  if (Math.min(x0, x1, x2) > h || Math.max(x0, x1, x2) < -h) return false;
  if (Math.min(y0, y1, y2) > h || Math.max(y0, y1, y2) < -h) return false;
  if (Math.min(z0, z1, z2) > h || Math.max(z0, z1, z2) < -h) return false;

  // Cross products of the box axes with the triangle edges.
  const ax0 = x1 - x0, ay0 = y1 - y0, az0 = z1 - z0;
  const ax1 = x2 - x1, ay1 = y2 - y1, az1 = z2 - z1;
  const ax2 = x0 - x2, ay2 = y0 - y2, az2 = z0 - z2;
  if (
    separates(0, -az0, ay0, t, h) || separates(az0, 0, -ax0, t, h) || separates(-ay0, ax0, 0, t, h) ||
    separates(0, -az1, ay1, t, h) || separates(az1, 0, -ax1, t, h) || separates(-ay1, ax1, 0, t, h) ||
    separates(0, -az2, ay2, t, h) || separates(az2, 0, -ax2, t, h) || separates(-ay2, ax2, 0, t, h)
  ) return false;

  // The triangle's plane must pass through the cube.
  const nx = ay0 * az1 - az0 * ay1;
  const ny = az0 * ax1 - ax0 * az1;
  const nz = ax0 * ay1 - ay0 * ax1;
  const d = nx * x0 + ny * y0 + nz * z0;
  return Math.abs(d) <= h * (Math.abs(nx) + Math.abs(ny) + Math.abs(nz));
}

/** True if axis (ax, ay, az) separates the triangle from the cube. */
function separates(ax: number, ay: number, az: number, t: Float64Array, h: number): boolean {
  const p0 = ax * t[0] + ay * t[1] + az * t[2];
  const p1 = ax * t[3] + ay * t[4] + az * t[5];
  const p2 = ax * t[6] + ay * t[7] + az * t[8];
  const r = h * (Math.abs(ax) + Math.abs(ay) + Math.abs(az));
  return Math.min(p0, p1, p2) > r || Math.max(p0, p1, p2) < -r;
}

/** Barycentric weights of the point of triangle abc closest to p (Ericson, Real-Time Collision Detection 5.1.5). */
export function closestBarycentric(p: ArrayLike<number>, t: ArrayLike<number>, out: Float64Array): void {
  const ax = t[0], ay = t[1], az = t[2];
  const abx = t[3] - ax, aby = t[4] - ay, abz = t[5] - az;
  const acx = t[6] - ax, acy = t[7] - ay, acz = t[8] - az;
  const apx = p[0] - ax, apy = p[1] - ay, apz = p[2] - az;
  const set = (u: number, v: number, w: number) => {
    out[0] = u;
    out[1] = v;
    out[2] = w;
  };
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return set(1, 0, 0);
  const bpx = p[0] - t[3], bpy = p[1] - t[4], bpz = p[2] - t[5];
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return set(0, 1, 0);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return set(1 - v, v, 0);
  }
  const cpx = p[0] - t[6], cpy = p[1] - t[7], cpz = p[2] - t[8];
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return set(0, 0, 1);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return set(1 - w, 0, w);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return set(0, 1 - w, w);
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  set(1 - v - w, v, w);
}

// ---- voxelization -------------------------------------------------------------------------------

/** Growable per-slot accumulators. */
class Slots {
  count = 0;
  voxel = new Uint32Array(1024);
  /** r, g, b, samples */
  sum = new Float64Array(1024 * 4);
  /** |nx|, |ny|, |nz| */
  normal = new Float64Array(1024 * 3);

  add(voxel: number): number {
    if (this.count === this.voxel.length) {
      const grow = <T extends Uint32Array | Float64Array>(a: T, n: number): T => {
        const b = new (a.constructor as new (n: number) => T)(n);
        b.set(a);
        return b;
      };
      const n = this.voxel.length * 2;
      this.voxel = grow(this.voxel, n);
      this.sum = grow(this.sum, n * 4);
      this.normal = grow(this.normal, n * 3);
    }
    this.voxel[this.count] = voxel;
    return this.count++;
  }
}

export function voxelizeMesh(mesh: MeshData, options: VoxelizeOptions): VoxelSurface {
  const triangles = triangleCount(mesh);
  if (triangles === 0) throw new Error('The model has no triangles.');
  const { positions: pos, dims, scale, offset } = voxelTransform(mesh, options);
  const [W, H, L] = dims;

  const slot = new Int32Array(W * H * L).fill(-1);
  const slots = new Slots();

  const tri = new Float64Array(9); // voxel-space corners
  const rel = new Float64Array(9); // corners relative to the voxel centre
  const centre = new Float64Array(3);
  const bary = new Float64Array(3);
  const { uvs, colors, materials, textures } = mesh;

  for (let t = 0; t < triangles; t++) {
    const mat = materials[mesh.material[t]] ?? materials[0];
    if (mat && mat.alpha < 0.5) continue; // see-through material: not built
    for (let k = 0; k < 9; k++) tri[k] = pos[t * 9 + k] * scale + offset[k % 3];

    const e1x = tri[3] - tri[0], e1y = tri[4] - tri[1], e1z = tri[5] - tri[2];
    const e2x = tri[6] - tri[0], e2y = tri[7] - tri[1], e2z = tri[8] - tri[2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const nlen = Math.hypot(nx, ny, nz);
    if (!(nlen > 1e-12)) continue; // degenerate
    nx /= nlen;
    ny /= nlen;
    nz /= nlen;
    const anx = Math.abs(nx), any = Math.abs(ny), anz = Math.abs(nz);
    const planeD = nx * tri[0] + ny * tri[1] + nz * tri[2];

    // Walk the two axes the triangle faces least along; the plane gives the few cells to test on the third.
    const d = anx >= any && anx >= anz ? 0 : any >= anz ? 1 : 2;
    const u = d === 0 ? 1 : 0;
    const v = d === 2 ? 1 : 2;
    const n = [nx, ny, nz];
    const lo = (a: number) => Math.max(0, Math.floor(Math.min(tri[a], tri[a + 3], tri[a + 6]) - 1e-9));
    const hi = (a: number) => Math.min(dims[a] - 1, Math.floor(Math.max(tri[a], tri[a + 3], tri[a + 6]) + 1e-9));
    const u0 = lo(u), u1 = hi(u), v0 = lo(v), v1 = hi(v), d0 = lo(d), d1 = hi(d);
    const cell = [0, 0, 0];

    for (let cu = u0; cu <= u1; cu++) {
      for (let cv = v0; cv <= v1; cv++) {
        // Plane height along d at the four corners of this column.
        let pmin = Infinity, pmax = -Infinity;
        for (let k = 0; k < 4; k++) {
          const pu = cu + (k & 1), pv = cv + (k >> 1);
          const pd = (planeD - n[u] * pu - n[v] * pv) / n[d];
          if (pd < pmin) pmin = pd;
          if (pd > pmax) pmax = pd;
        }
        const ca = Math.max(d0, Math.floor(pmin - 1e-9));
        const cb = Math.min(d1, Math.floor(pmax + 1e-9));
        for (let cd = ca; cd <= cb; cd++) {
          cell[u] = cu;
          cell[v] = cv;
          cell[d] = cd;
          centre[0] = cell[0] + 0.5;
          centre[1] = cell[1] + 0.5;
          centre[2] = cell[2] + 0.5;
          for (let k = 0; k < 9; k++) rel[k] = tri[k] - centre[k % 3];
          if (!triBoxOverlap(rel, 0.5)) continue;

          // Colour at the point of the triangle nearest to the voxel centre.
          closestBarycentric(centre, tri, bary);
          let r = mat ? mat.rgb[0] : 255, g = mat ? mat.rgb[1] : 255, bl = mat ? mat.rgb[2] : 255;
          if (colors) {
            const o = t * 9;
            r *= (bary[0] * colors[o] + bary[1] * colors[o + 3] + bary[2] * colors[o + 6]) / 255;
            g *= (bary[0] * colors[o + 1] + bary[1] * colors[o + 4] + bary[2] * colors[o + 7]) / 255;
            bl *= (bary[0] * colors[o + 2] + bary[1] * colors[o + 5] + bary[2] * colors[o + 8]) / 255;
          }
          const tex = mat && mat.texture >= 0 ? textures[mat.texture] : undefined;
          if (tex && uvs) {
            const o = t * 6;
            const tu = bary[0] * uvs[o] + bary[1] * uvs[o + 2] + bary[2] * uvs[o + 4];
            const tv = bary[0] * uvs[o + 1] + bary[1] * uvs[o + 3] + bary[2] * uvs[o + 5];
            const px = Math.min(tex.width - 1, Math.floor((tu - Math.floor(tu)) * tex.width));
            const py = Math.min(tex.height - 1, Math.floor((tv - Math.floor(tv)) * tex.height));
            const ti = (py * tex.width + px) * 4;
            if (mat.alphaCutoff > 0 && tex.data[ti + 3] < mat.alphaCutoff * 255) continue; // a hole in the texture
            r *= tex.data[ti] / 255;
            g *= tex.data[ti + 1] / 255;
            bl *= tex.data[ti + 2] / 255;
          }

          const vi = (cell[1] * L + cell[2]) * W + cell[0];
          let s = slot[vi];
          if (s < 0) slot[vi] = s = slots.add(vi);
          slots.sum[s * 4] += r;
          slots.sum[s * 4 + 1] += g;
          slots.sum[s * 4 + 2] += bl;
          slots.sum[s * 4 + 3] += 1;
          slots.normal[s * 3] += anx;
          slots.normal[s * 3 + 1] += any;
          slots.normal[s * 3 + 2] += anz;
        }
      }
    }
  }

  const S = slots.count;
  if (S === 0) throw new Error('Nothing to build: the model is empty or fully see-through.');
  const rgb = new Uint8Array(S * 3);
  const axis = new Uint8Array(S);
  for (let s = 0; s < S; s++) {
    const c = slots.sum[s * 4 + 3];
    for (let k = 0; k < 3; k++) rgb[s * 3 + k] = Math.min(255, Math.max(0, Math.round(slots.sum[s * 4 + k] / c)));
    const ax = slots.normal[s * 3], ay = slots.normal[s * 3 + 1], az = slots.normal[s * 3 + 2];
    axis[s] = ay >= ax && ay >= az ? 1 : ax >= az ? 0 : 2;
  }

  const interiorCount = options.interior === 'solid' ? fillInterior(slot, slots.voxel.subarray(0, S), W, H, L) : 0;
  return { width: W, height: H, length: L, slot, voxel: slots.voxel.slice(0, S), rgb, axis, surfaceCount: S, interiorCount };
}

/**
 * Flood-fills the outside air from the grid's border; whatever air it can't reach is inside the model. Each inside
 * voxel then takes the slot of its nearest surface voxel (breadth-first from the surface). Returns how many were filled.
 */
function fillInterior(slot: Int32Array, surface: Uint32Array, W: number, H: number, L: number): number {
  const V = W * H * L;
  const outside = new Uint8Array(V);
  const queue = new Uint32Array(V);
  let head = 0, tail = 0;
  const seed = (i: number) => {
    if (slot[i] < 0 && !outside[i]) {
      outside[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let y = 0; y < H; y++) {
    for (let z = 0; z < L; z++) {
      for (let x = 0; x < W; x++) {
        if (x === 0 || y === 0 || z === 0 || x === W - 1 || y === H - 1 || z === L - 1) seed((y * L + z) * W + x);
      }
    }
  }
  const visit = (i: number, f: (j: number) => void) => {
    const x = i % W, z = Math.floor(i / W) % L, y = Math.floor(i / (W * L));
    if (x > 0) f(i - 1);
    if (x < W - 1) f(i + 1);
    if (z > 0) f(i - W);
    if (z < L - 1) f(i + W);
    if (y > 0) f(i - W * L);
    if (y < H - 1) f(i + W * L);
  };
  while (head < tail) visit(queue[head++], seed);

  head = tail = 0;
  for (const i of surface) queue[tail++] = i;
  let filled = 0;
  while (head < tail) {
    const i = queue[head++];
    const s = slot[i];
    visit(i, (j) => {
      if (slot[j] < 0 && !outside[j]) {
        slot[j] = s;
        queue[tail++] = j;
        filled++;
      }
    });
  }
  return filled;
}
