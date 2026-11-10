export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** smooth = area average (best for photos), sharp = nearest neighbour (best for existing pixel art). */
export type ResizeMode = 'smooth' | 'sharp';

export function resample(src: RGBAImage, width: number, height: number, mode: ResizeMode): Uint8ClampedArray {
  return mode === 'sharp' ? nearest(src, width, height) : box(src, width, height);
}

function nearest(src: RGBAImage, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(src.height - 1, Math.floor(((y + 0.5) * src.height) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.width - 1, Math.floor(((x + 0.5) * src.width) / w));
      const si = (sy * src.width + sx) * 4;
      const di = (y * w + x) * 4;
      out[di] = src.data[si];
      out[di + 1] = src.data[si + 1];
      out[di + 2] = src.data[si + 2];
      out[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

interface Taps {
  start: Int32Array;
  count: Int32Array;
  weights: Float32Array[];
}

/** For each destination pixel: which source pixels it covers and by how much (weights sum to 1). */
function taps(srcLen: number, dstLen: number): Taps {
  const scale = srcLen / dstLen;
  const start = new Int32Array(dstLen);
  const count = new Int32Array(dstLen);
  const weights: Float32Array[] = [];
  for (let d = 0; d < dstLen; d++) {
    const a = d * scale;
    const b = Math.min(srcLen, (d + 1) * scale);
    const s0 = Math.floor(a);
    const s1 = Math.min(srcLen, Math.ceil(b));
    const w = new Float32Array(Math.max(1, s1 - s0));
    for (let s = s0; s < s1; s++) w[s - s0] = (Math.min(b, s + 1) - Math.max(a, s)) / scale;
    start[d] = s0;
    count[d] = w.length;
    weights.push(w);
  }
  return { start, count, weights };
}

/** Separable area-average filter on premultiplied alpha (no dark fringes around transparent areas). */
function box(src: RGBAImage, w: number, h: number): Uint8ClampedArray {
  const { width: sw, height: sh, data } = src;
  const tx = taps(sw, w);
  const ty = taps(sh, h);

  // Horizontal pass: sw x sh -> w x sh, premultiplied.
  const mid = new Float32Array(w * sh * 4);
  for (let y = 0; y < sh; y++) {
    const row = y * sw;
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      const s0 = tx.start[x], n = tx.count[x], wt = tx.weights[x];
      for (let k = 0; k < n; k++) {
        const i = (row + s0 + k) * 4;
        const al = data[i + 3] * wt[k];
        r += data[i] * al;
        g += data[i + 1] * al;
        b += data[i + 2] * al;
        a += al;
      }
      const o = (y * w + x) * 4;
      mid[o] = r; mid[o + 1] = g; mid[o + 2] = b; mid[o + 3] = a;
    }
  }

  // Vertical pass: w x sh -> w x h, then un-premultiply.
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const s0 = ty.start[y], n = ty.count[y], wt = ty.weights[y];
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < n; k++) {
        const i = ((s0 + k) * w + x) * 4;
        r += mid[i] * wt[k];
        g += mid[i + 1] * wt[k];
        b += mid[i + 2] * wt[k];
        a += mid[i + 3] * wt[k];
      }
      const o = (y * w + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = Math.round(a);
    }
  }
  return out;
}
