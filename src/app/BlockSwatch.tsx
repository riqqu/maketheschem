import type { CSSProperties } from 'react';
import { ATLAS_URL, blockData } from '../data';
import { faceOf, type BlockInfo, type Orientation } from '../core/types';

/** A block's face texture cut out of the atlas with CSS (no canvas needed). */
export function BlockSwatch({
  block,
  orientation,
  size = 24,
  className,
}: {
  block: BlockInfo | null;
  orientation: Orientation;
  size?: number;
  className?: string;
}) {
  if (!block) return <span className={`swatch swatch-air ${className ?? ''}`} style={{ width: size, height: size }} />;
  const { tile } = faceOf(block, orientation);
  const cols = blockData.atlasColumns;
  const style: CSSProperties = {
    width: size,
    height: size,
    backgroundImage: `url(${ATLAS_URL})`,
    backgroundSize: `${cols * size}px auto`,
    backgroundPosition: `-${(tile % cols) * size}px -${Math.floor(tile / cols) * size}px`,
  };
  return <span className={`swatch ${className ?? ''}`} style={style} />;
}
