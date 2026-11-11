import { describe, expect, it } from 'vitest';
import { similarBlocks } from './similar';
import { AIR, type RGB } from './types';

const colors: RGB[] = [
  [255, 255, 255], // 0 white
  [247, 247, 247], // 1 almost white
  [160, 160, 160], // 2 grey
  [0, 0, 0], // 3 black
  [200, 40, 40], // 4 red
];

describe('similarBlocks', () => {
  it('is off at tolerance 0', () => {
    expect(similarBlocks(colors, 0)).toBeUndefined();
    expect(similarBlocks(colors, -5)).toBeUndefined();
  });

  it('matches close colours and widens with the tolerance', () => {
    const tight = similarBlocks(colors, 4)!;
    expect(tight(1, 0)).toBe(true);
    expect(tight(0, 1)).toBe(true);
    expect(tight(2, 0)).toBe(false);
    const loose = similarBlocks(colors, 45)!;
    expect(loose(2, 0)).toBe(true);
    expect(loose(3, 0)).toBe(false);
    expect(loose(4, 0)).toBe(false);
  });

  it('matches everything but air at 100', () => {
    const all = similarBlocks(colors, 100)!;
    for (let i = 0; i < colors.length; i++) expect(all(i, 0)).toBe(true);
  });

  it('never mixes air with blocks', () => {
    const all = similarBlocks(colors, 100)!;
    expect(all(AIR, 0)).toBe(false);
    expect(all(0, AIR)).toBe(false);
  });

  it('ignores blocks it has no colour for', () => {
    expect(similarBlocks(colors, 100)!(99, 0)).toBe(false);
  });
});
