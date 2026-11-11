import { describe, expect, it } from 'vitest';
import { MAX_TEXT_LENGTH, MAX_TEXT_SCALE, renderText, textCells, type TextBitmap } from './pixelFont';

const rows = (b: TextBitmap) =>
  Array.from({ length: b.height }, (_, y) => Array.from({ length: b.width }, (_, x) => (b.ink[y * b.width + x] ? '#' : '.')).join(''));
const inkCount = (b: TextBitmap) => b.ink.reduce((n, v) => n + v, 0);

describe('renderText', () => {
  it('draws a letter from the font', () => {
    expect(rows(renderText('A')!)).toEqual(['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#']);
  });

  it('has a drawn letter for every printable ASCII character', () => {
    for (let c = 33; c < 127; c++) {
      const ch = String.fromCharCode(c);
      const b = renderText(ch);
      expect(b, ch).not.toBeNull();
      // The missing-character box is the only drawing that fills a whole 5 x 7 outline.
      expect(rows(b!).join(), ch).not.toBe(rows(renderText('€')!).join());
    }
  });

  it('keeps every glyph rectangular, in the font and within its rows', () => {
    for (let c = 33; c < 127; c++) {
      const b = renderText(String.fromCharCode(c))!;
      expect(b.ink.length).toBe(b.width * b.height);
      expect(b.height).toBeLessThanOrEqual(9);
      expect(b.width).toBeLessThanOrEqual(5);
    }
  });

  it('trims to the ink, so lowercase letters without ascenders are only as tall as they are', () => {
    expect(renderText('a')!.height).toBe(5);
    expect(renderText('x')!.height).toBe(5);
    expect(renderText('A')!.height).toBe(7);
    expect(renderText('g')!.height).toBe(7); // descender
    expect(renderText('bg')!.height).toBe(9); // ascender to descender
    expect(renderText('.')!.height).toBe(1);
  });

  it('spaces letters one block apart and keeps a space two blocks wide', () => {
    expect(renderText('AA')!.width).toBe(11);
    expect(renderText('A A')!.width).toBe(14);
    expect(renderText('i')!.width).toBe(1);
  });

  it('scales every pixel to a square of blocks', () => {
    const one = renderText('I')!;
    const two = renderText('I', 2)!;
    expect([two.width, two.height]).toEqual([one.width * 2, one.height * 2]);
    expect(inkCount(two)).toBe(inkCount(one) * 4);
    expect(rows(two)[0]).toBe('######');
    expect(rows(two)[2]).toBe('..##..');
  });

  it('keeps the scale within its limits', () => {
    expect(renderText('A', 0)!.width).toBe(5);
    expect(renderText('A', NaN)!.width).toBe(5);
    expect(renderText('A', 100)!.width).toBe(5 * MAX_TEXT_SCALE);
  });

  it('has nothing to draw for empty or blank text', () => {
    expect(renderText('')).toBeNull();
    expect(renderText('   ')).toBeNull();
    expect(renderText('\n\t')).toBeNull();
  });

  it('ignores what comes after the length limit', () => {
    expect(renderText('i'.repeat(MAX_TEXT_LENGTH + 40))).toEqual(renderText('i'.repeat(MAX_TEXT_LENGTH)));
  });

  it('puts an accent two rows above its letter', () => {
    const plain = renderText('A')!;
    const accented = renderText('Á')!;
    expect(accented.height).toBe(plain.height + 2);
    expect(accented.width).toBe(plain.width);
    expect(rows(accented).slice(2)).toEqual(rows(plain));
    expect(inkCount(accented)).toBe(inkCount(plain) + 2);
    expect(renderText('á')!.height).toBe(renderText('a')!.height + 2);
  });

  it('treats a letter and its separate accent mark alike, for the Hungarian letters too', () => {
    for (const [composed, parts] of [['é', 'é'], ['ö', 'ö'], ['ő', 'ő'], ['ű', 'ű'], ['Ü', 'Ü'], ['č', 'č']]) {
      expect(renderText(composed), composed).toEqual(renderText(parts));
      expect(renderText(composed)!.height, composed).toBeGreaterThan(renderText(parts[0])!.height);
    }
  });

  it('replaces the dot of an i with the accent', () => {
    const b = renderText('í')!;
    expect(b.height).toBe(7);
    expect(b.width).toBe(3);
    expect(rows(b)).toEqual(['..#', '.#.', '.#.', '.#.', '.#.', '.#.', '.#.']);
  });

  it('spells letters that do not split into a base and a mark with the nearest plain ones', () => {
    expect(renderText('ß')).toEqual(renderText('ss'));
    expect(renderText('ø')).toEqual(renderText('o'));
    expect(renderText('Æ')).toEqual(renderText('AE'));
  });

  it('shows a box for a character the font lacks', () => {
    expect(rows(renderText('€')!)).toEqual(['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#####']);
    expect(renderText('漢')).toEqual(renderText('€'));
  });

  it('skips control characters and a stray accent mark', () => {
    expect(renderText('A\u0007B')).toEqual(renderText('AB'));
    expect(renderText('́A')).toEqual(renderText('A'));
  });
});

describe('textCells', () => {
  const bar = renderText('I')!; // 3 x 7, 11 blocks: a bar on top and bottom with a stem between

  it('lists the grid cells the text covers', () => {
    const cells = textCells(bar, 10, 10, 2, 1);
    expect(cells).toHaveLength(11);
    expect(cells).toContain(1 * 10 + 2); // top-left of the top bar
    expect(cells).toContain(1 * 10 + 4);
    expect(cells).toContain(4 * 10 + 3); // the stem
    expect(cells).not.toContain(4 * 10 + 2);
  });

  it('drops what falls outside the grid', () => {
    // Only the first two columns of the 3-wide letter fit: 2 blocks of each bar and the 5 of the stem (its middle column).
    expect(textCells(bar, 10, 10, 8, 1)).toHaveLength(2 + 5 + 2);
  });

  it('clips at every edge', () => {
    expect(textCells(bar, 10, 10, -1, 0).every((i) => i % 10 <= 1)).toBe(true);
    expect(textCells(bar, 10, 3, 0, 0).every((i) => i < 30)).toBe(true);
    expect(textCells(bar, 10, 10, 20, 0)).toEqual([]);
    expect(textCells(bar, 10, 10, 0, -20)).toEqual([]);
  });
});
