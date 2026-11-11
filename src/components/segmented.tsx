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
      className={cn('w-full gap-0.5 rounded-lg bg-muted p-0.5', className)}
    >
      {options.map((o) => {
        const item = (
          <ToggleGroupItem
            key={String(o.value)}
            value={String(o.value)}
            disabled={o.disabled}
            className="h-7 flex-1 rounded-md! px-2 text-[0.8rem] text-muted-foreground hover:bg-transparent data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm dark:data-[state=on]:bg-input/50"
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
