import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A number you can type. Out-of-range input is clamped as you type; leaving the box shows the real value again. */
function NumberBox({ value, min, max, label, onChange }: { value: number; min: number; max: number; label: string; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      aria-label={label}
      className="h-7 w-14 px-1.5 text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      value={draft ?? String(value)}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = e.target.valueAsNumber;
        if (Number.isFinite(n)) onChange(clamp(Math.round(n), min, max));
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

/**
 * A number option as a button ("Size 12") that opens a slider, a number box, preset sizes and an optional preview.
 * Meant for options bars: a plain slider has too little room for a range like 1-100.
 */
export function SliderPopover({
  label,
  value,
  onChange,
  min,
  max,
  format = String,
  presets,
  preview,
  shortcut,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** How the value reads on the button, e.g. "40%". */
  format?: (value: number) => string;
  presets?: number[];
  /** Shown above the slider and redrawn as the value changes. */
  preview?: ReactNode;
  /** Keyboard shortcut shown in a tooltip on the button. */
  shortcut?: string;
  disabled?: boolean;
}) {
  const button = (
    <Button variant="outline" disabled={disabled} className="gap-1.5 px-2.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-5 text-right tabular-nums">{format(value)}</span>
      <ChevronDown className="text-muted-foreground" />
    </Button>
  );
  return (
    <Popover>
      {shortcut ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>{button}</PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            {label}
            <Kbd>{shortcut}</Kbd>
          </TooltipContent>
        </Tooltip>
      ) : (
        <PopoverTrigger asChild>{button}</PopoverTrigger>
      )}
      <PopoverContent align="start" className="w-72 gap-3 p-3">
        {preview && <div className="grid h-32 place-items-center overflow-hidden rounded-md bg-muted text-foreground">{preview}</div>}
        <div className="flex items-center gap-3">
          <Slider className="flex-1" min={min} max={max} step={1} value={[value]} onValueChange={([v]) => onChange(v)} aria-label={label} />
          <NumberBox value={value} min={min} max={max} label={label} onChange={onChange} />
        </div>
        {presets && (
          <div className="flex flex-wrap gap-1">
            {presets.map((p) => (
              <Button key={p} size="xs" variant={p === value ? 'secondary' : 'ghost'} className="min-w-7 tabular-nums" onClick={() => onChange(p)}>
                {p}
              </Button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
