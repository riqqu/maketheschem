import type { RGBAImage } from '../core/resample';

/** Sources are pre-scaled to at most this many pixels per side (the grid never exceeds 1024). */
const MAX_SOURCE = 2048;

export interface LoadedImage {
  /** Changes on every load, used to detect a new source. */
  key: string;
  name: string;
  url: string;
  naturalWidth: number;
  naturalHeight: number;
  pixels: RGBAImage;
}

let counter = 0;

export async function loadImageFile(file: File): Promise<LoadedImage> {
  const bitmap = await createImageBitmap(file);
  const naturalWidth = bitmap.width;
  const naturalHeight = bitmap.height;
  const s = Math.min(1, MAX_SOURCE / Math.max(naturalWidth, naturalHeight));
  const w = Math.max(1, Math.round(naturalWidth * s));
  const h = Math.max(1, Math.round(naturalHeight * s));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is not available');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, w, h);
  return {
    key: `${++counter}:${file.name}`,
    name: file.name,
    url: URL.createObjectURL(file),
    naturalWidth,
    naturalHeight,
    pixels: { width: w, height: h, data },
  };
}

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
