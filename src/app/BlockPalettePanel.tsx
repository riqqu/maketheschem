import { memo, useMemo, useState } from 'react';
import { ChevronRight, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/icon-button';
import { Note } from '@/components/note';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BLOCKS, blockData, defaultEnabledIds } from '../data';
import type { Orientation } from '../core/types';
import { BlockSwatch } from './BlockSwatch';

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
  const setOpenCategory = (category: string, isOpen: boolean) => {
    const next = new Set(open);
    if (isOpen) next.add(category);
    else next.delete(category);
    setOpen(next);
  };

  const gravityOn = BLOCKS.some((b) => b.gravity && enabled.has(b.id));

  return (
    <div>
      <div className="grid gap-3 p-4">
        <label className="flex h-8 items-center gap-2 rounded-lg border border-input px-2.5 text-muted-foreground focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
          <Search className="size-4 shrink-0" />
          <input
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Search blocks"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && <IconButton icon={X} label="Clear search" size="icon-xs" onClick={() => setQuery('')} />}
        </label>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <Button key={p.label} variant="outline" size="xs" onClick={() => setEnabled(new Set(p.ids()))}>
              {p.label}
            </Button>
          ))}
        </div>
        {gravityOn && <Note>Sand, gravel and concrete powder fall when a neighbouring block updates. Fine for floors, risky for walls.</Note>}
        {enabled.size === 0 && <Note>Pick at least one block.</Note>}
      </div>

      <div className="border-t">
        {groups.map(({ category, all, shown }) => {
          if (shown.length === 0) return null;
          const on = all.filter((b) => enabled.has(b.id)).length;
          const expanded = !!q || open.has(category);
          return (
            <Collapsible key={category} open={expanded} onOpenChange={(o) => setOpenCategory(category, o)} className="border-b">
              <div className="flex items-center gap-1 pl-4 pr-3">
                <Checkbox
                  checked={on === all.length ? true : on > 0 ? 'indeterminate' : false}
                  onCheckedChange={() => toggleIds(all.map((b) => b.id), on !== all.length)}
                  aria-label={`Use all ${category}`}
                />
                <CollapsibleTrigger className="group flex h-10 min-w-0 flex-1 items-center gap-2 px-2 text-left">
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                  <span className="shrink-0 font-medium">{category}</span>
                  <span className="ml-auto flex min-w-0 justify-end gap-0.5 overflow-hidden" aria-hidden="true">
                    {all.slice(0, 6).map((b) => (
                      <BlockSwatch key={b.id} block={b} orientation={orientation} size={14} />
                    ))}
                  </span>
                  <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {on}/{all.length}
                  </span>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="grid grid-cols-[repeat(auto-fill,36px)] gap-1 px-4 pb-3">
                {shown.map((b) => {
                  const isOn = enabled.has(b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      className={cn(
                        'grid size-9 place-items-center rounded-md border bg-muted/50 hover:border-foreground/50',
                        isOn ? 'border-foreground/70 ring-1 ring-foreground/70 ring-inset' : '[&>span]:opacity-30 [&>span]:grayscale-[0.7]',
                      )}
                      onClick={() => toggleIds([b.id], !isOn)}
                      aria-pressed={isOn}
                      aria-label={b.name}
                      title={`${b.name}${b.gravity ? ' (falls)' : ''}`}
                    >
                      <BlockSwatch block={b} orientation={orientation} size={28} />
                    </button>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
});
