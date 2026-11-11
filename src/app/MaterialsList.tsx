import { memo, useState } from 'react';
import { Ban, Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/icon-button';
import { Button } from '@/components/ui/button';
import { BLOCKS } from '../data';
import type { Orientation } from '../core/types';
import { BlockCountRow, stacksText } from './BlockCountRow';

const fmt = new Intl.NumberFormat();

interface Props {
  counts: Map<number, number>;
  orientation: Orientation;
  /** Clicking a row highlights that block on the canvas. Without this the list is read-only. */
  highlight?: number | null;
  onHighlight?: (value: number) => void;
  /** Re-matches the block's cells to the nearest allowed block. */
  onAvoid?: (value: number) => void;
  /** False when there is no other allowed block to take its place. */
  canAvoid?: (value: number) => boolean;
}

/** Shopping list for building the art in survival. */
export const MaterialsList = memo(function MaterialsList({ counts, orientation, highlight, onHighlight, onAvoid, canAvoid }: Props) {
  const [copied, setCopied] = useState(false);
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, [, n]) => s + n, 0);

  if (rows.length === 0) return <p className="p-4 text-muted-foreground">No blocks yet.</p>;

  const copy = async () => {
    const text = rows.map(([v, n]) => `${BLOCKS[v].name}: ${n} (${stacksText(n)})`).join('\n');
    try {
      await navigator.clipboard.writeText(`${text}\nTotal: ${total}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked - nothing to do
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <p className="tabular-nums">
          <span className="font-medium">{fmt.format(total)}</span>
          <span className="text-muted-foreground"> blocks · {rows.length} types</span>
        </p>
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <ul className="pb-2">
        {rows.map(([v, n]) => (
          <BlockCountRow
            key={v}
            value={v}
            count={n}
            orientation={orientation}
            pressed={onHighlight ? highlight === v : undefined}
            onPress={onHighlight && (() => onHighlight(v))}
            action={
              onAvoid && (
                <IconButton
                  icon={Ban}
                  label="Avoid this block"
                  hint="Swaps its blocks for the nearest allowed one"
                  size="icon-xs"
                  className={cn('mr-2 ml-1 shrink-0 focus-visible:opacity-100', highlight === v ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
                  disabled={canAvoid ? !canAvoid(v) : false}
                  onClick={() => onAvoid(v)}
                />
              )
            }
          />
        ))}
      </ul>
    </div>
  );
});
