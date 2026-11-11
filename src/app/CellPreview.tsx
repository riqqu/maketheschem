import { useMemo } from 'react';
import { clampBrush, type BrushShape } from '../core/brush';
import { brushCells, createGrid } from '../core/grid';
import { rectCells } from '../core/shapes';

/** Merges row-major cell indices into one rectangle per horizontal run. */
function runsPath(cells: readonly number[], width: number): string {
  let d = '';
  for (let i = 0; i < cells.length; ) {
    const y = Math.floor(cells[i] / width);
    const x = cells[i] - y * width;
    let len = 1;
    while (i + len < cells.length && cells[i + len] === cells[i] + len && x + len < width) len++;
    d += `M${x} ${y}h${len}v1h-${len}z`;
    i += len;
  }
  return d;
}

/** A small picture of block cells in the text colour: one square per block, as large as fits (at most 8px). */
function CellPreview({ cells, width, height }: { cells: readonly number[]; width: number; height: number }) {
  const d = useMemo(() => runsPath(cells, width), [cells, width]);
  const cell = Math.min(8, 112 / Math.max(width, height));
  return (
    <svg width={width * cell} height={height * cell} viewBox={`0 0 ${width} ${height}`} shapeRendering="crispEdges" aria-hidden>
      <path d={d} fill="currentColor" />
    </svg>
  );
}

/** What one click of a brush paints. */
export function BrushPreview({ size, shape }: { size: number; shape: BrushShape }) {
  const n = clampBrush(size);
  const cells = useMemo(() => {
    const mid = Math.floor((n - 1) / 2); // puts the brush's first cell at 0
    return brushCells(createGrid(n, n), mid, mid, n, shape);
  }, [n, shape]);
  return <CellPreview cells={cells} width={n} height={n} />;
}

const RECT_W = 24;
const RECT_H = 16;

/** A rectangle drawn with the current options, on a small canvas. */
export function RectPreview({ filled, thickness, rounding }: { filled: boolean; thickness: number; rounding: number }) {
  const cells = useMemo(
    () => rectCells(createGrid(RECT_W, RECT_H), { x: 1, y: 1 }, { x: RECT_W - 2, y: RECT_H - 2 }, filled, thickness, rounding),
    [filled, thickness, rounding],
  );
  return <CellPreview cells={cells} width={RECT_W} height={RECT_H} />;
}
