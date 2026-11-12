// How wide the two sidebars may be. Pure, so the limits are tested and the drag, the keyboard and saved values agree.

export type Side = 'left' | 'right';

export interface SidebarWidths {
  left: number;
  right: number;
}

export const SIDEBAR_DEFAULTS: SidebarWidths = { left: 280, right: 300 };

// The minimums are the narrowest that show every control whole, scrollbar included: the left one by the size presets and the
// background toggle, the right one by the four tabs (Blocks, Materials, Build, History). Check them again when a panel grows.
export const SIDEBAR_LIMITS: Record<Side, { min: number; max: number }> = {
  left: { min: 240, max: 480 },
  right: { min: 260, max: 520 },
};

/** A sidebar never takes more than this share of the window, so the canvas always keeps a usable middle. */
export const SIDEBAR_MAX_SHARE = 0.35;

/** The width a sidebar can have in a window `viewport` px wide: inside its limits, and never past the share. */
export function clampSidebar(side: Side, width: number, viewport: number): number {
  const { min, max } = SIDEBAR_LIMITS[side];
  const hi = Math.max(min, Math.min(max, Math.floor(viewport * SIDEBAR_MAX_SHARE)));
  return Math.round(Math.min(hi, Math.max(min, width)));
}

/** Saved widths, or the defaults for anything missing or not a number. Window size is applied later. */
export function sanitizeSidebarWidths(raw: unknown): SidebarWidths {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const pick = (side: Side) => {
    const v = r[side];
    if (typeof v !== 'number' || !Number.isFinite(v)) return SIDEBAR_DEFAULTS[side];
    return clampSidebar(side, v, Infinity);
  };
  return { left: pick('left'), right: pick('right') };
}
