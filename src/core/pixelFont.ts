// A 5x7 pixel font for the text tool. Letters are drawn here as '#' (block) and '.' (nothing); accented letters are a
// base letter plus an accent mark laid two rows above it. Pure and unit-tested.

/** Blank columns between letters, and the width of a space. */
const GAP = 1;
const SPACE = 2;

interface Glyph {
  /** Row of the font (0 = top of a capital) the first row of `rows` sits on. */
  top: number;
  rows: string[];
  width: number;
}

// Rows are separated by '/'. A leading "n|" moves the glyph down to row n (lowercase starts at row 2 and may reach
// row 8 below the baseline at row 6).
const SOURCE: Record<string, string> = {
  '0': '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
  '1': '..#../.##../..#../..#../..#../..#../.###.',
  '2': '.###./#...#/....#/...#./..#../.#.../#####',
  '3': '.###./#...#/....#/..##./....#/#...#/.###.',
  '4': '...#./..##./.#.#./#..#./#####/...#./...#.',
  '5': '#####/#..../####./....#/....#/#...#/.###.',
  '6': '..##./.#.../#..../####./#...#/#...#/.###.',
  '7': '#####/....#/...#./..#../.#.../.#.../.#...',
  '8': '.###./#...#/#...#/.###./#...#/#...#/.###.',
  '9': '.###./#...#/#...#/.####/....#/...#./.##..',
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
  B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.###./#...#/#..../#..../#..../#...#/.###.',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####',
  F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.###.',
  H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '###/.#./.#./.#./.#./.#./###',
  J: '..###/...#./...#./...#./...#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
  N: '#...#/##..#/##..#/#.#.#/#..##/#..##/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.',
  T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '#####/....#/...#./..#../.#.../#..../#####',
  a: '2|.###./....#/.####/#...#/.####',
  b: '#..../#..../#.##./##..#/#...#/#...#/####.',
  c: '2|.###./#...#/#..../#...#/.###.',
  d: '....#/....#/.##.#/#..##/#...#/#...#/.####',
  e: '2|.###./#...#/#####/#..../.###.',
  f: '..##/.#../###./.#../.#../.#../.#..',
  g: '2|.####/#...#/#...#/#...#/.####/....#/.###.',
  h: '#..../#..../#.##./##..#/#...#/#...#/#...#',
  i: '#/./#/#/#/#/#',
  j: '..#/.../..#/..#/..#/..#/..#/#.#/.#.',
  k: '#.../#.../#..#/#.#./##../#.#./#..#',
  l: '#/#/#/#/#/#/#',
  m: '2|##.#./#.#.#/#.#.#/#.#.#/#.#.#',
  n: '2|#.##./##..#/#...#/#...#/#...#',
  o: '2|.###./#...#/#...#/#...#/.###.',
  p: '2|####./#...#/#...#/#...#/####./#..../#....',
  q: '2|.####/#...#/#...#/#...#/.####/....#/....#',
  r: '2|#.##./##..#/#..../#..../#....',
  s: '2|.####/#..../.###./....#/####.',
  t: '1|.#../###./.#../.#../.#../..##',
  u: '2|#...#/#...#/#...#/#..##/.##.#',
  v: '2|#...#/#...#/#...#/.#.#./..#..',
  w: '2|#...#/#...#/#.#.#/#.#.#/.#.#.',
  x: '2|#...#/.#.#./..#../.#.#./#...#',
  y: '2|#...#/#...#/#...#/.####/....#/#...#/.###.',
  z: '2|#####/...#./..#../.#.../#####',
  '!': '#/#/#/#/#/./#',
  '"': '#.#/#.#',
  '#': '.#.#./.#.#./#####/.#.#./#####/.#.#./.#.#.',
  $: '..#../.####/#.#../.###./..#.#/####./..#..',
  '%': '##..#/##..#/...#./..#../.#.../#..##/#..##',
  '&': '.##../#..#./#.#../.#.../#.#.#/#..#./.##.#',
  "'": '#/#',
  '(': '..#/.#./#../#../#../.#./..#',
  ')': '#../.#./..#/..#/..#/.#./#..',
  '*': '1|..#../#.#.#/.###./#.#.#/..#..',
  '+': '1|..#../..#../#####/..#../..#..',
  ',': '5|.#/.#/#.',
  '-': '3|#####',
  '.': '6|#',
  '/': '....#/...#./...#./..#../.#.../.#.../#....',
  ':': '2|#/././#',
  ';': '2|.#/../../.#/.#/#.',
  '<': '...#./..#../.#.../#..../.#.../..#../...#.',
  '=': '2|#####/...../#####',
  '>': '#..../.#.../..#../...#./..#../.#.../#....',
  '?': '.###./#...#/....#/...#./..#../...../..#..',
  '@': '.###./#...#/#.###/#.#.#/#.###/#..../.####',
  '[': '###/#../#../#../#../#../###',
  '\\': '#..../.#.../.#.../..#../...#./...#./....#',
  ']': '###/..#/..#/..#/..#/..#/###',
  '^': '..#../.#.#./#...#',
  _: '7|#####',
  '`': '#./.#',
  '{': '..##/.#../.#../#.../.#../.#../..##',
  '|': '#/#/#/#/#/#/#/#/#',
  '}': '##../..#./..#./...#/..#./..#./##..',
  '~': '3|.##.#/#.##.',
  // Used for an i that carries an accent instead of its dot.
  ı: '2|#/#/#/#/#',
};

