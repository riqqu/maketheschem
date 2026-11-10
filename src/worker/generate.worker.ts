// Removes the background, resizes the source image and matches it to blocks off the main thread.
import { backgroundCells, removeBackground, type BackgroundOptions } from '../core/background';
import { quantize, type PaletteColor } from '../core/quantize';
import { resample, type RGBAImage, type ResizeMode } from '../core/resample';
import type { RGB } from '../core/types';

export interface BackgroundInfo {
  color: RGB | null;
  removed: number;
}

export type WorkerRequest =
  | { type: 'source'; image: RGBAImage | null }
  | {
      type: 'generate';
      id: number;
      width: number;
      height: number;
      resize: ResizeMode;
      dither: number;
      palette: PaletteColor[];
      background: BackgroundOptions | null;
    }
  | {
      /** Which grid cells the background removal would erase (for applying it to an edited grid). */
      type: 'mask';
      id: number;
      width: number;
      height: number;
      resize: ResizeMode;
      background: BackgroundOptions;
    };

export type WorkerResponse =
  | { type: 'result'; id: number; width: number; height: number; cells: Uint16Array; background: BackgroundInfo | null }
  | { type: 'mask'; id: number; mask: Uint8Array; background: BackgroundInfo }
  | { type: 'error'; id: number; message: string };

interface WorkerScope {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

let source: RGBAImage | null = null;
// Background removal depends only on the source and its options, so reuse it across palette/size changes.
let cleaned: { key: string; image: RGBAImage; info: BackgroundInfo } | null = null;

function clean(src: RGBAImage, options: BackgroundOptions) {
  const key = `${options.tolerance}|${options.mode}`;
  if (cleaned?.key !== key) {
    const r = removeBackground(src, options);
    cleaned = { key, image: r.image, info: { color: r.color, removed: r.removed } };
  }
  return cleaned;
}

scope.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'source') {
    source = msg.image;
    cleaned = null;
    return;
  }
  try {
    if (!source) throw new Error('No image loaded');
    if (msg.type === 'mask') {
      const c = clean(source, msg.background);
      const mask = backgroundCells(source, c.image, msg.width, msg.height, msg.resize);
      scope.postMessage({ type: 'mask', id: msg.id, mask, background: c.info }, [mask.buffer]);
      return;
    }
    const c = msg.background ? clean(source, msg.background) : null;
    const pixels = resample(c ? c.image : source, msg.width, msg.height, msg.resize);
    const cells = quantize(pixels, msg.width, msg.height, msg.palette, { dither: msg.dither });
    scope.postMessage(
      { type: 'result', id: msg.id, width: msg.width, height: msg.height, cells, background: c ? c.info : null },
      [cells.buffer],
    );
  } catch (err) {
    scope.postMessage({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) });
  }
};
