import { useState } from 'react';
import { BLOCKS } from '../data';
import type { ClipTransform } from '../core/shapes';
import type { Orientation } from '../core/types';
import { BlockPicker } from './BlockPicker';
import { BlockSwatch } from './BlockSwatch';
import type { SelectionInfo, Tool, ViewMode } from './Editor';
import { Icon } from './Icon';

type ToolDef = { id: Tool; icon: string; label: string; key: string };
/** Grouped for the tool rail: painting, then picking/selecting/measuring. */
const TOOL_GROUPS: ToolDef[][] = [
  [
    { id: 'brush', icon: 'brush', label: 'Brush', key: 'B' },
    { id: 'eraser', icon: 'eraser', label: 'Eraser (sets air)', key: 'E' },
    { id: 'line', icon: 'line', label: 'Line (Shift = straight or 45°)', key: 'L' },
    { id: 'rect', icon: 'rect', label: 'Rectangle (Shift = square)', key: 'U' },
    { id: 'fill', icon: 'fill', label: 'Flood fill', key: 'G' },
    { id: 'replace', icon: 'replace', label: 'Replace all of the clicked block', key: 'R' },
  ],
  [
    { id: 'picker', icon: 'picker', label: 'Pick block (or right-click)', key: 'I' },
    { id: 'select', icon: 'select', label: 'Select: drag to select, drag inside to move, Ctrl+C / X / V, Delete', key: 'S' },
    { id: 'measure', icon: 'measure', label: 'Measure: drag between blocks (Shift = straight line, Esc clears)', key: 'M' },
  ],
];

interface RailProps {
  tool: Tool;
  setTool: (t: Tool) => void;
  selection: SelectionInfo;
  onTransform: (op: ClipTransform) => void;
  disabled: boolean;
}

/** Vertical tool buttons beside the canvas, plus flip / rotate. */
export function ToolRail({ tool, setTool, selection: sel, onTransform, disabled }: RailProps) {
  const hasSel = !!(sel.rect || sel.floating);
  const target = hasSel ? 'the selection' : 'the whole art';
  return (
    <div className="toolrail" role="toolbar" aria-label="Tools" aria-orientation="vertical">
      {TOOL_GROUPS.map((group, gi) => (
        <div key={gi} className="toolrail-group">
          {group.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`icon-btn ${tool === t.id ? 'is-active' : ''}`}
              onClick={() => setTool(t.id)}
              title={`${t.label} (${t.key})`}
              aria-label={t.label}
              aria-pressed={tool === t.id}
              disabled={disabled}
            >
              <Icon name={t.icon} />
            </button>
          ))}
        </div>
      ))}
      <div className="toolrail-group">
        <button type="button" className="icon-btn" onClick={() => onTransform('flipH')} disabled={disabled} title={`Flip ${target} horizontally`} aria-label="Flip horizontally">
          <Icon name="flipH" />
        </button>
        <button type="button" className="icon-btn" onClick={() => onTransform('flipV')} disabled={disabled} title={`Flip ${target} vertically`} aria-label="Flip vertically">
          <Icon name="flipV" />
        </button>
        <button type="button" className="icon-btn" onClick={() => onTransform('rot180')} disabled={disabled} title={`Turn ${target} 180°`} aria-label="Rotate 180 degrees">
          <Icon name="rot180" />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => onTransform('rotCW')}
          disabled={disabled || !hasSel}
          title={hasSel ? 'Turn the selection 90° clockwise' : 'Select an area to turn it 90° (turn whole builds with //rotate in game)'}
          aria-label="Rotate 90 degrees clockwise"
        >
          <Icon name="rotCW" />
        </button>
      </div>
    </div>
  );
}

/** Tools that use the size slider. */
export const SIZED_TOOLS: Tool[] = ['brush', 'eraser', 'line', 'rect'];

interface Props {
  tool: Tool;
  brushSize: number;
  setBrushSize: (n: number) => void;
  rectFilled: boolean;
  setRectFilled: (v: boolean) => void;
  currentBlock: number;
  recent: number[];
  onSelectBlock: (value: number) => void;
  orientation: Orientation;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  selection: SelectionInfo;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDelete: () => void;
  hasOverlay: boolean;
  overlayOn: boolean;
  setOverlayOn: (v: boolean) => void;
  overlayOpacity: number;
  setOverlayOpacity: (v: number) => void;
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
  const sel = p.selection;

  return (
    <div className="toolbar" role="toolbar" aria-label="Tool options and view">
      <div className="tool-group brush-size" title="Brush and line size ([ and ])">
        <span className="muted small size-label">Size</span>
        <input
          type="range"
          min={1}
          max={5}
          value={p.brushSize}
          onChange={(e) => p.setBrushSize(Number(e.target.value))}
          disabled={p.disabled || !SIZED_TOOLS.includes(p.tool)}
          aria-label="Brush size"
        />
        <span className="num">{p.brushSize}</span>
        {p.tool === 'rect' && (
          <button
            type="button"
            className={`icon-btn ${p.rectFilled ? 'is-active' : ''}`}
            onClick={() => p.setRectFilled(!p.rectFilled)}
            title={p.rectFilled ? 'Filled rectangle (click for outline)' : 'Outline (click for filled)'}
            aria-label="Filled rectangle"
            aria-pressed={p.rectFilled}
          >
            <Icon name={p.rectFilled ? 'rectFilled' : 'rect'} />
          </button>
        )}
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

      {p.tool === 'select' && (
        <div className="tool-group">
          <button type="button" className="icon-btn" onClick={p.onCopy} disabled={!sel.rect} title="Copy (Ctrl+C)" aria-label="Copy">
            <Icon name="copy" />
          </button>
          <button type="button" className="icon-btn" onClick={p.onCut} disabled={!sel.rect} title="Cut (Ctrl+X)" aria-label="Cut">
            <Icon name="cut" />
          </button>
          <button type="button" className="icon-btn" onClick={p.onPaste} disabled={!sel.clipboard} title="Paste (Ctrl+V): air in the pasted part is see-through" aria-label="Paste">
            <Icon name="paste" />
          </button>
          <button type="button" className="icon-btn" onClick={p.onDelete} disabled={!sel.rect} title="Clear to air (Delete)" aria-label="Clear selection">
            <Icon name="trash" />
          </button>
        </div>
      )}

      <div className="tool-group">
        <button type="button" className="icon-btn" onClick={p.onUndo} disabled={!p.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
          <Icon name="undo" />
        </button>
        <button type="button" className="icon-btn" onClick={p.onRedo} disabled={!p.canRedo} title="Redo (Ctrl+Y)" aria-label="Redo">
          <Icon name="redo" />
        </button>
      </div>

      <div className="tool-group push-right">
        {p.hasOverlay && (
          <>
            <button
              type="button"
              className={`icon-btn ${p.overlayOn ? 'is-active' : ''}`}
              onClick={() => p.setOverlayOn(!p.overlayOn)}
              title="Show the source image over the blocks (O)"
              aria-label="Source image overlay"
              aria-pressed={p.overlayOn}
            >
              <Icon name="overlay" />
            </button>
            {p.overlayOn && (
              <input
                className="overlay-opacity"
                type="range"
                min={10}
                max={100}
                step={5}
                value={Math.round(p.overlayOpacity * 100)}
                onChange={(e) => p.setOverlayOpacity(Number(e.target.value) / 100)}
                aria-label="Overlay opacity"
                title={`Overlay opacity ${Math.round(p.overlayOpacity * 100)}%`}
              />
            )}
          </>
        )}
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
