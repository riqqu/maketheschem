// Draws a grid to an offscreen canvas: thumbnails, PNG export and the editor's flat-colour view.
import type { Grid } from '../core/grid';
import { AIR, faceOf, type BlockInfo, type Orientation } from '../core/types';

export interface AtlasInfo {
  atlas: HTMLImageElement | null;
  tileSize: number;
  atlasColumns: number;
}

/** One pixel per block in each block's average colour; air stays transparent. */
export function colorPixels(grid: Grid, blocks: readonly BlockInfo[], orientation: Orientation): ImageData {
  const img = new ImageData(grid.width, grid.height);
  const lut = new Uint8Array(blocks.length * 3);
  blocks.forEach((b, i) => lut.set(faceOf(b, orientation).rgb, i * 3));
  for (let i = 0; i < grid.cells.length; i++) {
    const v = grid.cells[i];
    if (v === AIR || v >= blocks.length) continue;
    img.data[i * 4] = lut[v * 3];
    img.data[i * 4 + 1] = lut[v * 3 + 1];
    img.data[i * 4 + 2] = lut[v * 3 + 2];
    img.data[i * 4 + 3] = 255;
  }
  return img;
}

function canvas2d(width: number, height: number) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  return { c, ctx };
}

export function colorCanvas(grid: Grid, blocks: readonly BlockInfo[], orientation: Orientation): HTMLCanvasElement {
  const { c, ctx } = canvas2d(grid.width, grid.height);
  ctx.putImageData(colorPixels(grid, blocks, orientation), 0, 0);
  return c;
}

/** Pixels per block for a PNG export: up to 16 (one texture pixel per pixel), at most ~4096 px on the long side. */
export const pngScale = (grid: Grid) => Math.max(1, Math.min(16, Math.floor(4096 / Math.max(grid.width, grid.height))));
/** Textures need at least this many pixels per block to be recognisable. */
export const MIN_TEXTURE_SCALE = 4;

/** The art at `px` pixels per block, with textures when possible (otherwise flat colours). */
export function renderArt(
  grid: Grid, blocks: readonly BlockInfo[], orientation: Orientation, px: number, textures: boolean, atlas: AtlasInfo,
): HTMLCanvasElement {
  const { c, ctx } = canvas2d(grid.width * px, grid.height * px);
  ctx.imageSmoothingEnabled = false;
  if (textures && atlas.atlas && px >= MIN_TEXTURE_SCALE) {
    const { tileSize: ts, atlasColumns: cols } = atlas;
    const tiles = blocks.map((b) => faceOf(b, orientation).tile);
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const v = grid.cells[y * grid.width + x];
        if (v === AIR || v >= tiles.length) continue;
        const t = tiles[v];
        ctx.drawImage(atlas.atlas, (t % cols) * ts, Math.floor(t / cols) * ts, ts, ts, x * px, y * px, px, px);
      }
    }
  } else {
    ctx.drawImage(colorCanvas(grid, blocks, orientation), 0, 0, c.width, c.height);
  }
  return c;
}

export const canvasToBlob = (c: HTMLCanvasElement, type = 'image/png') =>
  new Promise<Blob | null>((resolve) => c.toBlob(resolve, type));

/** Small PNG of the art in flat colours, at most `max` px on the long side (small art is scaled up crisply). */
export function thumbnail(grid: Grid, blocks: readonly BlockInfo[], orientation: Orientation, max = 96): Promise<Blob | null> {
  const src = colorCanvas(grid, blocks, orientation);
  const long = Math.max(grid.width, grid.height);
  const s = long <= max ? Math.floor(max / long) : max / long;
  const w = Math.max(1, Math.round(grid.width * s)), h = Math.max(1, Math.round(grid.height * s));
  const { c, ctx } = canvas2d(w, h);
  ctx.imageSmoothingEnabled = s < 1;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return canvasToBlob(c);
}

/** The centre square of an image, scaled down to `max` px: a list thumbnail of a 3D view (the model is fitted centred). */
export async function squareThumbnail(image: Blob, max = 96): Promise<Blob | null> {
  const bmp = await createImageBitmap(image);
  try {
    const side = Math.min(bmp.width, bmp.height);
    if (!side) return null;
    const out = Math.min(max, side);
    const { c, ctx } = canvas2d(out, out);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, out, out);
    return canvasToBlob(c);
  } finally {
    bmp.close();
  }
}

/** Starts a browser download of `data`. */
export function downloadBlob(data: Blob, fileName: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
