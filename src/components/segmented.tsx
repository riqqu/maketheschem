import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  tooltip?: string;
  disabled?: boolean;
}

/** Pick one of a few options. Clicking the selected option keeps it selected. */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
  disabled,
  className,
}: {
  value: T | null;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  /** Accessible name of the group. */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      spacing={0}
      value={value === null ? '' : String(value)}
      onValueChange={(v) => {
        const o = options.find((o) => String(o.value) === v);
        if (o) onChange(o.value);
      }}
      aria-label={label}
      disabled={disabled}
      // Concentric corners: the item radius is the group radius minus the p-0.5 gap around it.
      className={cn('w-full gap-0.5 rounded-lg bg-muted p-0.5 data-[size=sm]:rounded-lg', className)}
    >
      {options.map((o) => {
        const item = (
          <ToggleGroupItem
            key={String(o.value)}
            value={String(o.value)}
            disabled={o.disabled}
            className="h-7 flex-1 rounded-[calc(var(--radius-lg)-0.125rem)]! px-2 text-[0.8rem] text-muted-foreground hover:bg-transparent hover:text-foreground aria-checked:bg-background aria-checked:text-foreground aria-checked:shadow-sm dark:aria-checked:bg-input/50"
          >
            {o.label}
          </ToggleGroupItem>
        );
        if (!o.tooltip) return item;
        return (
          <Tooltip key={String(o.value)}>
            <TooltipTrigger asChild>{item}</TooltipTrigger>
            <TooltipContent>{o.tooltip}</TooltipContent>
          </Tooltip>
        );
      })}
    </ToggleGroup>
  );
}
