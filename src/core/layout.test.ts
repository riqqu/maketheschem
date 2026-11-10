import { describe, expect, it } from 'vitest';
import { FACINGS, layout, quarterTurns, rotateState, stateId } from './layout';

describe('layout', () => {
  it('lays floors in the X-Z plane regardless of facing', () => {
    const l = layout(3, 2, 'floor', 'east');
    expect([l.width, l.height, l.length]).toEqual([3, 1, 2]);
    expect(l.blockPos(2, 1)).toEqual({ x: 2, y: 0, z: 1 });
  });

  it.each([
    ['south', [3, 2, 1], { x: 0, y: 1, z: 0 }, { x: 2, y: 0, z: 0 }],
    ['north', [3, 2, 1], { x: 2, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }],
    ['west', [1, 2, 3], { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 2 }],
    ['east', [1, 2, 3], { x: 0, y: 1, z: 2 }, { x: 0, y: 0, z: 0 }],
  ] as const)('stands a %s-facing wall upright', (facing, dims, topLeft, bottomRight) => {
    const l = layout(3, 2, 'wall', facing);
    expect([l.width, l.height, l.length]).toEqual(dims);
    expect(l.blockPos(0, 0)).toEqual(topLeft);
    expect(l.blockPos(2, 1)).toEqual(bottomRight);
  });

  it('cellAt is the inverse of blockPos for every orientation and facing', () => {
    for (const orientation of ['floor', 'wall'] as const) {
      for (const facing of FACINGS) {
        const l = layout(4, 3, orientation, facing);
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 4; col++) {
            const p = l.blockPos(col, row);
            expect(l.cellAt(p.x, p.y, p.z)).toBe(row * 4 + col);
          }
        }
      }
    }
  });
});

describe('rotateState', () => {
  it('counts clockwise quarter turns from south', () => {
    expect(FACINGS.map(quarterTurns)).toEqual([0, 1, 2, 3]);
  });

  it('turns facing with the wall', () => {
    const s = 'minecraft:white_glazed_terracotta[facing=south]';
    expect(rotateState(s, 'south')).toBe(s);
    expect(rotateState(s, 'west')).toBe('minecraft:white_glazed_terracotta[facing=west]');
    expect(rotateState(s, 'north')).toBe('minecraft:white_glazed_terracotta[facing=north]');
    expect(rotateState(s, 'east')).toBe('minecraft:white_glazed_terracotta[facing=east]');
  });

  it('swaps horizontal axes on quarter turns only', () => {
    expect(rotateState('minecraft:oak_log[axis=x]', 'east')).toBe('minecraft:oak_log[axis=z]');
    expect(rotateState('minecraft:oak_log[axis=x]', 'north')).toBe('minecraft:oak_log[axis=x]');
    expect(rotateState('minecraft:oak_log[axis=y]', 'west')).toBe('minecraft:oak_log[axis=y]');
  });

  it('leaves other states alone', () => {
    expect(rotateState('minecraft:stone', 'east')).toBe('minecraft:stone');
    expect(rotateState('minecraft:x[facing=up,snowy=false]', 'east')).toBe('minecraft:x[facing=up,snowy=false]');
  });
});

describe('stateId', () => {
  it('strips the namespace and properties', () => {
    expect(stateId('minecraft:oak_log[axis=y]')).toBe('oak_log');
    expect(stateId('minecraft:stone')).toBe('stone');
    expect(stateId('mod:thing[a=b]')).toBe('mod:thing');
  });
});
