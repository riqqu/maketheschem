import { ArrowRight, Blend, Brush, Circle, Crosshair, FoldHorizontal, FoldVertical, MoveDiagonal, Square } from 'lucide-react';
import { IconButton } from '@/components/icon-button';
import { Segmented } from '@/components/segmented';
import { SliderPopover } from '@/components/slider-popover';
import { Input } from '@/components/ui/input';
import { MAX_BRUSH, type BrushShape } from '../core/brush';
import { MAX_TEXT_LENGTH, MAX_TEXT_SCALE } from '../core/pixelFont';
import type { Orientation } from '../core/types';
import { BLOCKS, blockIndexById } from '../data';
import { BlockPicker } from './BlockPicker';
import { BrushPreview, EllipsePreview, RectPreview, TextPreview } from './CellPreview';
import type { Tool } from './Editor';
import { MAX_ROUNDING, MIRROR_TOOLS, type SetOption, type ToolOptions as Options } from './toolOptions';

const SIZES = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 100];
const ROUNDINGS = [0, 1, 2, 3, 5, 8, 12, 20, 32];
const TOLERANCES = [0, 2, 5, 10, 20, 35, 50, 100];
const TEXT_SCALES = [1, 2, 3, 4, 6, 8, 12, 16];
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

/** The text to stamp, typed here and shown under the pointer on the canvas. Takes the focus when the tool is chosen. */
function TextOptions({ options, set, disabled }: { options: Options; set: SetOption; disabled: boolean }) {
  const o = options.text;
  return (
    <>
      <Input
        autoFocus
        aria-label="Text"
        placeholder="Text"
        maxLength={MAX_TEXT_LENGTH}
        className="w-44"
        value={o.value}
        disabled={disabled}
        onChange={(e) => set('text', { value: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); // back to the shortcuts
        }}
      />
      <SliderPopover
        label="Scale"
        value={o.scale}
        min={1}
        max={MAX_TEXT_SCALE}
        presets={TEXT_SCALES}
        shortcut="[ ]"
        preview={<TextPreview value={o.value} scale={o.scale} />}
        onChange={(scale) => set('text', { scale })}
        disabled={disabled}
      />
    </>
  );
}

interface BarProps {
  tool: Tool;
  options: Options;
  set: SetOption;
  disabled: boolean;
  orientation: Orientation;
  recent: number[];
}

/** The options of the active tool, shown in the bar above the canvas (like Photoshop's options bar). */
export function ToolOptionsBar({ tool, options, set, disabled, orientation, recent }: BarProps) {
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
      case 'rect':
      case 'ellipse': {
        const o = options[tool];
        const preview =
          tool === 'rect' ? (
            <RectPreview filled={o.filled} thickness={o.thickness} rounding={options.rect.rounding} />
          ) : (
            <EllipsePreview filled={o.filled} thickness={o.thickness} />
          );
        return (
          <>
            <Segmented
              label={tool === 'rect' ? 'Rectangle style' : 'Ellipse style'}
              value={o.filled ? 'filled' : 'outline'}
              onChange={(v) => set(tool, { filled: v === 'filled' })}
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
                onChange={(thickness) => set(tool, { thickness })}
                disabled={disabled}
              />
            )}
            {tool === 'rect' && (
              <SliderPopover
                label="Radius"
                value={options.rect.rounding}
                min={0}
                max={MAX_ROUNDING}
                presets={ROUNDINGS}
                preview={preview}
                onChange={(rounding) => set('rect', { rounding })}
                disabled={disabled}
              />
            )}
            <IconButton
              icon={Crosshair}
              label="From centre"
              hint="Drag out from the middle block"
              pressed={o.fromCenter}
              onClick={() => set(tool, { fromCenter: !o.fromCenter })}
              disabled={disabled}
            />
          </>
        );
      }
      case 'gradient':
        return (
          <>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <BlockPicker
              value={blockIndexById.get(options.gradient.to) ?? null}
              onSelect={(v) => set('gradient', { to: BLOCKS[v].id })}
              orientation={orientation}
              recent={recent}
              disabled={disabled}
              label="Gradient end block"
              className="w-36"
            />
            <Segmented
              label="Gradient dithering"
              value={options.gradient.dither}
              onChange={(dither) => set('gradient', { dither })}
              disabled={disabled}
              className="w-44"
              options={[
                { value: 'off', label: 'Off', tooltip: 'Hard steps' },
                { value: 'diffusion', label: 'Smooth', tooltip: 'Error diffusion' },
                { value: 'ordered', label: 'Pattern', tooltip: 'Regular pattern' },
              ]}
            />
          </>
        );
      case 'text':
        return <TextOptions options={options} set={set} disabled={disabled} />;
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
  const mirror = MIRROR_TOOLS.includes(tool) && (
    <div className="flex items-center gap-1">
      <IconButton
        icon={FoldHorizontal}
        label="Mirror left and right"
        hint="Drag the round handle to move the line"
        pressed={options.mirror.x}
        onClick={() => set('mirror', { x: !options.mirror.x })}
        disabled={disabled}
      />
      <IconButton
        icon={FoldVertical}
        label="Mirror top and bottom"
        hint="Drag the round handle to move the line"
        pressed={options.mirror.y}
        onClick={() => set('mirror', { y: !options.mirror.y })}
        disabled={disabled}
      />
    </div>
  );
  return (controls || mirror) && <div className="flex shrink-0 items-center gap-2">{controls}{mirror}</div>;
}
