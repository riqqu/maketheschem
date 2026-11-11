import { useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { BLOCKS, blockData } from '../data';
import type { Orientation } from '../core/types';
import { BlockSwatch } from './BlockSwatch';

interface Props {
  /** Block index, or null while none is chosen. */
  value: number | null;
  onSelect: (value: number) => void;
  orientation: Orientation;
  recent?: number[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

/** A button showing the chosen block that opens a searchable grid of every usable block (not only the enabled ones). */
export function BlockPicker({ value, onSelect, orientation, recent = [], disabled, placeholder = 'Air', className }: Props) {
  const [open, setOpen] = useState(false);
  const block = value === null ? null : BLOCKS[value] ?? null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={disabled} className={cn('w-48 justify-start gap-2 pl-1.5', className)} aria-label="Block">
          <BlockSwatch block={block} orientation={orientation} size={20} />
          <span className="flex-1 truncate text-left @max-[720px]:hidden">{block?.name ?? placeholder}</span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(360px,calc(100vw-32px))] gap-0 p-0">
        <BlockGrid
          orientation={orientation}
          current={value}
          recent={recent}
          onSelect={(v) => {
            onSelect(v);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function BlockGrid({ orientation, current, recent, onSelect }: { orientation: Orientation; current: number | null; recent: number[]; onSelect: (v: number) => void }) {
  const [query, setQuery] = useState('');
  const [hovered, setHovered] = useState<number | null>(null);

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

  const item = (i: number) => (
    <button
      key={i}
      type="button"
      className={cn(
        'grid size-8 place-items-center rounded-md border border-transparent hover:border-border hover:bg-muted',
        i === current && 'border-foreground/40 bg-muted',
      )}
      aria-label={BLOCKS[i].name}
      onClick={() => onSelect(i)}
      onMouseEnter={() => setHovered(i)}
      onMouseLeave={() => setHovered(null)}
    >
      <BlockSwatch block={BLOCKS[i]} orientation={orientation} size={26} />
    </button>
  );

  const section = (title: string, items: number[]) => (
    <section key={title} className="grid gap-1.5">
      <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
      <div className="grid grid-cols-[repeat(auto-fill,32px)] gap-0.5">{items.map(item)}</div>
    </section>
  );

  const label = hovered ?? current;
  return (
    <>
      <label className="flex items-center gap-2 border-b px-3 text-muted-foreground">
        <Search className="size-4" />
        <input
          className="h-10 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          placeholder="Search blocks"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="grid max-h-[min(420px,60vh)] gap-3 overflow-y-auto p-3">
        {recent.length > 0 && !query && section('Recent', recent)}
        {groups.map((g) => section(g.category, g.items.map(({ i }) => i)))}
        {groups.length === 0 && <p className="py-6 text-center text-muted-foreground">No blocks match “{query}”</p>}
      </div>
      <div className="h-9 truncate border-t px-3 leading-9 font-medium">{label !== null ? BLOCKS[label]?.name : ''}</div>
    </>
  );
}
