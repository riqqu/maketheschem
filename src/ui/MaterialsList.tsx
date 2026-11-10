import { memo, useState } from 'react';
import { BLOCKS } from '../data';
import type { Orientation } from '../core/types';
import { BlockSwatch } from './BlockSwatch';
import { Icon } from './Icon';

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

  if (rows.length === 0) return <p className="muted pad">No blocks yet. Generate or draw something first.</p>;

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
    <div className="materials">
      <div className="materials-head">
        <p className="small">
          <strong>{fmt.format(total)}</strong> blocks · {rows.length} types
          {total >= 1728 && <span className="muted"> · ≈{(total / 1728).toFixed(1)} shulker boxes</span>}
        </p>
        <button type="button" className="btn small" onClick={copy}>
          <Icon name="copy" size={15} /> {copied ? 'Copied' : 'Copy list'}
        </button>
      </div>
      <ul className="materials-list">
        {rows.map(([v, n]) => (
          <li key={v}>
            <BlockSwatch block={BLOCKS[v]} orientation={orientation} size={22} />
            <span className="mat-name">{BLOCKS[v].name}</span>
            <span className="mat-count num">{fmt.format(n)}</span>
            <span className="mat-stacks muted small num">{stacksText(n)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
});
