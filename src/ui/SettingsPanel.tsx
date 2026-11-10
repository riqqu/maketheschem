import { useEffect, useState } from 'react';
import type { BackgroundInfo } from '../worker/generate.worker';
import { Icon } from './Icon';
import { MAX_TYPES_MAX, MAX_TYPES_MIN, type ArtSettings, type DitherMode } from './settings';
import { MAX_SIDE, maxHeightFor } from './size';

type Update = (patch: Partial<ArtSettings>) => void;

interface Props {
  settings: ArtSettings;
  update: Update;
  setOrientation: (o: ArtSettings['orientation']) => void;
  setWidth: (w: number) => void;
  setHeight: (h: number) => void;
  setLongest: (n: number) => void;
  /** Result of the last generation (null until it ran with background removal on). */
  bgInfo: BackgroundInfo | null;
  hasImage: boolean;
}

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
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        inputMode="numeric"
      />
    </label>
  );
}

export function SettingsPanel({ settings: s, update, setOrientation, setWidth, setHeight, setLongest, bgInfo, hasImage }: Props) {
  return (
    <>
      <div className="field">
        <span className="field-label">Orientation</span>
        <div className="segmented" role="group" aria-label="Orientation">
          <button type="button" className={s.orientation === 'wall' ? 'is-active' : ''} onClick={() => setOrientation('wall')}>
            Wall <span className="muted small">vertical</span>
          </button>
          <button type="button" className={s.orientation === 'floor' ? 'is-active' : ''} onClick={() => setOrientation('floor')}>
            Floor <span className="muted small">horizontal</span>
          </button>
        </div>
      </div>

      <div className="size-row">
        <NumberField label="Width" value={s.width} max={MAX_SIDE} onCommit={setWidth} />
        <button
          type="button"
          className={`icon-btn lock ${s.lockAspect ? 'is-active' : ''}`}
          onClick={() => update({ lockAspect: !s.lockAspect })}
          title={s.lockAspect ? 'Aspect ratio locked' : 'Aspect ratio unlocked (image is stretched)'}
          aria-label="Lock aspect ratio"
          aria-pressed={s.lockAspect}
        >
          <Icon name={s.lockAspect ? 'lock' : 'unlock'} size={16} />
        </button>
        <NumberField label={s.orientation === 'wall' ? 'Height' : 'Length'} value={s.height} max={maxHeightFor(s.orientation)} onCommit={setHeight} />
      </div>
      <div className="chips">
        {[16, 32, 64, 128, 256].map((n) => (
          <button key={n} type="button" className="chip" onClick={() => setLongest(n)}>
            {n}
          </button>
        ))}
      </div>
      <p className="small muted">
        {`${(s.width * s.height).toLocaleString()} blocks at most. `}
        {s.orientation === 'wall' ? `Walls are limited to ${maxHeightFor('wall')} tall (build height).` : 'Max 1024 per side.'}
      </p>

      {hasImage && (
        <>
          <div className="field">
            <span className="field-label">Resize</span>
            <div className="segmented" role="group" aria-label="Resize mode">
              <button type="button" className={s.resize === 'smooth' ? 'is-active' : ''} onClick={() => update({ resize: 'smooth' })}>
                Smooth <span className="muted small">photos</span>
              </button>
              <button type="button" className={s.resize === 'sharp' ? 'is-active' : ''} onClick={() => update({ resize: 'sharp' })}>
                Sharp <span className="muted small">pixel art</span>
              </button>
            </div>
          </div>
          <div className="field">
            <label className="check-row">
              <input type="checkbox" checked={s.bgOn} onChange={(e) => update({ bgOn: e.target.checked })} />
              <span>Remove background</span>
              {bgInfo?.color && (
                <span className="bg-detected muted small" title={`Detected background rgb(${bgInfo.color.join(', ')})`}>
                  bg <span className="color-dot" style={{ background: `rgb(${bgInfo.color.join(',')})` }} /> ·{' '}
                  {Math.round(bgInfo.removed * 100)}% removed
                </span>
              )}
            </label>
            {s.bgOn && (
              <>
                <div className="slider-row">
                  <span className="muted small">Tolerance</span>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    value={s.bgTolerance}
                    onChange={(e) => update({ bgTolerance: Number(e.target.value) })}
                    aria-label="Background tolerance"
                  />
                  <span className="num small">{s.bgTolerance}</span>
                </div>
                <div className="segmented small" role="group" aria-label="Background removal mode">
                  <button type="button" className={s.bgMode === 'edges' ? 'is-active' : ''} onClick={() => update({ bgMode: 'edges' })}>
                    Outside only
                  </button>
                  <button type="button" className={s.bgMode === 'all' ? 'is-active' : ''} onClick={() => update({ bgMode: 'all' })}>
                    Everywhere
                  </button>
                </div>
                <p className="small muted">
                  {s.bgMode === 'edges'
                    ? 'Removes the edge colour where it touches the border. Enclosed areas, like white letters, stay.'
                    : 'Removes that colour everywhere, including holes inside letters.'}{' '}
                  Raise the tolerance if a fringe is left around the edges. After manual edits it erases the background from
                  your current canvas and keeps the edits (Ctrl+Z undoes it).
                </p>
                {bgInfo && !bgInfo.color && (
                  <p className="note warn">
                    No single background colour along the edges, or they are already transparent. Nothing was removed.
                  </p>
                )}
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}

const DITHER: { id: DitherMode; label: string; hint: string }[] = [
  { id: 'off', label: 'Off', hint: 'Each pixel becomes its nearest block.' },
  { id: 'diffusion', label: 'Smooth', hint: 'Error diffusion: mixes blocks for smooth gradients (looks grainy up close).' },
  { id: 'ordered', label: 'Pattern', hint: 'A regular checker-like pattern: tidier in game and easier to build by hand.' },
];

/** How pixels are matched to blocks (only for images). */
export function MatchingPanel({ settings: s, update }: { settings: ArtSettings; update: Update }) {
  return (
    <>
      <div className="field">
        <div className="slider-label">
          <span className="field-label">Prefer smooth textures</span>
          <span className="num small">{s.smoothness}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={s.smoothness}
          onChange={(e) => update({ smoothness: Number(e.target.value) })}
          aria-label="Prefer smooth textures"
        />
        <p className="small muted">
          Avoids noisy or patterned blocks (ores, glazed terracotta, logs) unless they match much better. Pixel art reads
          cleaner from a distance.
        </p>
      </div>

      <div className="field">
        <span className="field-label">Dithering</span>
        <div className="segmented small" role="group" aria-label="Dithering">
          {DITHER.map((d) => (
            <button key={d.id} type="button" className={s.dither === d.id ? 'is-active' : ''} onClick={() => update({ dither: d.id })} title={d.hint}>
              {d.label}
            </button>
          ))}
        </div>
        {s.dither !== 'off' && (
          <div className="slider-row">
            <span className="muted small">Strength</span>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={Math.round(s.ditherStrength * 100)}
              onChange={(e) => update({ ditherStrength: Number(e.target.value) / 100 })}
              aria-label="Dithering strength"
            />
            <span className="num small">{Math.round(s.ditherStrength * 100)}%</span>
          </div>
        )}
        <p className="small muted">{DITHER.find((d) => d.id === s.dither)?.hint}</p>
      </div>

      <div className="field">
        <label className="check-row">
          <input type="checkbox" checked={s.maxTypesOn} onChange={(e) => update({ maxTypesOn: e.target.checked })} />
          <span>Limit block types</span>
          <span className="muted small">fewer blocks to collect</span>
        </label>
        {s.maxTypesOn && (
          <div className="slider-row">
            <span className="muted small">At most</span>
            <input
              type="range"
              min={MAX_TYPES_MIN}
              max={MAX_TYPES_MAX}
              value={s.maxTypes}
              onChange={(e) => update({ maxTypes: Number(e.target.value) })}
              aria-label="Maximum block types"
            />
            <span className="num small">{s.maxTypes}</span>
          </div>
        )}
      </div>
    </>
  );
}
