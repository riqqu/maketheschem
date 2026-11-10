// "Use at most N block types": pick the subset of the palette that represents the image best.
import { rgbToOklab } from './oklab';
import type { PaletteColor } from './quantize';

/**
 * Greedy selection: repeatedly add the palette colour that lowers the total (pixel-weighted) matching error the most.
 * Pixels are grouped into a 4-bit-per-channel histogram (with each bin's mean colour) to keep it fast.
 * Returns the chosen colours in their original palette order.
 */
export function reducePalette(
  pixels: Uint8ClampedArray,
  palette: readonly PaletteColor[],
  maxColors: number,
  alphaThreshold = 128,
): PaletteColor[] {
  const n = Math.max(1, Math.floor(maxColors));
  if (palette.length <= n) return [...palette];

  // Histogram of opaque pixels.
  const count = new Uint32Array(4096);
  const sum = new Float64Array(4096 * 3);
  for (let o = 0; o < pixels.length; o += 4) {
    if (pixels[o + 3] < alphaThreshold) continue;
    const r = pixels[o], g = pixels[o + 1], b = pixels[o + 2];
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    count[k]++;
    sum[k * 3] += r;
    sum[k * 3 + 1] += g;
    sum[k * 3 + 2] += b;
  }
  const bins: number[] = [];
  for (let k = 0; k < 4096; k++) if (count[k]) bins.push(k);
  if (bins.length === 0) return palette.slice(0, n);

  const B = bins.length, P = palette.length;
  const weight = new Float64Array(B);
  const binLab = new Float64Array(B * 3);
  bins.forEach((k, i) => {
    const c = count[k];
    weight[i] = c;
    binLab.set(rgbToOklab(Math.round(sum[k * 3] / c), Math.round(sum[k * 3 + 1] / c), Math.round(sum[k * 3 + 2] / c)), i * 3);
  });

  // Distance (plus penalty) from every bin to every palette colour.
  const dist = new Float32Array(B * P);
  palette.forEach((p, j) => {
    const [L, A, Bb] = rgbToOklab(p.rgb[0], p.rgb[1], p.rgb[2]);
    const pen = p.penalty ?? 0;
    for (let i = 0; i < B; i++) {
      const dl = binLab[i * 3] - L, da = binLab[i * 3 + 1] - A, db = binLab[i * 3 + 2] - Bb;
      dist[i * P + j] = dl * dl + da * da + db * db + pen;
    }
  });

  // Current best distance per bin; larger than any real distance before the first pick.
  const best = new Float64Array(B).fill(16);
  const chosen = new Uint8Array(P);
  for (let step = 0; step < n; step++) {
    let pick = -1;
    let pickGain = -1;
    for (let j = 0; j < P; j++) {
      if (chosen[j]) continue;
      let gain = 0;
      for (let i = 0; i < B; i++) {
        const d = dist[i * P + j];
        if (d < best[i]) gain += weight[i] * (best[i] - d);
      }
      if (gain > pickGain) {
        pickGain = gain;
        pick = j;
      }
    }
    if (pick < 0 || pickGain <= 0) break; // nothing left improves the match
    chosen[pick] = 1;
    for (let i = 0; i < B; i++) best[i] = Math.min(best[i], dist[i * P + pick]);
  }
  return palette.filter((_, j) => chosen[j]);
}
