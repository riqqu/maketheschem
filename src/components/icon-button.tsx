import type { ComponentProps } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type Props = Omit<ComponentProps<typeof Button>, 'children' | 'aria-label'> & {
  icon: LucideIcon;
  /** Accessible name, also shown in the tooltip. */
  label: string;
  /** Keyboard shortcut shown in the tooltip. */
  shortcut?: string;
  /** Second tooltip line, for modifiers like "Shift snaps to 45°". */
  hint?: string;
  /** Makes it a toggle button (aria-pressed). */
  pressed?: boolean;
  tooltipSide?: ComponentProps<typeof TooltipContent>['side'];
};

/** An icon-only button with a tooltip naming it and its shortcut. */
export function IconButton({ icon: Icon, label, shortcut, hint, pressed, tooltipSide, className, variant = 'ghost', size = 'icon', ...props }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={variant}
          size={size}
          aria-label={label}
          aria-pressed={pressed}
          className={cn('aria-pressed:bg-accent aria-pressed:text-foreground', className)}
          {...props}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>
        <span className="flex flex-col">
          <span>{label}</span>
          {hint && <span className="opacity-70">{hint}</span>}
        </span>
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}
