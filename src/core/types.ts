export type RGB = readonly [number, number, number];

export interface FaceInfo {
  rgb: RGB;
  /** Index of the 16x16 tile in public/atlas.png. */
  tile: number;
  texture: string;
}

export interface BlockInfo {
  id: string;
  /** Full block state written to the schematic, e.g. "minecraft:oak_log[axis=y]". */
  state: string;
  name: string;
  category: string;
  gravity: boolean;
  /** Face seen on a floor (looking down). */
  top: FaceInfo;
  /** Face seen on a wall (looking at its south side). */
  side: FaceInfo;
}

export interface BlockData {
  minecraftVersion: string;
  dataVersion: number;
  tileSize: number;
  atlasColumns: number;
  categories: string[];
  blocks: BlockInfo[];
}

/** floor = horizontal layer (seen from above), wall = vertical layer (seen from the south). */
export type Orientation = 'floor' | 'wall';

/** Grid cell value for "no block". Other values are indices into BlockData.blocks. */
export const AIR = 0xffff;

export const faceOf = (block: BlockInfo, orientation: Orientation): FaceInfo =>
  orientation === 'floor' ? block.top : block.side;
