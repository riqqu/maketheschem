import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

/** A labelled control, with an optional value shown on the right of the label. */
export function Field({
  label,
  value,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  value?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-2', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
          {label}
        </Label>
        {value != null && <span className="text-xs tabular-nums text-muted-foreground">{value}</span>}
      </div>
      {children}
    </div>
  );
}

/** A slider with its label and current value. */
export function SliderField({
  label,
  value,
  display = value,
  min,
  max,
  step = 1,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  /** Shown instead of the raw value, e.g. "40%". */
  display?: ReactNode;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label} value={display}>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} disabled={disabled} aria-label={label} />
    </Field>
  );
}

/** A switch with its label on the left. Children show below while it is on. */
export function SwitchField({
  label,
  checked,
  onChange,
  aside,
  children,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Shown right of the label, before the switch. */
  aside?: ReactNode;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Label htmlFor={id} className="flex-1 font-normal">
          {label}
        </Label>
        {aside}
        <Switch id={id} checked={checked} onCheckedChange={onChange} />
      </div>
      {checked && children}
    </div>
  );
}
