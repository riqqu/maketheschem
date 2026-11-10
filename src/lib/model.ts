// Reads GLB / glTF / STL files with three.js and flattens them into a MeshData triangle soup for voxelizing.
import {
  BufferGeometry, Color, InstancedMesh, Matrix3, Matrix4, Mesh, MeshStandardMaterial, SRGBColorSpace, Vector2, Vector3,
  type Material, type Object3D, type Texture,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { MeshData, MeshMaterial, UpAxis } from '../core/mesh';
import type { RGBAImage } from '../core/resample';

export { isModelFile, MODEL_EXTENSIONS } from './image';

/** Voxels are at most 256 per side, so larger textures add nothing but memory. */
const MAX_TEXTURE = 1024;
export const MAX_TRIANGLES = 6_000_000;

export interface LoadedModel {
  /** Changes on every load. */
  key: string;
  name: string;
  format: 'glb' | 'gltf' | 'stl';
  mesh: MeshData;
  triangles: number;
  /** Up axis the format usually has (glTF Y, STL Z). */
  defaultUp: UpAxis;
  /** The loaded scene, for showing the original model in the preview. Positions match `mesh.positions`. */
  object: Object3D;
  warnings: string[];
}

let counter = 0;

export async function loadModelFile(file: File): Promise<LoadedModel> {
  const ext = file.name.toLowerCase().split('.').pop();
  const data = await file.arrayBuffer();
  const key = `${++counter}:${file.name}`;
  if (ext === 'stl') return { key, name: file.name, format: 'stl', defaultUp: 'z', ...loadStl(data) };
  if (ext === 'glb' || ext === 'gltf') {
    const r = await loadGltf(data, ext);
    return { key, name: file.name, format: ext, defaultUp: 'y', ...r };
  }
  throw new Error('Not a .glb, .gltf or .stl file.');
}

// ---- STL ----------------------------------------------------------------------------------------

function loadStl(data: ArrayBuffer) {
  const geometry = new STLLoader().parse(data) as BufferGeometry & { hasColors?: boolean };
  const pos = geometry.getAttribute('position');
  const count = Math.floor(pos.count / 3);
  if (count === 0) throw new Error('The STL file has no triangles.');
  if (count > MAX_TRIANGLES) throw new Error(`The model has ${count.toLocaleString()} triangles; at most ${MAX_TRIANGLES.toLocaleString()} are supported.`);
  const positions = new Float32Array(count * 9);
  positions.set((pos.array as Float32Array).subarray(0, count * 9));
  const col = geometry.hasColors ? geometry.getAttribute('color') : null;
  let colors: Uint8Array | null = null;
  if (col) {
    colors = new Uint8Array(count * 9);
    for (let i = 0; i < count * 3; i++) {
      colors[i * 3] = linearToSrgb8(col.getX(i));
      colors[i * 3 + 1] = linearToSrgb8(col.getY(i));
      colors[i * 3 + 2] = linearToSrgb8(col.getZ(i));
    }
  }
  const mesh: MeshData = {
    positions, uvs: null, colors, material: new Uint16Array(count),
    materials: [{ rgb: [255, 255, 255], alpha: 1, alphaCutoff: 0, texture: -1 }], textures: [],
  };
  const object = new Mesh(geometry, new MeshStandardMaterial({ color: 0xd8d8d8, vertexColors: !!col, roughness: 0.8 }));
  const warnings = col ? [] : ['STL files have no colours. Pick a block under Colours, or the closest block to white is used.'];
  return { mesh, triangles: count, object, warnings };
}

// ---- glTF ---------------------------------------------------------------------------------------

/** The JSON part of a .glb / .gltf, to give clear errors before three.js tries to fetch or decode anything. */
function gltfJson(data: ArrayBuffer, ext: 'glb' | 'gltf'): { text: string | null; json: Record<string, unknown> } {
  try {
    if (ext === 'gltf') {
      const text = new TextDecoder().decode(data);
      return { text, json: JSON.parse(text) };
    }
    const view = new DataView(data);
    if (view.getUint32(0, true) !== 0x46546c67) throw new Error('bad magic'); // "glTF"
    const len = view.getUint32(12, true);
    return { text: null, json: JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, len))) };
  } catch {
    throw new Error(`This is not a valid .${ext} file.`);
  }
}

