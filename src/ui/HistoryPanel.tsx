import { memo, useEffect, useState } from 'react';
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

function Thumb({ blob }: { blob: Blob | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return setUrl(null);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return <span className="history-thumb">{url && <img src={url} alt="" />}</span>;
}

interface Props {
  list: ArtMeta[];
  currentId: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

/** Every art made in this browser, newest first. Each one keeps saving while it is open. */
export const HistoryPanel = memo(function HistoryPanel({ list, currentId, onOpen, onDelete }: Props) {
  // Re-render once a minute so "5 minutes ago" stays right.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => setNow(Date.now()), [list]);

  if (list.length === 0) {
    return (
      <p className="muted pad">
        Your art is saved here automatically as you work, one entry per image or canvas. Nothing is uploaded: it stays in
        this browser.
      </p>
    );
  }

  return (
    <div className="history">
      <p className="history-head muted small">
        Saved automatically in this browser · {list.length}/{HISTORY_LIMIT}
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
              <Thumb blob={m.thumb} />
              <span className="history-meta">
                <span className="history-name">{m.name}</span>
                <span className="muted small num">
                  {m.width} × {m.height} {m.orientation} · {m.blockCount.toLocaleString()} blocks
                </span>
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
});
