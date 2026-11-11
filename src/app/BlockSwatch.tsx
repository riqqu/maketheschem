import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { ATLAS_URL, blockData } from '../data';
import { faceOf, type BlockInfo, type Orientation } from '../core/types';

/** A block's face texture cut out of the atlas with CSS (no canvas needed). Null is air. */
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
  const base = 'inline-block shrink-0 rounded-[2px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]';
  if (!block) return <span className={cn(base, 'checkerboard', className)} style={{ width: size, height: size }} />;
  const { tile } = faceOf(block, orientation);
  const cols = blockData.atlasColumns;
  const style: CSSProperties = {
    width: size,
    height: size,
    imageRendering: 'pixelated',
    backgroundImage: `url(${ATLAS_URL})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${cols * size}px auto`,
    backgroundPosition: `-${(tile % cols) * size}px -${Math.floor(tile / cols) * size}px`,
  };
  return <span className={cn(base, className)} style={style} />;
}
