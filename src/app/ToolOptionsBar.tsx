import { Blend, Brush, Circle, Crosshair, MoveDiagonal, Square } from 'lucide-react';
import { IconButton } from '@/components/icon-button';
import { Segmented } from '@/components/segmented';
import { SliderPopover } from '@/components/slider-popover';
import { MAX_BRUSH, type BrushShape } from '../core/brush';
import { BrushPreview, RectPreview } from './CellPreview';
import type { Tool } from './Editor';
import { MAX_ROUNDING, type SetOption, type ToolOptions as Options } from './toolOptions';

const SIZES = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 100];
const ROUNDINGS = [0, 1, 2, 3, 5, 8, 12, 20, 32];
const TOLERANCES = [0, 2, 5, 10, 20, 35, 50, 100];
const percent = (v: number) => `${v}%`;

function ShapePicker({ value, onChange, disabled }: { value: BrushShape; onChange: (v: BrushShape) => void; disabled: boolean }) {
  return (
    <Segmented
      label="Brush shape"
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="w-[4.5rem]"
      options={[
        { value: 'square', label: <Square />, tooltip: 'Square' },
        { value: 'round', label: <Circle />, tooltip: 'Round' },
      ]}
    />
  );
}

/** The options of the active tool, shown in the bar above the canvas (like Photoshop's options bar). */
export function ToolOptionsBar({ tool, options, set, disabled }: { tool: Tool; options: Options; set: SetOption; disabled: boolean }) {
  const controls = (() => {
    switch (tool) {
      case 'brush':
      case 'eraser':
      case 'line': {
        const o = options[tool];
        return (
          <>
            <SliderPopover
              label={tool === 'line' ? 'Width' : 'Size'}
              value={o.size}
              min={1}
              max={MAX_BRUSH}
              presets={SIZES}
              shortcut="[ ]"
              preview={<BrushPreview size={o.size} shape={o.shape} />}
              onChange={(size) => set(tool, { size })}
              disabled={disabled}
            />
            <ShapePicker value={o.shape} onChange={(shape) => set(tool, { shape })} disabled={disabled} />
          </>
        );
      }
      case 'rect': {
        const o = options.rect;
        const preview = <RectPreview filled={o.filled} thickness={o.thickness} rounding={o.rounding} />;
        return (
          <>
            <Segmented
              label="Rectangle style"
              value={o.filled ? 'filled' : 'outline'}
              onChange={(v) => set('rect', { filled: v === 'filled' })}
              disabled={disabled}
              className="w-36"
              options={[
                { value: 'outline', label: 'Outline' },
                { value: 'filled', label: 'Filled' },
              ]}
            />
            {!o.filled && (
              <SliderPopover
                label="Thickness"
                value={o.thickness}
                min={1}
                max={MAX_BRUSH}
                presets={SIZES}
                shortcut="[ ]"
                preview={preview}
                onChange={(thickness) => set('rect', { thickness })}
                disabled={disabled}
              />
            )}
            <SliderPopover
              label="Radius"
              value={o.rounding}
              min={0}
              max={MAX_ROUNDING}
              presets={ROUNDINGS}
              preview={preview}
              onChange={(rounding) => set('rect', { rounding })}
              disabled={disabled}
            />
            <IconButton
              icon={Crosshair}
              label="From centre"
              hint="Drag out from the middle block"
              pressed={o.fromCenter}
              onClick={() => set('rect', { fromCenter: !o.fromCenter })}
              disabled={disabled}
            />
          </>
        );
      }
      case 'fill':
        return (
          <>
            <SliderPopover
              label="Tolerance"
              value={options.fill.tolerance}
              min={0}
              max={100}
              format={percent}
              presets={TOLERANCES}
              onChange={(tolerance) => set('fill', { tolerance })}
              disabled={disabled}
            />
            <IconButton
              icon={MoveDiagonal}
              label="Include diagonals"
              hint="Also spreads across corners"
              pressed={options.fill.diagonal}
              onClick={() => set('fill', { diagonal: !options.fill.diagonal })}
              disabled={disabled}
            />
          </>
        );
      case 'replace':
        return (
          <SliderPopover
            label="Tolerance"
            value={options.replace.tolerance}
            min={0}
            max={100}
            format={percent}
            presets={TOLERANCES}
            onChange={(tolerance) => set('replace', { tolerance })}
            disabled={disabled}
          />
        );
      case 'picker':
        return (
          <IconButton
            icon={Brush}
            label="Switch to brush after picking"
            pressed={options.picker.backToBrush}
            onClick={() => set('picker', { backToBrush: !options.picker.backToBrush })}
            disabled={disabled}
          />
        );
      case 'select':
        return (
          <IconButton
            icon={Blend}
            label="Air is see-through"
            hint="Off: moved or pasted air clears the blocks below"
            pressed={options.select.airTransparent}
            onClick={() => set('select', { airTransparent: !options.select.airTransparent })}
            disabled={disabled}
          />
        );
      default:
        return null;
    }
  })();
  return controls && <div className="flex shrink-0 items-center gap-2">{controls}</div>;
}
