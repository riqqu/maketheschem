import { memo, useEffect, useState, type ReactElement } from 'react';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { confirm } from '@/components/confirm';
import { IconButton } from '@/components/icon-button';
import type { ArtMeta } from '../lib/db';

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function ago(ms: number, now: number): string {
  const s = Math.round((ms - now) / 1000);
  if (s > -45) return 'just now';
  const m = Math.round(s / 60);
  if (m > -60) return rtf.format(m, 'minute');
  const h = Math.round(m / 60);
  if (h > -24) return rtf.format(h, 'hour');
  const d = Math.round(h / 24);
  if (d > -30) return rtf.format(d, 'day');
  return new Date(ms).toLocaleDateString();
}

function Thumb({ blob, smooth }: { blob: Blob | null; smooth: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return setUrl(null);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return (
    <span className="checkerboard grid size-12 shrink-0 place-items-center overflow-hidden rounded-md border">
      {url && <img src={url} alt="" className="max-h-full max-w-full" style={{ imageRendering: smooth ? 'auto' : 'pixelated' }} />}
    </span>
  );
}

export interface HistoryItem {
  id: string;
  name: string;
  updatedAt: number;
  thumb: Blob | null;
}

interface Props<T extends HistoryItem> {
  list: T[];
  currentId: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  /** Size line under the name. Keep it a stable function so the list isn't re-rendered needlessly. */
  describe?: (item: T) => string;
  /** Thumbnails are renders rather than one pixel per block, so scale them smoothly. */
  smoothThumbs?: boolean;
}

export const describeArt = (m: ArtMeta) => `${m.width} × ${m.height} ${m.orientation} · ${m.blockCount.toLocaleString()} blocks`;

/** Every art (or model) made in this browser, newest first. Each one keeps saving while it is open. */
export const HistoryPanel = memo(function HistoryPanel<T extends HistoryItem>({
  list, currentId, onOpen, onDelete, describe = describeArt as unknown as (item: T) => string, smoothThumbs = false,
}: Props<T>) {
  // Re-render once a minute so "5 minutes ago" stays right.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => setNow(Date.now()), [list]);

  if (list.length === 0) return <p className="p-4 text-muted-foreground">Your builds appear here.</p>;

  const remove = async (m: T) => {
    if (await confirm({ title: `Delete “${m.name}”?`, description: 'This can’t be undone.', action: 'Delete', destructive: true })) onDelete(m.id);
  };

  return (
    <ul className="grid gap-0.5 p-2">
      {list.map((m) => {
        const current = m.id === currentId;
        return (
          <li key={m.id} className={cn('group flex items-center rounded-lg pr-1 hover:bg-muted/60', current && 'bg-muted')}>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-3 p-2 text-left"
              onClick={() => onOpen(m.id)}
              aria-current={current ? 'true' : undefined}
            >
              <Thumb blob={m.thumb} smooth={smoothThumbs} />
              <span className="grid min-w-0 leading-snug">
                <span className="truncate font-medium">{m.name}</span>
                <span className="truncate text-xs tabular-nums text-muted-foreground">{describe(m)}</span>
                <span className="text-xs text-muted-foreground">{current ? 'Open' : ago(m.updatedAt, now)}</span>
              </span>
            </button>
            <IconButton
              icon={Trash2}
              label="Delete"
              size="icon-sm"
              className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
              onClick={() => void remove(m)}
            />
          </li>
        );
      })}
    </ul>
  );
}) as <T extends HistoryItem>(props: Props<T>) => ReactElement;