/** Shown for any character the font does not have. */
const MISSING = '#####/#...#/#...#/#...#/#...#/#...#/#####';

const parse = (src: string): Glyph => {
  const bar = src.indexOf('|');
  const rows = (bar < 0 ? src : src.slice(bar + 1)).split('/');
  return { top: bar < 0 ? 0 : Number(src.slice(0, bar)), rows, width: rows[0].length };
};

const GLYPHS = new Map(Object.entries(SOURCE).map(([ch, src]) => [ch, parse(src)]));
const MISSING_GLYPH = parse(MISSING);

/** Accent marks by combining character, two rows tall, laid over the letter (see renderText). */
const ACCENTS: Record<string, string[]> = {
  '́': ['..#', '.#.'], // acute  á
  '̀': ['#..', '.#.'], // grave  à
  '̂': ['.#.', '#.#'], // circumflex  â
  '̌': ['#.#', '.#.'], // caron  č
  '̈': ['#.#', '...'], // diaeresis  ä
  '̃': ['.#.#', '#.#.'], // tilde  ã
  '̋': ['..#.#', '.#.#.'], // double acute  ő
  '̊': ['##', '##'], // ring  å
};

/** Letters that do not split into a base letter and an accent, as the plain letters nearest to them. */
const FOLD: Record<string, string> = {
  ø: 'o', Ø: 'O', ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', ß: 'ss', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE',
};

export const MAX_TEXT_LENGTH = 120;
export const MAX_TEXT_SCALE = 16;

/** Text as blocks: `ink[y * width + x]` is 1 where a block goes. Trimmed to the letters, top row = the highest block. */
export interface TextBitmap {
  width: number;
  height: number;
  ink: Uint8Array;
}

const isMark = (ch: string) => /\p{M}/u.test(ch);

/** Where the letters of `text` put blocks at scale 1: columns from 0, rows relative to the top of a capital. */
function layout(text: string): { x: number; y: number }[] {
  const chars = [...text.replace(/[øØłŁđĐßæÆœŒ]/g, (c) => FOLD[c]).normalize('NFD')];
  const ink: { x: number; y: number }[] = [];
  let cursor = 0;
  for (let n = 0; n < chars.length; n++) {
    const ch = chars[n];
    const marks: string[] = [];
    while (n + 1 < chars.length && isMark(chars[n + 1])) marks.push(chars[++n]);
    if (isMark(ch) || ch < ' ' || ch === '\u007f') continue;
    if (ch === ' ') {
      cursor += SPACE + GAP;
      continue;
    }
    const accent = marks.map((m) => ACCENTS[m]).find(Boolean);
    const glyph = GLYPHS.get(accent && ch === 'i' ? 'ı' : ch) ?? MISSING_GLYPH;
    const aw = accent ? accent[0].length : 0;
    const cell = Math.max(glyph.width, aw);
    const gx = cursor + ((cell - glyph.width) >> 1);
    glyph.rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (row[c] === '#') ink.push({ x: gx + c, y: glyph.top + r });
    });
    if (accent) {
      const ax = cursor + ((cell - aw) >> 1);
      accent.forEach((row, r) => {
        for (let c = 0; c < row.length; c++) if (row[c] === '#') ink.push({ x: ax + c, y: glyph.top - 2 + r });
      });
    }
    cursor += cell + GAP;
  }
  return ink;
}

/** The text drawn with every font pixel `scale` blocks across, or null when there is nothing to draw. */
export function renderText(text: string, scale = 1): TextBitmap | null {
  const ink = layout(text.slice(0, MAX_TEXT_LENGTH));
  if (ink.length === 0) return null;
  const s = Math.min(MAX_TEXT_SCALE, Math.max(1, Math.round(Number.isFinite(scale) ? scale : 1)));
  let minY = Infinity, maxY = -Infinity, maxX = -Infinity;
  for (const p of ink) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    if (p.x > maxX) maxX = p.x;
  }
  const width = (maxX + 1) * s, height = (maxY - minY + 1) * s;
  const bitmap = new Uint8Array(width * height);
  for (const p of ink) {
    for (let dy = 0; dy < s; dy++) bitmap.fill(1, ((p.y - minY) * s + dy) * width + p.x * s, ((p.y - minY) * s + dy) * width + p.x * s + s);
  }
  return { width, height, ink: bitmap };
}

/** Grid cells (row-major indices) covered by the text with its top-left corner at (x, y), inside the grid. */
export function textCells(bitmap: TextBitmap, gridWidth: number, gridHeight: number, x: number, y: number): number[] {
  const out: number[] = [];
  for (let by = Math.max(0, -y); by < bitmap.height && y + by < gridHeight; by++) {
    for (let bx = Math.max(0, -x); bx < bitmap.width && x + bx < gridWidth; bx++) {
      if (bitmap.ink[by * bitmap.width + bx]) out.push((y + by) * gridWidth + x + bx);
    }
  }
  return out;
}
