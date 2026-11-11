// What each editor tool can be set to, shown in the options bar above the canvas and kept between sessions.
import { MAX_BRUSH, stepBrushSize, type BrushShape } from '../core/brush';
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
  fill: {
    /** 0-100: blocks this close in colour to the clicked one fill too. */
    tolerance: number;
    diagonal: boolean;
  };
  replace: { tolerance: number };
  picker: { backToBrush: boolean };
  select: {
    /** Air in a moved or pasted part leaves the blocks below alone. */
    airTransparent: boolean;
  };
}

export const MAX_ROUNDING = 32;

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  brush: { size: 1, shape: 'square' },
  eraser: { size: 1, shape: 'square' },
  line: { size: 1, shape: 'square' },
  rect: { filled: false, thickness: 1, rounding: 0, fromCenter: false },
  fill: { tolerance: 0, diagonal: false },
  replace: { tolerance: 0 },
  picker: { backToBrush: true },
  select: { airTransparent: true },
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
  const rect = obj(r.rect), fill = obj(r.fill), replace = obj(r.replace), picker = obj(r.picker), select = obj(r.select);
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
    fill: { tolerance: num(fill.tolerance, 0, 100, d.fill.tolerance), diagonal: bool(fill.diagonal, d.fill.diagonal) },
    replace: { tolerance: num(replace.tolerance, 0, 100, d.replace.tolerance) },
    picker: { backToBrush: bool(picker.backToBrush, d.picker.backToBrush) },
    select: { airTransparent: bool(select.airTransparent, d.select.airTransparent) },
  };
}

/** The `[` and `]` keys: one step on the tool's main size (brush size, line width, outline thickness). */
export function stepToolSize(tool: Tool, o: ToolOptions, set: SetOption, dir: 1 | -1): void {
  if (tool === 'brush' || tool === 'eraser' || tool === 'line') set(tool, { size: stepBrushSize(o[tool].size, dir) });
  else if (tool === 'rect') set('rect', { thickness: stepBrushSize(o.rect.thickness, dir) });
}
