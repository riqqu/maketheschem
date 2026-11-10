import { describe, expect, it } from 'vitest';
import { backgroundCells, detectBackground, removeBackground } from './background';
import type { RGBAImage } from './resample';

const WHITE = [255, 255, 255, 255];
const ORANGE = [245, 120, 20, 255];
const LIGHT_GREY = [225, 225, 225, 255];

/** Builds an image from a character map: each char maps to an RGBA colour. */
function image(rows: string[], colours: Record<string, number[]>): RGBAImage {
  const height = rows.length, width = rows[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) => [...row].forEach((ch, x) => data.set(colours[ch], (y * width + x) * 4)));
  return { width, height, data };
}

/** Back to a character map: '.' for transparent, otherwise the original char. */
const transparency = (img: RGBAImage, rows: string[]) =>
  rows.map((row, y) => [...row].map((ch, x) => (img.data[(y * img.width + x) * 4 + 3] === 0 ? '.' : ch)).join(''));

// A logo: orange disc on white, with white "letters" (W) enclosed by orange, and an anti-aliased grey edge (g).
const LOGO = [
  'wwwwwwww',
  'wggoooww',
  'wgoWWowg',
  'wwoWWoww',
  'wwoooowg',
  'wwwwwwww',
];
const COLOURS = { w: WHITE, W: WHITE, o: ORANGE, g: LIGHT_GREY };

describe('detectBackground', () => {
  it('finds the dominant border colour', () => {
    expect(detectBackground(image(LOGO, COLOURS))).toEqual([253, 253, 253]); // white + a few greys
  });

  it('returns null when the border is already transparent', () => {
    const img = image(['tttt', 'toot', 'tttt'], { t: [0, 0, 0, 0], o: ORANGE });
    expect(detectBackground(img)).toBeNull();
  });

  it('returns null when no colour dominates the border', () => {
    const rainbow = [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 0, 255], [0, 0, 0, 255], [255, 0, 255, 255]];
    const img = image(['abcdef', 'f....a', 'edcbaf'], { a: rainbow[0], b: rainbow[1], c: rainbow[2], d: rainbow[3], e: rainbow[4], f: rainbow[5], '.': WHITE });
    expect(detectBackground(img)).toBeNull();
  });
});

describe('removeBackground', () => {
  it('outside-only mode keeps enclosed background-coloured areas', () => {
    const res = removeBackground(image(LOGO, COLOURS), { tolerance: 0.15, mode: 'edges' });
    expect(transparency(res.image, LOGO)).toEqual([
      '........',
      '...ooo..',
      '..oWWo..',
      '..oWWo..',
      '..oooo..',
      '........',
    ]);
    expect(res.removed).toBeCloseTo(33 / 48);
  });

  it('everywhere mode also removes enclosed areas', () => {
    const res = removeBackground(image(LOGO, COLOURS), { tolerance: 0.15, mode: 'all' });
    expect(transparency(res.image, LOGO)[2]).toBe('..o..o..');
  });

  it('a low tolerance keeps the anti-aliased grey edge', () => {
    const res = removeBackground(image(LOGO, COLOURS), { tolerance: 0.02, mode: 'edges' });
    expect(transparency(res.image, LOGO)[1]).toBe('.ggooo..');
  });

  it('never touches the subject colour and leaves the input untouched', () => {
    const src = image(LOGO, COLOURS);
    const before = src.data.slice();
    const res = removeBackground(src, { tolerance: 0.3, mode: 'all' });
    expect(transparency(res.image, LOGO).join('')).toContain('oooo');
    expect(src.data).toEqual(before);
  });

  it('backgroundCells marks only the cells the removal turns into air', () => {
    const src = image(LOGO, COLOURS);
    const { image: cleaned } = removeBackground(src, { tolerance: 0.15, mode: 'edges' });
    const mask = backgroundCells(src, cleaned, 8, 6, 'sharp');
    const rows = Array.from({ length: 6 }, (_, y) => [...mask.subarray(y * 8, y * 8 + 8)].map((v) => (v ? '.' : '#')).join(''));
    expect(rows).toEqual(['........', '...###..', '..####..', '..####..', '..####..', '........']);
    // Already-transparent pixels are not "removed by" the background step.
    const transparent = image(['t'], { t: [0, 0, 0, 0] });
    expect([...backgroundCells(transparent, transparent, 1, 1, 'sharp')]).toEqual([0]);
  });

  it('is a no-op without a clear background', () => {
    const img = image(['tttt', 'toot', 'tttt'], { t: [0, 0, 0, 0], o: ORANGE });
    const res = removeBackground(img, { tolerance: 0.15, mode: 'edges' });
    expect(res).toEqual({ image: img, color: null, removed: 0 });
  });
});
