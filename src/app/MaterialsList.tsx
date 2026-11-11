import { memo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

/** Shopping list for building the art in survival. */
export const MaterialsList = memo(function MaterialsList({
  counts,
  orientation,
}: {
  counts: Map<number, number>;
  orientation: Orientation;
}) {
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
          <li key={v} className="grid grid-cols-[20px_minmax(0,1fr)_auto_64px] items-center gap-3 px-4 py-1.5 hover:bg-muted/60">
            <BlockSwatch block={BLOCKS[v]} orientation={orientation} size={20} />
            <span className="truncate">{BLOCKS[v].name}</span>
            <span className="text-right font-medium tabular-nums">{fmt.format(n)}</span>
            <span className="text-right text-xs tabular-nums text-muted-foreground">{stacksText(n)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
});
