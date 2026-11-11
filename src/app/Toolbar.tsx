import type { ReactNode } from 'react';
import {
  Brush, ClipboardPaste, Copy, Eraser, FlipHorizontal2, FlipVertical2, Grid3x3, Layers, PaintBucket, Pipette, Redo2, Replace, RotateCw,
  Ruler, RulerDimensionLine, Scan, Scissors, Slash, Square, SquareDashed, SquareSquare, Trash2, Undo2, Image as ImageIcon, RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { IconButton } from '@/components/icon-button';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import type { ClipTransform } from '../core/shapes';
import type { Orientation } from '../core/types';
import { BlockPicker } from './BlockPicker';
import type { SelectionInfo, Tool, ViewMode } from './Editor';

type ToolDef = { id: Tool; icon: LucideIcon; label: string; key: string; hint?: string };
/** Grouped for the tool rail: painting, then picking/selecting/measuring. */
const TOOL_GROUPS: ToolDef[][] = [
  [
    { id: 'brush', icon: Brush, label: 'Brush', key: 'B' },
    { id: 'eraser', icon: Eraser, label: 'Eraser', key: 'E' },
    { id: 'line', icon: Slash, label: 'Line', key: 'L', hint: 'Shift snaps to 45°' },
    { id: 'rect', icon: Square, label: 'Rectangle', key: 'U', hint: 'Shift makes a square' },
    { id: 'fill', icon: PaintBucket, label: 'Fill', key: 'G' },
    { id: 'replace', icon: Replace, label: 'Replace all', key: 'R' },
  ],
  [
    { id: 'picker', icon: Pipette, label: 'Pick block', key: 'I', hint: 'Or right-click' },
    { id: 'select', icon: SquareDashed, label: 'Select', key: 'S', hint: 'Drag inside to move' },
    { id: 'measure', icon: RulerDimensionLine, label: 'Measure', key: 'M', hint: 'Shift keeps it straight' },
  ],
];

/** A vertical or horizontal run of buttons, divided from the next by a line. */
function Group({ children, vertical }: { children: ReactNode; vertical?: boolean }) {
  return <div className={vertical ? 'flex flex-col gap-1' : 'flex shrink-0 items-center gap-1'}>{children}</div>;
}

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
  const target = hasSel ? 'selection' : 'whole art';
  return (
    <div className="flex shrink-0 flex-col gap-2 overflow-y-auto border-r p-1.5" role="toolbar" aria-label="Tools" aria-orientation="vertical">
      {TOOL_GROUPS.map((group, gi) => (
        <div key={gi} className="contents">
          {gi > 0 && <Separator />}
          <Group vertical>
            {group.map((t) => (
              <IconButton
                key={t.id}
                icon={t.icon}
                label={t.label}
                shortcut={t.key}
                hint={t.hint}
                pressed={tool === t.id}
                onClick={() => setTool(t.id)}
                disabled={disabled}
                tooltipSide="right"
              />
            ))}
          </Group>
        </div>
      ))}
      <Separator />
      <Group vertical>
        <IconButton icon={FlipHorizontal2} label="Flip horizontally" hint={`Flips the ${target}`} onClick={() => onTransform('flipH')} disabled={disabled} tooltipSide="right" />
        <IconButton icon={FlipVertical2} label="Flip vertically" hint={`Flips the ${target}`} onClick={() => onTransform('flipV')} disabled={disabled} tooltipSide="right" />
        <IconButton icon={RefreshCw} label="Turn 180°" hint={`Turns the ${target}`} onClick={() => onTransform('rot180')} disabled={disabled} tooltipSide="right" />
        <IconButton icon={RotateCw} label="Turn 90°" hint="Needs a selection" onClick={() => onTransform('rotCW')} disabled={disabled || !hasSel} tooltipSide="right" />
      </Group>
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

/** The row above the canvas: tool options on the left, view options on the right. */
export function Toolbar(p: Props) {
  const sel = p.selection;
  return (
    <ToolbarRow>
      <Group>
        <BlockPicker value={p.currentBlock} onSelect={p.onSelectBlock} orientation={p.orientation} recent={p.recent} disabled={p.disabled} />
      </Group>
      <Group>
        <Slider
          className="w-20"
          min={1}
          max={5}
          value={[p.brushSize]}
          onValueChange={([v]) => p.setBrushSize(v)}
          disabled={p.disabled || !SIZED_TOOLS.includes(p.tool)}
          aria-label="Brush size"
        />
        <span className="w-4 text-center tabular-nums text-muted-foreground">{p.brushSize}</span>
        {p.tool === 'rect' && (
          <IconButton icon={SquareSquare} label="Filled rectangle" pressed={p.rectFilled} onClick={() => p.setRectFilled(!p.rectFilled)} />
        )}
      </Group>

      {p.tool === 'select' && (
        <Group>
          <IconButton icon={Copy} label="Copy" shortcut="Ctrl+C" onClick={p.onCopy} disabled={!sel.rect} />
          <IconButton icon={Scissors} label="Cut" shortcut="Ctrl+X" onClick={p.onCut} disabled={!sel.rect} />
          <IconButton icon={ClipboardPaste} label="Paste" shortcut="Ctrl+V" onClick={p.onPaste} disabled={!sel.clipboard} />
          <IconButton icon={Trash2} label="Clear to air" shortcut="Del" onClick={p.onDelete} disabled={!sel.rect} />
        </Group>
      )}

      <Group>
        <IconButton icon={Undo2} label="Undo" shortcut="Ctrl+Z" onClick={p.onUndo} disabled={!p.canUndo} />
        <IconButton icon={Redo2} label="Redo" shortcut="Ctrl+Y" onClick={p.onRedo} disabled={!p.canRedo} />
      </Group>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {p.hasOverlay && (
          <>
            {p.overlayOn && (
              <Slider
                className="w-16"
                min={10}
                max={100}
                step={5}
                value={[Math.round(p.overlayOpacity * 100)]}
                onValueChange={([v]) => p.setOverlayOpacity(v / 100)}
                aria-label="Overlay opacity"
              />
            )}
            <IconButton icon={ImageIcon} label="Show source image" shortcut="O" pressed={p.overlayOn} onClick={() => p.setOverlayOn(!p.overlayOn)} />
          </>
        )}
        <IconButton
          icon={Layers}
          label="Textures"
          hint="Off shows flat colours"
          pressed={p.viewMode === 'textures'}
          onClick={() => p.setViewMode(p.viewMode === 'textures' ? 'colors' : 'textures')}
        />
        <IconButton icon={Grid3x3} label="Grid" pressed={p.showGrid} onClick={() => p.setShowGrid(!p.showGrid)} />
        <IconButton icon={Ruler} label="Rulers" pressed={p.showRulers} onClick={() => p.setShowRulers(!p.showRulers)} />
        <IconButton icon={Scan} label="Fit to view" shortcut="F" onClick={p.onFit} disabled={p.disabled} />
      </div>
    </ToolbarRow>
  );
}

/** One fixed-height row: a wrapping toolbar would shift the canvas under the cursor. */
export function ToolbarRow({ children }: { children: ReactNode }) {
  return (
    <div className="@container flex h-12 shrink-0 items-center gap-4 overflow-x-auto overflow-y-hidden border-b px-3 [scrollbar-width:thin]" role="toolbar" aria-label="Tool options and view">
      {children}
    </div>
  );
}