async function loadGltf(data: ArrayBuffer, ext: 'glb' | 'gltf') {
  const { text, json } = gltfJson(data, ext);
  const required = (json.extensionsRequired as string[] | undefined) ?? [];
  if (required.includes('KHR_draco_mesh_compression')) {
    throw new Error('This model is Draco-compressed, which isn’t supported yet. Export it again without mesh compression.');
  }
  const external = [...((json.buffers as { uri?: string }[]) ?? []), ...((json.images as { uri?: string }[]) ?? [])].filter(
    (r) => r.uri && !r.uri.startsWith('data:'),
  );
  if (external.length) {
    throw new Error(
      `This .gltf uses separate files (${external.map((r) => r.uri).slice(0, 3).join(', ')}). Export it as a single .glb instead.`,
    );
  }

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(text ?? data, '');
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const warnings: string[] = [];
  if (required.includes('KHR_texture_basisu')) warnings.push('Its KTX2 textures can’t be read, so only base colours are used.');
  return { ...flattenScene(scene, warnings), object: scene, warnings };
}

interface Part {
  geometry: BufferGeometry;
  matrix: Matrix4;
  /** Material per triangle range. */
  ranges: { start: number; count: number; material: Material | null }[];
}

function flattenScene(root: Object3D, warnings: string[]) {
  const parts: Part[] = [];
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const g = mesh.geometry;
    if (!g?.getAttribute('position')) return;
    const indexCount = g.index ? g.index.count : g.getAttribute('position').count;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const ranges =
      Array.isArray(mesh.material) && g.groups.length
        ? g.groups.map((gr) => ({ start: gr.start, count: Math.min(gr.count, indexCount - gr.start), material: mats[gr.materialIndex ?? 0] ?? null }))
        : [{ start: 0, count: indexCount, material: mats[0] ?? null }];
    const inst = o as InstancedMesh;
    if (inst.isInstancedMesh) {
      const m = new Matrix4();
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, m);
        parts.push({ geometry: g, matrix: new Matrix4().multiplyMatrices(mesh.matrixWorld, m), ranges });
      }
    } else {
      parts.push({ geometry: g, matrix: mesh.matrixWorld, ranges });
    }
  });

  let triangles = 0;
  for (const p of parts) for (const r of p.ranges) triangles += Math.floor(r.count / 3);
  if (triangles === 0) throw new Error('The model has no triangles.');
  if (triangles > MAX_TRIANGLES) {
    throw new Error(`The model has ${triangles.toLocaleString()} triangles; at most ${MAX_TRIANGLES.toLocaleString()} are supported.`);
  }

  const materials: MeshMaterial[] = [];
  const materialIndex = new Map<Material | null, number>();
  const textures: RGBAImage[] = [];
  const textureIndex = new Map<unknown, number>();
  const textureOf = new Map<number, Texture>();
  let textureFailed = false;

  const materialFor = (m: Material | null): number => {
    let i = materialIndex.get(m);
    if (i !== undefined) return i;
    const std = m as MeshStandardMaterial | null;
    const c = new Color(1, 1, 1);
    if (std?.color) c.copy(std.color);
    const rgb = { r: 1, g: 1, b: 1 };
    c.getRGB(rgb, SRGBColorSpace);
    let texture = -1;
    const map = std?.map ?? null;
    if (map?.image) {
      let t = textureIndex.get(map.image);
      if (t === undefined) {
        const img = readTexture(map.image as CanvasImageSource & { width?: unknown; height?: unknown });
        if (img) {
          t = textures.length;
          textures.push(img);
        } else {
          t = -1;
          textureFailed = true;
        }
        textureIndex.set(map.image, t);
      }
      texture = t;
    }
    const visible = !m || m.visible !== false;
    const transparent = !!m?.transparent;
    const mat: MeshMaterial = {
      rgb: [Math.round(rgb.r * 255), Math.round(rgb.g * 255), Math.round(rgb.b * 255)],
      alpha: !visible ? 0 : transparent ? m!.opacity : 1,
      // glTF MASK sets alphaTest; BLEND (transparent) keeps texels that are at least half opaque.
      alphaCutoff: m && m.alphaTest > 0 ? m.alphaTest : transparent ? 0.5 : 0,
      texture,
    };
    i = materials.length;
    materials.push(mat);
    materialIndex.set(m, i);
    if (texture >= 0 && map) textureOf.set(i, map);
    return i;
  };

  const positions = new Float32Array(triangles * 9);
  const material = new Uint16Array(triangles);
  const hasUv = parts.some((p) => p.geometry.getAttribute('uv'));
  const hasColor = parts.some((p) => p.geometry.getAttribute('color') && p.ranges.some((r) => (r.material as MeshStandardMaterial | null)?.vertexColors));
  const uvs = hasUv ? new Float32Array(triangles * 6) : null;
  const colors = hasColor ? new Uint8Array(triangles * 9).fill(255) : null;

  const v = new Vector3();
  const uv = new Vector2();
  const uvMatrix = new Matrix3();
  let t = 0;
  for (const part of parts) {
    const g = part.geometry;
    const pos = g.getAttribute('position');
    const uvAttr = g.getAttribute('uv');
    const colAttr = g.getAttribute('color');
    const index = g.index;
    for (const range of part.ranges) {
      const mi = materialFor(range.material);
      if (mi > 0xffff) throw new Error('The model has too many materials.');
      const map = textureOf.get(mi);
      if (map) {
        map.updateMatrix();
        uvMatrix.copy(map.matrix);
      }
      const useColor = !!colAttr && !!(range.material as MeshStandardMaterial | null)?.vertexColors;
      const end = range.start + Math.floor(range.count / 3) * 3;
      for (let k = range.start; k < end; k += 3) {
        for (let c = 0; c < 3; c++) {
          const vi = index ? index.getX(k + c) : k + c;
          v.set(pos.getX(vi), pos.getY(vi), pos.getZ(vi)).applyMatrix4(part.matrix);
          positions[t * 9 + c * 3] = v.x;
          positions[t * 9 + c * 3 + 1] = v.y;
          positions[t * 9 + c * 3 + 2] = v.z;
          if (uvs && uvAttr) {
            uv.set(uvAttr.getX(vi), uvAttr.getY(vi));
            if (map) {
              // Texture transform per corner; wrapping happens per sample in the voxelizer. v = 0 is the image top.
              uv.applyMatrix3(uvMatrix);
              if (map.flipY) uv.y = 1 - uv.y;
            }
            uvs[t * 6 + c * 2] = uv.x;
            uvs[t * 6 + c * 2 + 1] = uv.y;
          }
          if (colors && useColor) {
            colors[t * 9 + c * 3] = linearToSrgb8(colAttr.getX(vi));
            colors[t * 9 + c * 3 + 1] = linearToSrgb8(colAttr.getY(vi));
            colors[t * 9 + c * 3 + 2] = linearToSrgb8(colAttr.getZ(vi));
          }
        }
        material[t++] = mi;
      }
    }
  }
  if (textureFailed) warnings.push('Some textures couldn’t be read, so base colours are used there.');
  return { mesh: { positions, uvs, colors, material, materials, textures } satisfies MeshData, triangles };
}

/** Pixels of a texture image (ImageBitmap, <img> or canvas), scaled down to MAX_TEXTURE. */
function readTexture(image: CanvasImageSource & { width?: unknown; height?: unknown }): RGBAImage | null {
  const w0 = Number(image.width) || 0, h0 = Number(image.height) || 0;
  if (!w0 || !h0) return null;
  const s = Math.min(1, MAX_TEXTURE / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * s)), h = Math.max(1, Math.round(h0 * s));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(image, 0, 0, w, h);
    return { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data };
  } catch {
    return null;
  }
}

function linearToSrgb8(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}
