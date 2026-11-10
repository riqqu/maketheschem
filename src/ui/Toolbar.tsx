import { useState } from 'react';
import { BLOCKS } from '../data';
import type { Orientation } from '../core/types';
import { BlockPicker } from './BlockPicker';
import { BlockSwatch } from './BlockSwatch';
import type { Tool, ViewMode } from './Editor';
import { Icon } from './Icon';

const TOOLS: { id: Tool; icon: string; label: string; key: string }[] = [
  { id: 'brush', icon: 'brush', label: 'Brush', key: 'B' },
  { id: 'eraser', icon: 'eraser', label: 'Eraser (sets air)', key: 'E' },
  { id: 'picker', icon: 'picker', label: 'Pick block (or right-click)', key: 'I' },
  { id: 'fill', icon: 'fill', label: 'Flood fill', key: 'G' },
  { id: 'replace', icon: 'replace', label: 'Replace all of the clicked block', key: 'R' },
  { id: 'measure', icon: 'measure', label: 'Measure: drag between blocks (Shift = straight line, Esc clears)', key: 'M' },
];

interface Props {
  tool: Tool;
  setTool: (t: Tool) => void;
  brushSize: number;
  setBrushSize: (n: number) => void;
  currentBlock: number;
  recent: number[];
  onSelectBlock: (value: number) => void;
  orientation: Orientation;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  showGrid: boolean;
  setShowGrid: (v: boolean) => void;
  showRulers: boolean;
  setShowRulers: (v: boolean) => void;
  onFit: () => void;
  disabled: boolean;
}

export function Toolbar(p: Props) {
  // Picker is position: fixed so the (horizontally scrollable) toolbar never clips it.
  const [pickerAt, setPickerAt] = useState<{ top: number; left: number } | null>(null);
  const block = BLOCKS[p.currentBlock] ?? null;
  const togglePicker = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (pickerAt) return setPickerAt(null);
    const r = e.currentTarget.getBoundingClientRect();
    setPickerAt({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 372)) });
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Editing tools">
      <div className="tool-group">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`icon-btn ${p.tool === t.id ? 'is-active' : ''}`}
            onClick={() => p.setTool(t.id)}
            title={`${t.label} (${t.key})`}
            aria-label={t.label}
            aria-pressed={p.tool === t.id}
            disabled={p.disabled}
          >
            <Icon name={t.icon} />
          </button>
        ))}
      </div>

      <div className="tool-group brush-size" title="Brush size ([ and ])">
        <span className="muted small">Size</span>
        <input
          type="range"
          min={1}
          max={5}
          value={p.brushSize}
          onChange={(e) => p.setBrushSize(Number(e.target.value))}
          disabled={p.disabled || (p.tool !== 'brush' && p.tool !== 'eraser')}
          aria-label="Brush size"
        />
        <span className="num">{p.brushSize}</span>
      </div>

      <div className="tool-group">
        <button
          type="button"
          className="block-chip"
          onClick={togglePicker}
          aria-expanded={!!pickerAt}
          disabled={p.disabled}
          title={`Brush block: ${block?.name ?? 'Air'}`}
        >
          <BlockSwatch block={block} orientation={p.orientation} size={22} />
          <span className="chip-name">{block?.name ?? 'Air'}</span>
          <Icon name="chevron" size={14} />
        </button>
        {pickerAt && (
          <BlockPicker
            orientation={p.orientation}
            current={p.currentBlock}
            recent={p.recent}
            style={pickerAt}
            onSelect={(v) => {
              p.onSelectBlock(v);
              setPickerAt(null);
            }}
            onClose={() => setPickerAt(null)}
          />
        )}
      </div>

      <div className="tool-group">
        <button type="button" className="icon-btn" onClick={p.onUndo} disabled={!p.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
          <Icon name="undo" />
        </button>
        <button type="button" className="icon-btn" onClick={p.onRedo} disabled={!p.canRedo} title="Redo (Ctrl+Y)" aria-label="Redo">
          <Icon name="redo" />
        </button>
      </div>

      <div className="tool-group push-right">
        <button
          type="button"
          className={`icon-btn ${p.viewMode === 'textures' ? 'is-active' : ''}`}
          onClick={() => p.setViewMode(p.viewMode === 'textures' ? 'colors' : 'textures')}
          title={p.viewMode === 'textures' ? 'Showing block textures (click for flat colors)' : 'Showing flat colors (click for textures)'}
          aria-label="Show block textures"
          aria-pressed={p.viewMode === 'textures'}
        >
          <Icon name="texture" />
        </button>
        <button
          type="button"
          className={`icon-btn ${p.showGrid ? 'is-active' : ''}`}
          onClick={() => p.setShowGrid(!p.showGrid)}
          title="Grid lines"
          aria-label="Grid lines"
          aria-pressed={p.showGrid}
        >
          <Icon name="grid" />
        </button>
        <button
          type="button"
          className={`icon-btn ${p.showRulers ? 'is-active' : ''}`}
          onClick={() => p.setShowRulers(!p.showRulers)}
          title="Rulers: block distances along the top and right edges"
          aria-label="Rulers"
          aria-pressed={p.showRulers}
        >
          <Icon name="ruler" />
        </button>
        <button type="button" className="icon-btn" onClick={p.onFit} title="Fit to view (F)" aria-label="Fit to view" disabled={p.disabled}>
          <Icon name="fit" />
        </button>
      </div>
    </div>
  );
}
