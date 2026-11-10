import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BLOCKS, blockData } from '../data';
import type { Orientation } from '../core/types';
import { BlockSwatch } from './BlockSwatch';
import { Icon } from './Icon';

interface Props {
  orientation: Orientation;
  current: number;
  recent: number[];
  style?: CSSProperties;
  onSelect: (value: number) => void;
  onClose: () => void;
}

/** Popover for choosing the brush block. Lists every usable block, not only the enabled ones. */
export function BlockPicker({ orientation, current, recent, style, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [hovered, setHovered] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest('.block-chip')) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return blockData.categories
      .map((category) => ({
        category,
        items: BLOCKS.map((b, i) => ({ b, i })).filter(
          ({ b }) => b.category === category && (!q || b.name.toLowerCase().includes(q) || b.id.includes(q)),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [query]);

  const label = hovered ?? current;

  const item = (i: number) => (
    <button
      key={i}
      type="button"
      className={`pick-item ${i === current ? 'is-current' : ''}`}
      title={BLOCKS[i].name}
      onClick={() => onSelect(i)}
      onMouseEnter={() => setHovered(i)}
      onMouseLeave={() => setHovered(null)}
    >
      <BlockSwatch block={BLOCKS[i]} orientation={orientation} size={26} />
    </button>
  );

  return (
    <div className="picker" ref={ref} style={style} role="dialog" aria-label="Choose brush block">
      <label className="search">
        <Icon name="search" size={16} />
        <input autoFocus placeholder="Search blocks…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="picker-scroll">
        {recent.length > 0 && !query && (
          <section>
            <h4>Recent</h4>
            <div className="pick-grid">{recent.map(item)}</div>
          </section>
        )}
        {groups.map((g) => (
          <section key={g.category}>
            <h4>{g.category}</h4>
            <div className="pick-grid">{g.items.map(({ i }) => item(i))}</div>
          </section>
        ))}
        {groups.length === 0 && <p className="muted pad">No blocks match “{query}”.</p>}
      </div>
      <div className="picker-foot">{BLOCKS[label]?.name}</div>
    </div>
  );
}
