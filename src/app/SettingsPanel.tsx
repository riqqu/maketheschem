import { useEffect, useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { Field, SliderField, SwitchField } from '@/components/field';
import { IconButton } from '@/components/icon-button';
import { Note } from '@/components/note';
import { Segmented } from '@/components/segmented';
import { Input } from '@/components/ui/input';
import type { BackgroundInfo } from '../worker/generate.worker';
import { MAX_TYPES_MAX, MAX_TYPES_MIN, type ArtSettings, type DitherMode } from './settings';
import { MAX_SIDE, maxHeightFor } from './size';

type Update = (patch: Partial<ArtSettings>) => void;

interface SizeProps {
  settings: ArtSettings;
  update: Update;
  setOrientation: (o: ArtSettings['orientation']) => void;
  setWidth: (w: number) => void;
  setHeight: (h: number) => void;
  setLongest: (n: number) => void;
}

const SIZE_PRESETS = [16, 32, 64, 128, 256];

/** Number input that only commits on blur/Enter, so typing "128" doesn't regenerate at 1 and 12. */
function NumberField({ label, value, min = 1, max, onCommit }: { label: string; value: number; min?: number; max: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = parseInt(text, 10);
    if (Number.isFinite(n) && n !== value) onCommit(n);
    else setText(String(value));
  };
  return (
    <Field label={label}>
      <Input
        type="number"
        min={min}
        max={max}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        inputMode="numeric"
        aria-label={label}
        className="tabular-nums"
      />
    </Field>
  );
}

/** Wall or floor, and its size in blocks. */
export function SizePanel({ settings: s, update, setOrientation, setWidth, setHeight, setLongest }: SizeProps) {
  const longest = Math.max(s.width, s.height);
  return (
    <>
      <Segmented
        label="Orientation"
        value={s.orientation}
        onChange={setOrientation}
        options={[
          { value: 'wall', label: 'Wall' },
          { value: 'floor', label: 'Floor' },
        ]}
      />

      <div className="grid gap-2">
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-1.5">
          <NumberField label="Width" value={s.width} max={MAX_SIDE} onCommit={setWidth} />
          <IconButton
            icon={s.lockAspect ? Lock : LockOpen}
            label={s.lockAspect ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
            pressed={s.lockAspect}
            onClick={() => update({ lockAspect: !s.lockAspect })}
          />
          <NumberField label={s.orientation === 'wall' ? 'Height' : 'Length'} value={s.height} max={maxHeightFor(s.orientation)} onCommit={setHeight} />
        </div>
        <Segmented
          label="Longest side"
          value={SIZE_PRESETS.includes(longest) ? longest : null}
          onChange={setLongest}
          options={SIZE_PRESETS.map((n) => ({ value: n, label: n }))}
        />
      </div>
    </>
  );
}

/** How the source image is read: resampling and background removal. `bgInfo` is the last generation's result. */
export function SourceOptions({ settings: s, update, bgInfo }: { settings: ArtSettings; update: Update; bgInfo: BackgroundInfo | null }) {
  return (
    <>
      <Field label="Resize">
        <Segmented
          label="Resize"
          value={s.resize}
          onChange={(resize) => update({ resize })}
          options={[
            { value: 'smooth', label: 'Smooth', tooltip: 'Best for photos' },
            { value: 'sharp', label: 'Sharp', tooltip: 'Best for pixel art' },
          ]}
        />
      </Field>
      <SwitchField
        label="Remove background"
        checked={s.bgOn}
        onChange={(bgOn) => update({ bgOn })}
        aside={
          bgInfo?.color && (
            <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground" title={`Detected rgb(${bgInfo.color.join(', ')})`}>
              <span className="size-2.5 rounded-full ring-1 ring-border" style={{ background: `rgb(${bgInfo.color.join(',')})` }} />
              {Math.round(bgInfo.removed * 100)}%
            </span>
          )
        }
      >
        <Segmented
          label="Background removal"
          value={s.bgMode}
          onChange={(bgMode) => update({ bgMode })}
          options={[
            { value: 'edges', label: 'Outside only', tooltip: 'Keeps enclosed areas, like the inside of letters' },
            { value: 'all', label: 'Everywhere', tooltip: 'Also removes that colour inside holes' },
          ]}
        />
        <SliderField label="Tolerance" value={s.bgTolerance} min={1} max={50} onChange={(bgTolerance) => update({ bgTolerance })} />
        {bgInfo && !bgInfo.color && <Note>No single background colour along the edges. Nothing was removed.</Note>}
      </SwitchField>
    </>
  );
}

const DITHER: { value: DitherMode; label: string; tooltip: string }[] = [
  { value: 'off', label: 'Off', tooltip: 'Each pixel becomes its nearest block' },
  { value: 'diffusion', label: 'Smooth', tooltip: 'Mixes blocks for smooth gradients' },
  { value: 'ordered', label: 'Pattern', tooltip: 'A regular pattern, easier to build by hand' },
];

/** The matching settings images and 3D models share. */
export type MatchingSettings = Pick<ArtSettings, 'smoothness' | 'ditherStrength' | 'maxTypesOn' | 'maxTypes'> & { dither: DitherMode };

/** How pixels (or model surfaces) are matched to blocks. `noDiffusion` hides error diffusion (3D models). */
export function MatchingPanel<S extends MatchingSettings>({
  settings: s,
  update,
  noDiffusion = false,
}: {
  settings: S;
  update: (patch: Partial<S>) => void;
  noDiffusion?: boolean;
}) {
  const set = (patch: Partial<MatchingSettings>) => update(patch as Partial<S>);
  return (
    <>
      <SliderField
        label="Prefer smooth textures"
        value={s.smoothness}
        display={`${s.smoothness}%`}
        min={0}
        max={100}
        step={5}
        onChange={(smoothness) => set({ smoothness })}
      />
      <Field label="Dithering">
        <Segmented
          label="Dithering"
          value={s.dither}
          onChange={(dither) => set({ dither })}
          options={noDiffusion ? DITHER.filter((d) => d.value !== 'diffusion') : DITHER}
        />
      </Field>
      {s.dither !== 'off' && (
        <SliderField
          label="Strength"
          value={Math.round(s.ditherStrength * 100)}
          display={`${Math.round(s.ditherStrength * 100)}%`}
          min={10}
          max={100}
          step={5}
          onChange={(v) => set({ ditherStrength: v / 100 })}
        />
      )}
      <SwitchField label="Limit block types" checked={s.maxTypesOn} onChange={(maxTypesOn) => set({ maxTypesOn })}>
        <SliderField label="At most" value={s.maxTypes} min={MAX_TYPES_MIN} max={MAX_TYPES_MAX} onChange={(maxTypes) => set({ maxTypes })} />
      </SwitchField>
    </>
  );
}
