// What each editor tool can be set to, shown in the options bar above the canvas and kept between sessions.
import { MAX_BRUSH, stepBrushSize, type BrushShape } from '../core/brush';
import type { GradientDither } from '../core/gradient';
import { MAX_TEXT_LENGTH, MAX_TEXT_SCALE } from '../core/pixelFont';
import { BLOCKS, blockIndexById } from '../data';
import type { Tool } from './Editor';
import { bool, num, pick } from './settings';

export interface PenOptions {
  size: number;
  shape: BrushShape;
}

export interface ToolOptions {
  brush: PenOptions;
  eraser: PenOptions;
  line: PenOptions;
  rect: {
    filled: boolean;
    /** Outline width in blocks. */
    thickness: number;
    /** Corner rounding step, 0 = square (see roundingRadius). */
    rounding: number;
    /** The drag starts in the middle block instead of a corner. */
    fromCenter: boolean;
  };
  ellipse: {
    filled: boolean;
    /** Outline width in blocks. */
    thickness: number;
    /** The drag starts in the middle block instead of a corner. */
    fromCenter: boolean;
  };
  fill: {
    /** 0-100: blocks this close in colour to the clicked one fill too. */
    tolerance: number;
    diagonal: boolean;
  };
  gradient: {
    /** Id of the block the gradient ends with; it starts with the current block. */
    to: string;
    dither: GradientDither;
  };
  replace: { tolerance: number };
  text: {
    value: string;
    /** Blocks per pixel of the font. */
    scale: number;
  };
  picker: { backToBrush: boolean };
  select: {
    /** Air in a moved or pasted part leaves the blocks below alone. */
    airTransparent: boolean;
  };
  /** Mirror painting, for the tools in MIRROR_TOOLS: across a vertical line (x) and / or a horizontal one (y). */
  mirror: { x: boolean; y: boolean };
}

export const MAX_ROUNDING = 32;

/** The tools that paint whatever they draw in mirror too. */
export const MIRROR_TOOLS: readonly Tool[] = ['brush', 'eraser', 'line', 'rect', 'ellipse'];

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  brush: { size: 1, shape: 'square' },
  eraser: { size: 1, shape: 'square' },
  line: { size: 1, shape: 'square' },
  rect: { filled: false, thickness: 1, rounding: 0, fromCenter: false },
  ellipse: { filled: false, thickness: 1, fromCenter: false },
  fill: { tolerance: 0, diagonal: false },
  gradient: { to: blockIndexById.has('black_concrete') ? 'black_concrete' : BLOCKS[0].id, dither: 'ordered' },
  replace: { tolerance: 0 },
  text: { value: '', scale: 1 },
  picker: { backToBrush: true },
  select: { airTransparent: true },
  mirror: { x: false, y: false },
};

export const TOOL_OPTIONS_KEY = 'mts.tools.v1';

export type SetOption = <T extends keyof ToolOptions>(tool: T, patch: Partial<ToolOptions[T]>) => void;

const obj = (v: unknown) => (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;

/** Validates options loaded from storage, filling gaps from the defaults. */
export function sanitizeToolOptions(raw: unknown): ToolOptions {
  const r = obj(raw);
  const d = DEFAULT_TOOL_OPTIONS;
  const pen = (v: unknown, fb: PenOptions): PenOptions => {
    const o = obj(v);
    return { size: num(o.size, 1, MAX_BRUSH, fb.size), shape: pick<BrushShape>(o.shape, ['square', 'round'], fb.shape) };
  };
  const rect = obj(r.rect), ellipse = obj(r.ellipse), fill = obj(r.fill), gradient = obj(r.gradient), replace = obj(r.replace);
  const text = obj(r.text), picker = obj(r.picker), select = obj(r.select), mirror = obj(r.mirror);
  return {
    brush: pen(r.brush, d.brush),
    eraser: pen(r.eraser, d.eraser),
    line: pen(r.line, d.line),
    rect: {
      filled: bool(rect.filled, d.rect.filled),
      thickness: num(rect.thickness, 1, MAX_BRUSH, d.rect.thickness),
      rounding: num(rect.rounding, 0, MAX_ROUNDING, d.rect.rounding),
      fromCenter: bool(rect.fromCenter, d.rect.fromCenter),
    },
    ellipse: {
      filled: bool(ellipse.filled, d.ellipse.filled),
      thickness: num(ellipse.thickness, 1, MAX_BRUSH, d.ellipse.thickness),
      fromCenter: bool(ellipse.fromCenter, d.ellipse.fromCenter),
    },
    fill: { tolerance: num(fill.tolerance, 0, 100, d.fill.tolerance), diagonal: bool(fill.diagonal, d.fill.diagonal) },
    gradient: {
      to: typeof gradient.to === 'string' && blockIndexById.has(gradient.to) ? gradient.to : d.gradient.to,
      dither: pick<GradientDither>(gradient.dither, ['off', 'diffusion', 'ordered'], d.gradient.dither),
    },
    replace: { tolerance: num(replace.tolerance, 0, 100, d.replace.tolerance) },
    text: {
      value: typeof text.value === 'string' ? text.value.slice(0, MAX_TEXT_LENGTH) : d.text.value,
      scale: num(text.scale, 1, MAX_TEXT_SCALE, d.text.scale),
    },
    picker: { backToBrush: bool(picker.backToBrush, d.picker.backToBrush) },
    select: { airTransparent: bool(select.airTransparent, d.select.airTransparent) },
    mirror: { x: bool(mirror.x, d.mirror.x), y: bool(mirror.y, d.mirror.y) },
  };
}

/** The `[` and `]` keys: one step on the tool's main size (brush size, line width, outline thickness, text scale). */
export function stepToolSize(tool: Tool, o: ToolOptions, set: SetOption, dir: 1 | -1): void {
  if (tool === 'brush' || tool === 'eraser' || tool === 'line') set(tool, { size: stepBrushSize(o[tool].size, dir) });
  else if (tool === 'rect') set('rect', { thickness: stepBrushSize(o.rect.thickness, dir) });
  else if (tool === 'ellipse') set('ellipse', { thickness: stepBrushSize(o.ellipse.thickness, dir) });
  else if (tool === 'text') set('text', { scale: Math.min(MAX_TEXT_SCALE, stepBrushSize(o.text.scale, dir)) });
}
