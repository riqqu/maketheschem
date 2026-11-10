import { describe, expect, it } from 'vitest';
import { createGrid, type Grid } from './grid';
import { FACINGS, layout } from './layout';
import { buildLitematicNbt } from './litematic';
import { buildSchem, voxelize } from './schem';
import { parseSchem } from './schemRead';
import { AIR, type BlockInfo, type Orientation } from './types';
import { countCells, createVolume, volumeFromGrid, volumeIndex } from './volume';

const block = (id: string, state = `minecraft:${id}`): BlockInfo => ({
  id, state, name: id, category: 'Test', gravity: false,
  top: { rgb: [0, 0, 0], tile: 0, texture: '' },
  side: { rgb: [0, 0, 0], tile: 0, texture: '' },
});
const BLOCKS = [block('white_concrete'), block('oak_log', 'minecraft:oak_log[axis=y]'), block('stone')];

function sampleGrid(): Grid {
  const g = createGrid(4, 3);
  g.cells.set([0, 1, AIR, 2, 2, 0, 1, AIR, AIR, AIR, 2, 1]);
  return g;
}

describe('volumeFromGrid', () => {
  it('places every cell where layout() says, for floors and every wall facing', () => {
    const grid = sampleGrid();
    const cases: [Orientation, (typeof FACINGS)[number]][] = [['floor', 'south'], ...FACINGS.map((f): [Orientation, (typeof FACINGS)[number]] => ['wall', f])];
    for (const [orientation, facing] of cases) {
      const v = volumeFromGrid(grid, orientation, facing);
      const l = layout(grid.width, grid.height, orientation, facing);
      expect([v.width, v.height, v.length]).toEqual([l.width, l.height, l.length]);
      for (let row = 0; row < grid.height; row++) {
        for (let col = 0; col < grid.width; col++) {
          const p = l.blockPos(col, row);
          expect(v.cells[volumeIndex(v, p.x, p.y, p.z)]).toBe(grid.cells[row * grid.width + col]);
        }
      }
    }
  });
});

describe('countCells', () => {
  it('counts blocks and skips air', () => {
    expect([...countCells(Uint16Array.from([0, 2, AIR, 2, 2])).entries()].sort()).toEqual([[0, 1], [2, 3]]);
  });
});

describe('exporting a volume', () => {
  // 3 wide, 2 high, 4 long, each block different by position so the order shows.
  const volume = createVolume(3, 2, 4);
  for (let y = 0; y < 2; y++) for (let z = 0; z < 4; z++) for (let x = 0; x < 3; x++) {
    volume.cells[volumeIndex(volume, x, y, z)] = (x + y + z) % 4 === 3 ? AIR : (x + 2 * y + z) % 3;
  }

  it('keeps the size and the x, z, y order in a .schem', async () => {
    const parsed = await parseSchem(await buildSchem({ volume, blocks: BLOCKS, dataVersion: 5023, name: 'model' }));
    expect([parsed.width, parsed.height, parsed.length]).toEqual([3, 2, 4]);
    expect(parsed.hint).toBeNull(); // 'model' is not a wall/floor hint
    for (let i = 0; i < volume.cells.length; i++) {
      const state = parsed.states[parsed.indices[i]];
      expect(state).toBe(volume.cells[i] === AIR ? 'minecraft:air' : BLOCKS[volume.cells[i]].state);
    }
  });

  it('does not rotate block states of a volume', () => {
    const v = createVolume(1, 1, 1, 1);
    expect(voxelize({ volume: v, blocks: BLOCKS }).states).toEqual(['minecraft:air', 'minecraft:oak_log[axis=y]']);
  });

  it('writes a .litematic of the same size', () => {
    expect(() => buildLitematicNbt({ volume, blocks: BLOCKS, dataVersion: 5023, name: 'model' })).not.toThrow();
  });
});
