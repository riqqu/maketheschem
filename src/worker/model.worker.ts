// Voxelizes a model, matches the voxels to blocks and builds the preview geometry off the main thread.
import { matchVoxels } from '../core/matchVoxels';
import type { MeshData, UpAxis } from '../core/mesh';
import { voxelizeMesh, type Interior, type VoxelSurface } from '../core/meshVoxels';
import type { PaletteColor } from '../core/quantize';
import { buildFaceMesh, type FaceMesh } from '../core/voxelMesh';
import type { Volume } from '../core/volume';

export interface ModelBuildRequest {
  size: number;
  up: UpAxis;
  turns: number;
  interior: Interior;
  top: PaletteColor[];
  side: PaletteColor[];
  /** Ordered dithering strength, 0 = off. */
  dither: number;
  maxTypes: number;
  single: number | null;
  /** `tiles[2*block]` = top tile, `tiles[2*block + 1]` = side tile. */
  tiles: Int32Array;
  atlasColumns: number;
}

export type ModelWorkerRequest =
  | { type: 'source'; mesh: MeshData | null }
  | ({ type: 'build'; id: number } & ModelBuildRequest);

export interface ModelBuildResult {
  volume: Volume;
  faces: FaceMesh;
  surfaceCount: number;
  interiorCount: number;
}

export type ModelWorkerResponse =
  | ({ type: 'result'; id: number } & ModelBuildResult)
  | { type: 'error'; id: number; message: string };

interface WorkerScope {
  onmessage: ((e: MessageEvent<ModelWorkerRequest>) => void) | null;
  postMessage(message: ModelWorkerResponse, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

let source: MeshData | null = null;
// Voxelizing depends only on the model, size, orientation and fill; block choices reuse it.
let cached: { key: string; surface: VoxelSurface } | null = null;

scope.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'source') {
    source = msg.mesh;
    cached = null;
    return;
  }
  try {
    if (!source) throw new Error('No model loaded');
    const key = `${msg.size}|${msg.up}|${msg.turns}|${msg.interior}`;
    if (cached?.key !== key) {
      cached = null; // free the old one before building the next
      cached = { key, surface: voxelizeMesh(source, { size: msg.size, up: msg.up, turns: msg.turns, interior: msg.interior }) };
    }
    const surface = cached.surface;
    const volume = matchVoxels(surface, { top: msg.top, side: msg.side, dither: msg.dither, maxTypes: msg.maxTypes, single: msg.single });
    const faces = buildFaceMesh(volume, msg.tiles, msg.atlasColumns);
    scope.postMessage(
      { type: 'result', id: msg.id, volume, faces, surfaceCount: surface.surfaceCount, interiorCount: surface.interiorCount },
      [volume.cells.buffer, faces.positions.buffer, faces.uvs.buffer, faces.tiles.buffer, faces.shade.buffer, faces.indices.buffer, faces.voxel.buffer],
    );
  } catch (err) {
    scope.postMessage({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) });
  }
};
