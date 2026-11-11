import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { BLOCKS, blockData, defaultEnabledIds } from '../data';
import type { Orientation } from '../core/types';
import { BlockSwatch } from './BlockSwatch';
import { Icon } from './Icon';

interface Props {
  enabled: ReadonlySet<string>;
  setEnabled: (next: Set<string>) => void;
  orientation: Orientation;
}

const PRESETS: { label: string; ids: () => string[] }[] = [
  { label: 'Default', ids: defaultEnabledIds },
  { label: 'Concrete', ids: () => BLOCKS.filter((b) => b.category === 'Concrete').map((b) => b.id) },
  { label: 'All safe', ids: () => BLOCKS.filter((b) => !b.gravity).map((b) => b.id) },
  { label: 'None', ids: () => [] },
];

function TriCheckbox({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate: boolean; onChange: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} aria-label={label} />;
}

/** Choose which blocks the generator may use. */
export const BlockPalettePanel = memo(function BlockPalettePanel({ enabled, setEnabled, orientation }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const q = query.trim().toLowerCase();

  const groups = useMemo(
    () =>
      blockData.categories.map((category) => {
        const all = BLOCKS.filter((b) => b.category === category);
        const shown = q ? all.filter((b) => b.name.toLowerCase().includes(q) || b.id.includes(q)) : all;
        return { category, all, shown };
      }),
    [q],
  );

  const toggleIds = (ids: string[], on: boolean) => {
    const next = new Set(enabled);
    for (const id of ids) (on ? next.add(id) : next.delete(id));
    setEnabled(next);
  };

  const gravityOn = BLOCKS.some((b) => b.gravity && enabled.has(b.id));

  return (
    <div className="palette">
      <div className="palette-head">
        <p className="muted small">
          Generating from <strong>{enabled.size}</strong> of {BLOCKS.length} blocks
        </p>
        <label className="search">
          <Icon name="search" size={16} />
          <input placeholder="Search blocks…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <button type="button" className="icon-btn tiny" onClick={() => setQuery('')} aria-label="Clear search">
              <Icon name="close" size={14} />
            </button>
          )}
        </label>
        <div className="chips">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="chip" onClick={() => setEnabled(new Set(p.ids()))}>
              {p.label}
            </button>
          ))}
        </div>
        {gravityOn && (
          <p className="note warn">
            <Icon name="warn" size={16} />
            Sand, gravel and concrete powder fall when a neighbouring block updates. Fine for floors on solid ground, risky for walls.
          </p>
        )}
        {enabled.size === 0 && <p className="note warn">Pick at least one block to generate from.</p>}
      </div>

      <div className="categories">
        {groups.map(({ category, all, shown }) => {
          if (shown.length === 0) return null;
          const on = all.filter((b) => enabled.has(b.id)).length;
          const expanded = !!q || open.has(category);
          return (
            <section key={category} className="category">
              <div className="category-row">
                <TriCheckbox
                  checked={on === all.length}
                  indeterminate={on > 0 && on < all.length}
                  onChange={() => toggleIds(all.map((b) => b.id), on !== all.length)}
                  label={`Use all ${category}`}
                />
                <button
                  type="button"
                  className="category-toggle"
                  onClick={() => {
                    const next = new Set(open);
                    if (next.has(category)) next.delete(category);
                    else next.add(category);
                    setOpen(next);
                  }}
                  aria-expanded={expanded}
                >
                  <span className={`chev ${expanded ? 'is-open' : ''}`}>
                    <Icon name="chevron" size={14} />
                  </span>
                  <span className="category-name">{category}</span>
                  <span className="category-preview" aria-hidden="true">
                    {all.slice(0, 6).map((b) => (
                      <BlockSwatch key={b.id} block={b} orientation={orientation} size={14} />
                    ))}
                  </span>
                  <span className="muted small num">
                    {on}/{all.length}
                  </span>
                </button>
              </div>
              {expanded && (
                <div className="block-grid">
                  {shown.map((b) => {
                    const isOn = enabled.has(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        className={`block-toggle ${isOn ? 'is-on' : ''}`}
                        onClick={() => toggleIds([b.id], !isOn)}
                        aria-pressed={isOn}
                        title={`${b.name}${b.gravity ? ' (falls)' : ''}`}
                      >
                        <BlockSwatch block={b} orientation={orientation} size={28} />
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
});
