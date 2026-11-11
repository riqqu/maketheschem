// "Tolerance" for fill and replace: which other blocks count as the one that was clicked.
import type { Similar } from './grid';
import { rgbToOklab } from './oklab';
import { AIR, type RGB } from './types';

/** OKLab distance that tolerance 100 stands for (black to white is 1). */
const FULL = 1;

/**
 * Blocks whose colour is within `tolerance` (0-100) of the clicked block's colour, measured in OKLab. Air only ever
 * matches air, so a fill never leaks into empty space or the other way round. Returns undefined at 0: only the same
 * block matches. `colors` is indexed by block value.
 */
export function similarBlocks(colors: readonly RGB[], tolerance: number): Similar | undefined {
  if (!(tolerance > 0)) return undefined;
  const lab = colors.map(([r, g, b]) => rgbToOklab(r, g, b));
  const limit = (Math.min(100, tolerance) / 100) * FULL;
  return (cell, seed) => {
    if (cell === AIR || seed === AIR) return false;
    const a = lab[cell], b = lab[seed];
    if (!a || !b) return false;
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= limit;
  };
}
