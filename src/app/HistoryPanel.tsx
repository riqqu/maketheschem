import { memo, useEffect, useState, type ReactElement } from 'react';
import type { ArtMeta } from '../lib/db';
import { Icon } from './Icon';
import { HISTORY_LIMIT } from './useArtHistory';

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
  return <span className={smooth ? 'history-thumb smooth' : 'history-thumb'}>{url && <img src={url} alt="" />}</span>;
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
  /** Shown while the list is empty. */
  emptyText?: string;
  limit?: number;
  /** Thumbnails are renders rather than one pixel per block, so scale them smoothly. */
  smoothThumbs?: boolean;
}

export const describeArt = (m: ArtMeta) => `${m.width} × ${m.height} ${m.orientation} · ${m.blockCount.toLocaleString()} blocks`;
const ART_EMPTY =
  'Your art is saved here automatically as you work, one entry per image or canvas. Nothing is uploaded: it stays in this browser.';

/** Every art (or model) made in this browser, newest first. Each one keeps saving while it is open. */
export const HistoryPanel = memo(function HistoryPanel<T extends HistoryItem>({
  list, currentId, onOpen, onDelete, describe = describeArt as unknown as (item: T) => string, emptyText = ART_EMPTY, limit = HISTORY_LIMIT,
  smoothThumbs = false,
}: Props<T>) {
  // Re-render once a minute so "5 minutes ago" stays right.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => setNow(Date.now()), [list]);

  if (list.length === 0) {
    return <p className="muted pad">{emptyText}</p>;
  }

  return (
    <div className="history">
      <p className="history-head muted small">
        Saved automatically in this browser · {list.length}/{limit}
      </p>
      <ul className="history-list">
        {list.map((m) => (
          <li key={m.id} className={m.id === currentId ? 'is-current' : ''}>
            <button
              type="button"
              className="history-open"
              onClick={() => onOpen(m.id)}
              aria-current={m.id === currentId ? 'true' : undefined}
              title={m.id === currentId ? 'Open now' : `Open ${m.name}`}
            >
              <Thumb blob={m.thumb} smooth={smoothThumbs} />
              <span className="history-meta">
                <span className="history-name">{m.name}</span>
                <span className="muted small num">{describe(m)}</span>
                <span className="muted small">{m.id === currentId ? 'Open now' : ago(m.updatedAt, now)}</span>
              </span>
            </button>
            <button
              type="button"
              className="icon-btn tiny history-delete"
              onClick={() => {
                if (window.confirm(`Delete “${m.name}” from the history? This can’t be undone.`)) onDelete(m.id);
              }}
              aria-label={`Delete ${m.name}`}
              title="Delete"
            >
              <Icon name="trash" size={14} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}) as <T extends HistoryItem>(props: Props<T>) => ReactElement;
