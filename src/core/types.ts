export type RGB = readonly [number, number, number];

export interface FaceInfo {
  rgb: RGB;
  /** Index of the 16x16 tile in public/atlas.png. */
  tile: number;
  texture: string;
  /** RMS OKLab distance of the texels from their mean: ~0.003 for concrete, 0.1+ for ores and patterns. */
  noise?: number;
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
  /** Version of the extraction output (see scripts/extract-blocks.mjs). */
  format?: number;
  minecraftVersion: string;
  dataVersion: number;
  /** Data pack format [major, minor] of this Minecraft version (from format 3 of the extraction on). */
  dataPackFormat?: readonly [number, number] | null;
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
