import { useEffect, useState } from 'react';
import type { BackgroundMode } from '../core/background';
import type { ResizeMode } from '../core/resample';
import type { Orientation } from '../core/types';
import type { BackgroundInfo } from '../worker/generate.worker';
import { Icon } from './Icon';
import { MAX_SIDE, maxHeightFor, type Size } from './size';

interface Props {
  orientation: Orientation;
  setOrientation: (o: Orientation) => void;
  size: Size;
  setWidth: (w: number) => void;
  setHeight: (h: number) => void;
  setLongest: (n: number) => void;
  lockAspect: boolean;
  setLockAspect: (v: boolean) => void;
  resize: ResizeMode;
  setResize: (m: ResizeMode) => void;
  ditherOn: boolean;
  setDitherOn: (v: boolean) => void;
  ditherStrength: number;
  setDitherStrength: (v: number) => void;
  bgOn: boolean;
  setBgOn: (v: boolean) => void;
  bgTolerance: number;
  setBgTolerance: (v: number) => void;
  bgMode: BackgroundMode;
  setBgMode: (m: BackgroundMode) => void;
  /** Result of the last generation (null until it ran with background removal on). */
  bgInfo: BackgroundInfo | null;
  hasImage: boolean;
}

/** Number input that only commits on blur/Enter, so typing "128" doesn't regenerate at 1 and 12. */
function NumberField({ label, value, max, onCommit }: { label: string; value: number; max: number; onCommit: (n: number) => void }) {
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
        min={1}
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

export function SettingsPanel(p: Props) {
  return (
    <>
      <div className="field">
        <span className="field-label">Orientation</span>
        <div className="segmented" role="group" aria-label="Orientation">
          <button type="button" className={p.orientation === 'wall' ? 'is-active' : ''} onClick={() => p.setOrientation('wall')}>
            Wall <span className="muted small">vertical</span>
          </button>
          <button type="button" className={p.orientation === 'floor' ? 'is-active' : ''} onClick={() => p.setOrientation('floor')}>
            Floor <span className="muted small">horizontal</span>
          </button>
        </div>
      </div>

      <div className="size-row">
        <NumberField label="Width" value={p.size.width} max={MAX_SIDE} onCommit={p.setWidth} />
        <button
          type="button"
          className={`icon-btn lock ${p.lockAspect ? 'is-active' : ''}`}
          onClick={() => p.setLockAspect(!p.lockAspect)}
          title={p.lockAspect ? 'Aspect ratio locked' : 'Aspect ratio unlocked (image is stretched)'}
          aria-label="Lock aspect ratio"
          aria-pressed={p.lockAspect}
        >
          <Icon name={p.lockAspect ? 'lock' : 'unlock'} size={16} />
        </button>
        <NumberField label={p.orientation === 'wall' ? 'Height' : 'Length'} value={p.size.height} max={maxHeightFor(p.orientation)} onCommit={p.setHeight} />
      </div>
      <div className="chips">
        {[16, 32, 64, 128, 256].map((n) => (
          <button key={n} type="button" className="chip" onClick={() => p.setLongest(n)}>
            {n}
          </button>
        ))}
      </div>
      <p className="small muted">
        {p.size.width * p.size.height > 0 && `${(p.size.width * p.size.height).toLocaleString()} blocks at most. `}
        {p.orientation === 'wall' ? `Walls are limited to ${maxHeightFor('wall')} tall (build height).` : 'Max 1024 per side.'}
      </p>

      {p.hasImage && (
        <>
          <div className="field">
            <span className="field-label">Resize</span>
            <div className="segmented" role="group" aria-label="Resize mode">
              <button type="button" className={p.resize === 'smooth' ? 'is-active' : ''} onClick={() => p.setResize('smooth')}>
                Smooth <span className="muted small">photos</span>
              </button>
              <button type="button" className={p.resize === 'sharp' ? 'is-active' : ''} onClick={() => p.setResize('sharp')}>
                Sharp <span className="muted small">pixel art</span>
              </button>
            </div>
          </div>
          <div className="field">
            <label className="check-row">
              <input type="checkbox" checked={p.bgOn} onChange={(e) => p.setBgOn(e.target.checked)} />
              <span>Remove background</span>
              {p.bgInfo?.color && (
                <span className="bg-detected muted small" title={`Detected background rgb(${p.bgInfo.color.join(', ')})`}>
                  bg <span className="color-dot" style={{ background: `rgb(${p.bgInfo.color.join(',')})` }} /> ·{' '}
                  {Math.round(p.bgInfo.removed * 100)}% removed
                </span>
              )}
            </label>
            {p.bgOn && (
              <>
                <div className="slider-row">
                  <span className="muted small">Tolerance</span>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    value={p.bgTolerance}
                    onChange={(e) => p.setBgTolerance(Number(e.target.value))}
                    aria-label="Background tolerance"
                  />
                  <span className="num small">{p.bgTolerance}</span>
                </div>
                <div className="segmented small" role="group" aria-label="Background removal mode">
                  <button type="button" className={p.bgMode === 'edges' ? 'is-active' : ''} onClick={() => p.setBgMode('edges')}>
                    Outside only
                  </button>
                  <button type="button" className={p.bgMode === 'all' ? 'is-active' : ''} onClick={() => p.setBgMode('all')}>
                    Everywhere
                  </button>
                </div>
                <p className="small muted">
                  {p.bgMode === 'edges'
                    ? 'Removes the edge colour where it touches the border. Enclosed areas, like white letters, stay.'
                    : 'Removes that colour everywhere, including holes inside letters.'}{' '}
                  Raise the tolerance if a fringe is left around the edges. After manual edits it erases the background from
                  your current canvas and keeps the edits (Ctrl+Z undoes it).
                </p>
                {p.bgInfo && !p.bgInfo.color && (
                  <p className="note warn">
                    No single background colour along the edges, or they are already transparent. Nothing was removed.
                  </p>
                )}
              </>
            )}
          </div>
          <div className="field">
            <label className="check-row">
              <input type="checkbox" checked={p.ditherOn} onChange={(e) => p.setDitherOn(e.target.checked)} />
              <span>Dithering</span>
              <span className="muted small">mixes blocks for smoother gradients</span>
            </label>
            {p.ditherOn && (
              <div className="slider-row">
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={Math.round(p.ditherStrength * 100)}
                  onChange={(e) => p.setDitherStrength(Number(e.target.value) / 100)}
                  aria-label="Dithering strength"
                />
                <span className="num small">{Math.round(p.ditherStrength * 100)}%</span>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
