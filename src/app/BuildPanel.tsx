import { useMemo } from 'react';
import { Check, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { IconButton } from '@/components/icon-button';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DONE, EMPTY, progress, stepCounts, stepName, type Built, type StepKind, type Steps } from '../core/build';
import type { Grid } from '../core/grid';
import type { Orientation } from '../core/types';
import { BlockCountRow } from './BlockCountRow';

const fmt = new Intl.NumberFormat();

interface Props {
  grid: Grid;
  /** Bumped when the blocks of `grid` change in place. */
  version: number;
  built: Built | null;
  steps: Steps;
  states: Uint8Array;
  step: number;
  onStep: (index: number) => void;
  onKind: (kind: StepKind) => void;
  orientation: Orientation;
  highlight: number | null;
  onHighlight: (value: number) => void;
  /** Ticks the current step off, or back on. */
  onToggle: () => void;
  onReset: () => void;
}

/** Build mode: one row or section at a time, what it needs, and a tick when it is built. */
export function BuildPanel({ grid, version, built, steps, states, step, onStep, onKind, orientation, highlight, onHighlight, onToggle, onReset }: Props) {
  const name = stepName(steps, step);
  const state = states[step];
  const here = useMemo(() => stepCounts(grid, built, steps.rect(step)), [grid, version, built, steps, step]);
  const all = useMemo(() => progress(grid, built), [grid, version, built]);
  const rows = [...here.counts].sort((a, b) => b[1] - a[1]);

  let finished = 0, parts = 0;
  for (const s of states) {
    if (s !== EMPTY) parts++;
    if (s === DONE) finished++;
  }

  return (
    <div>
      <div className="grid gap-3 p-4">
        <Segmented
          label="Build by"
          value={steps.kind}
          onChange={onKind}
          options={[
            { value: 'rows', label: 'Rows' },
            { value: 'sections', label: 'Sections' },
          ]}
        />
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <p className="font-medium tabular-nums">
              {name.title} <span className="font-normal text-muted-foreground">of {fmt.format(steps.count)}</span>
            </p>
            {name.detail && <p className="text-xs tabular-nums text-muted-foreground">{name.detail}</p>}
          </div>
          <IconButton icon={ChevronLeft} label="Previous" shortcut="[" onClick={() => onStep(step - 1)} disabled={step <= 0} />
          <IconButton icon={ChevronRight} label="Next" shortcut="]" onClick={() => onStep(step + 1)} disabled={step >= steps.count - 1} />
        </div>
      </div>

      <div className="border-t">
        <p className="px-4 pt-3 pb-1 text-xs tabular-nums text-muted-foreground">
          {fmt.format(here.total)} {here.total === 1 ? 'block' : 'blocks'}
          {here.left > 0 && here.left < here.total && ` · ${fmt.format(here.left)} left`}
        </p>
        <ul className="pb-2">
          {rows.map(([v, n]) => (
            <BlockCountRow key={v} value={v} count={n} orientation={orientation} pressed={highlight === v} onPress={() => onHighlight(v)} />
          ))}
        </ul>
      </div>

      <div className="border-t p-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button className="w-full" variant={state === DONE ? 'outline' : 'default'} disabled={state === EMPTY} onClick={onToggle}>
              <Check /> {state === DONE ? 'Done' : 'Mark done'}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <span>{state === DONE ? 'Mark as to do' : 'Mark done'}</span>
            <Kbd>D</Kbd>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="grid gap-2 border-t p-4">
        <div className="flex items-baseline justify-between gap-2 tabular-nums">
          <p>
            <span className="font-medium">{fmt.format(all.done)}</span>
            <span className="text-muted-foreground"> / {fmt.format(all.blocks)} blocks</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {fmt.format(finished)} / {fmt.format(parts)} {steps.kind}
          </p>
        </div>
        <Progress
          value={all.blocks ? (all.done / all.blocks) * 100 : 0}
          aria-label="Blocks built"
          className="h-1.5 [&>[data-slot=progress-indicator]]:bg-brand"
        />
        <Button variant="ghost" size="sm" className="justify-self-start text-muted-foreground" disabled={!built} onClick={onReset}>
          <RotateCcw /> Reset progress
        </Button>
      </div>
    </div>
  );
}
