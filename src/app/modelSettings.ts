// Settings for turning a 3D model into blocks. Remembered as the defaults for the next model.
import type { UpAxis } from '../core/mesh';
import { MAX_MODEL_SIZE, MIN_MODEL_SIZE, type Interior } from '../core/meshVoxels';
import type { PaletteColor } from '../core/quantize';
import { blockIndexById, BLOCKS, defaultEnabledIds } from '../data';
import { loadJSON } from '../lib/storage';
import { buildPalette, MAX_TYPES_MAX, MAX_TYPES_MIN } from './settings';

export type ColorMode = 'match' | 'single';

export interface ModelSettings {
  /** Blocks along the longest side. */
  size: number;
  up: UpAxis;
  /** Quarter turns clockwise seen from above. */
  turns: number;
  interior: Interior;
  colorMode: ColorMode;
  /** Block id used when colorMode is 'single'. */
  singleBlock: string;
  smoothness: number;
  /** Pattern dithering only: error diffusion doesn't work across a 3D surface. */
  dither: 'off' | 'ordered';
  ditherStrength: number;
  maxTypesOn: boolean;
  maxTypes: number;
  enabled: string[];
}

export const MODEL_SIZE_PRESETS = [32, 64, 96, 128, 192, 256];

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  size: 64,
  up: 'y',
  turns: 0,
  interior: 'hollow',
  colorMode: 'match',
  singleBlock: blockIndexById.has('stone') ? 'stone' : BLOCKS[0]?.id ?? '',
  smoothness: 30,
  dither: 'off',
  ditherStrength: 0.8,
  maxTypesOn: false,
  maxTypes: 12,
  enabled: defaultEnabledIds(),
};

const pick = <T>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const num = (v: unknown, lo: number, hi: number, fallback: number, int = true) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  const c = Math.min(hi, Math.max(lo, v));
  return int ? Math.round(c) : c;
};

export function sanitizeModelSettings(raw: unknown, fallback: ModelSettings = DEFAULT_MODEL_SETTINGS): ModelSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    size: num(r.size, MIN_MODEL_SIZE, MAX_MODEL_SIZE, fallback.size),
    up: pick<UpAxis>(r.up, ['y', 'z'], fallback.up),
    turns: num(r.turns, 0, 3, fallback.turns),
    interior: pick<Interior>(r.interior, ['hollow', 'solid'], fallback.interior),
    colorMode: pick<ColorMode>(r.colorMode, ['match', 'single'], fallback.colorMode),
    singleBlock: typeof r.singleBlock === 'string' && blockIndexById.has(r.singleBlock) ? r.singleBlock : fallback.singleBlock,
    smoothness: num(r.smoothness, 0, 100, fallback.smoothness),
    dither: pick(r.dither, ['off', 'ordered'] as const, fallback.dither),
    ditherStrength: num(r.ditherStrength, 0.1, 1, fallback.ditherStrength, false),
    maxTypesOn: typeof r.maxTypesOn === 'boolean' ? r.maxTypesOn : fallback.maxTypesOn,
    maxTypes: num(r.maxTypes, MAX_TYPES_MIN, MAX_TYPES_MAX, fallback.maxTypes),
    enabled: Array.isArray(r.enabled)
      ? r.enabled.filter((id): id is string => typeof id === 'string' && blockIndexById.has(id))
      : fallback.enabled,
  };
}

export const LS_MODEL_SETTINGS = 'mts.modelSettings.v1';
export const loadModelSettings = () => sanitizeModelSettings(loadJSON<unknown>(LS_MODEL_SETTINGS, null));

/** Block colours seen from above and from the side, for the enabled blocks. */
export function modelPalettes(s: ModelSettings): { top: PaletteColor[]; side: PaletteColor[] } {
  return {
    top: buildPalette({ enabled: s.enabled, smoothness: s.smoothness, orientation: 'floor' }),
    side: buildPalette({ enabled: s.enabled, smoothness: s.smoothness, orientation: 'wall' }),
  };
}

/** Atlas tile per block: `[2*i]` top, `[2*i + 1]` side. */
export const BLOCK_TILES = Int32Array.from(BLOCKS.flatMap((b) => [b.top.tile, b.side.tile]));
