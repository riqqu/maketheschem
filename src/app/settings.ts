// Everything that shapes one art: generation settings, block selection and export facing.
// Saved with each art in the history and as the "last used" defaults for new art.
import type { BackgroundMode } from '../core/background';
import { FACINGS, type Facing } from '../core/layout';
import { noisePenalty, type DitherKind, type PaletteColor } from '../core/quantize';
import type { ResizeMode } from '../core/resample';
import { faceOf, type Orientation } from '../core/types';
import { BLOCKS, blockIndexById, defaultEnabledIds } from '../data';
import { loadJSON } from '../lib/storage';
import { MAX_SIDE, maxHeightFor } from './size';

export type DitherMode = 'off' | DitherKind;

export interface ArtSettings {
  orientation: Orientation;
  width: number;
  height: number;
  lockAspect: boolean;
  resize: ResizeMode;
  dither: DitherMode;
  /** 0.1 - 1 */
  ditherStrength: number;
  bgOn: boolean;
  /** 1 - 50 */
  bgTolerance: number;
  bgMode: BackgroundMode;
  /** Prefer smooth textures, 0 - 100. */
  smoothness: number;
  maxTypesOn: boolean;
  maxTypes: number;
  /** Which way a wall faces when exported. */
  facing: Facing;
  /** Block ids the generator may use. */
  enabled: string[];
}

export const MAX_TYPES_MIN = 2;
export const MAX_TYPES_MAX = 64;

export const DEFAULT_SETTINGS: ArtSettings = {
  orientation: 'wall',
  width: 64,
  height: 64,
  lockAspect: true,
  resize: 'smooth',
  dither: 'off',
  ditherStrength: 0.8,
  bgOn: false,
  bgTolerance: 15,
  bgMode: 'edges',
  smoothness: 30,
  maxTypesOn: false,
  maxTypes: 12,
  facing: 'south',
  enabled: defaultEnabledIds(),
};

const pick = <T>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const num = (v: unknown, lo: number, hi: number, fallback: number, int = true) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  const c = Math.min(hi, Math.max(lo, v));
  return int ? Math.round(c) : c;
};
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/** Validates settings loaded from storage, filling gaps from `fallback`. Unknown block ids are dropped. */
export function sanitizeSettings(raw: unknown, fallback: ArtSettings = DEFAULT_SETTINGS): ArtSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const orientation = pick<Orientation>(r.orientation, ['wall', 'floor'], fallback.orientation);
  const enabled = Array.isArray(r.enabled)
    ? r.enabled.filter((id): id is string => typeof id === 'string' && blockIndexById.has(id))
    : fallback.enabled;
  return {
    orientation,
    width: num(r.width, 1, MAX_SIDE, fallback.width),
    height: num(r.height, 1, maxHeightFor(orientation), Math.min(fallback.height, maxHeightFor(orientation))),
    lockAspect: bool(r.lockAspect, fallback.lockAspect),
    resize: pick<ResizeMode>(r.resize, ['smooth', 'sharp'], fallback.resize),
    dither: pick<DitherMode>(r.dither, ['off', 'diffusion', 'ordered'], fallback.dither),
    ditherStrength: num(r.ditherStrength, 0.1, 1, fallback.ditherStrength, false),
    bgOn: bool(r.bgOn, fallback.bgOn),
    bgTolerance: num(r.bgTolerance, 1, 50, fallback.bgTolerance),
    bgMode: pick<BackgroundMode>(r.bgMode, ['edges', 'all'], fallback.bgMode),
    smoothness: num(r.smoothness, 0, 100, fallback.smoothness),
    maxTypesOn: bool(r.maxTypesOn, fallback.maxTypesOn),
    maxTypes: num(r.maxTypes, MAX_TYPES_MIN, MAX_TYPES_MAX, fallback.maxTypes),
    facing: pick<Facing>(r.facing, FACINGS, fallback.facing),
    enabled,
  };
}

const LS_SETTINGS = 'mts.settings.v2';
const LS_ENABLED_V1 = 'mts.enabled.v1';
const LS_ORIENTATION_V1 = 'mts.orientation';

/** Last used settings, migrating the block selection and orientation saved by older versions. */
export function loadLastSettings(): ArtSettings {
  const saved = loadJSON<unknown>(LS_SETTINGS, null);
  if (saved) return sanitizeSettings(saved);
  return sanitizeSettings({
    orientation: loadJSON<unknown>(LS_ORIENTATION_V1, DEFAULT_SETTINGS.orientation),
    enabled: loadJSON<unknown>(LS_ENABLED_V1, DEFAULT_SETTINGS.enabled),
  });
}
export const LAST_SETTINGS_KEY = LS_SETTINGS;

/** The blocks the generator may use, with the texture-noise penalty for this smoothness. */
export function buildPalette(s: Pick<ArtSettings, 'enabled' | 'smoothness' | 'orientation'>): PaletteColor[] {
  const enabled = new Set(s.enabled);
  const smooth = s.smoothness / 100;
  return BLOCKS.flatMap((b, i) => {
    if (!enabled.has(b.id)) return [];
    const face = faceOf(b, s.orientation);
    return [{ value: i, rgb: face.rgb, penalty: noisePenalty(face.noise, smooth) }];
  });
}

export interface GenerationKeys {
  /** Everything except background removal. */
  base: string;
  /** Background removal options. */
  bg: string;
}

/** Keys that change whenever regenerating would give a different grid. Facing is export-only and not included. */
export function generationKeys(imageKey: string, s: ArtSettings): GenerationKeys {
  const palette = s.enabled.map((id) => blockIndexById.get(id) ?? -1).filter((i) => i >= 0).sort((a, b) => a - b);
  const dither = s.dither === 'off' ? 'off' : `${s.dither}:${s.ditherStrength}`;
  return {
    base: JSON.stringify([imageKey, s.width, s.height, s.orientation, s.resize, dither, s.smoothness, s.maxTypesOn ? s.maxTypes : 0, palette]),
    bg: JSON.stringify(s.bgOn ? { tolerance: s.bgTolerance / 100, mode: s.bgMode } : null),
  };
}

/** Order-independent fingerprint of settings (used to skip saving unchanged art). */
export function settingsSignature(s: ArtSettings): string {
  return JSON.stringify(Object.keys(s).sort().map((k) => [k, s[k as keyof ArtSettings]]));
}
