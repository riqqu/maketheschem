import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { BLOCKS } from '../data';
import type { Orientation } from '../core/types';
import { BlockSwatch } from './BlockSwatch';

const fmt = new Intl.NumberFormat();

export function stacksText(n: number): string {
  const stacks = Math.floor(n / 64);
  const rest = n % 64;
  if (stacks === 0) return `${rest}`;
  return rest ? `${stacks} st + ${rest}` : `${stacks} st`;
}

const cells = 'grid min-w-0 flex-1 grid-cols-[20px_minmax(0,1fr)_auto_64px] items-center gap-3 py-1.5 pl-4';

/** One line of a block list: swatch, name, count and stacks. A button that highlights the block when `onPress` is given. */
export function BlockCountRow({ value, count, orientation, pressed, onPress, action }: {
  value: number;
  count: number;
  orientation: Orientation;
  pressed?: boolean;
  onPress?: () => void;
  /** Sits at the end of the line, e.g. an icon button. */
  action?: ReactNode;
}) {
  const content = (
    <>
      <BlockSwatch block={BLOCKS[value]} orientation={orientation} size={20} />
      <span className="truncate">{BLOCKS[value].name}</span>
      <span className="text-right font-medium tabular-nums">{fmt.format(count)}</span>
      <span className="text-right text-xs tabular-nums text-muted-foreground">{stacksText(count)}</span>
    </>
  );
  return (
    <li className={cn('group flex items-center hover:bg-muted/60', pressed && 'bg-accent hover:bg-accent')}>
      {onPress ? (
        <button
          type="button"
          className={cn(cells, 'text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset', !action && 'pr-4')}
          aria-pressed={pressed}
          onClick={onPress}
        >
          {content}
        </button>
      ) : (
        <div className={cn(cells, !action && 'pr-4')}>{content}</div>
      )}
      {action}
    </li>
  );
}
