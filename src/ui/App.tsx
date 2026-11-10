import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ATLAS_URL, BLOCKS, blockData, blockIndexById, defaultEnabledIds } from '../data';
import type { BackgroundMode } from '../core/background';
import { countBlocks, createGrid, History, resizeGrid, type Grid } from '../core/grid';
import { measureSummary, type Measurement } from '../core/measure';
import type { ResizeMode } from '../core/resample';
import { cellToBlockPos } from '../core/schem';
import { AIR, faceOf, type Orientation } from '../core/types';
import { ACCEPTED_TYPES, loadImageFile, type LoadedImage } from '../lib/image';
import { loadJSON, saveJSON } from '../lib/storage';
import type { BackgroundInfo } from '../worker/generate.worker';
import { BlockPalettePanel } from './BlockPalettePanel';
import { Editor, type Tool, type ViewMode } from './Editor';
import { ExportPanel, sanitizeName } from './ExportPanel';
import { Icon } from './Icon';
import { ImagePanel } from './ImagePanel';
import { MaterialsList } from './MaterialsList';
import { SettingsPanel } from './SettingsPanel';
import { clampSize, MAX_SIDE, maxHeightFor, sizeFromHeight, sizeFromLongest, sizeFromWidth, type Size } from './size';
import { Toolbar } from './Toolbar';
import { useGenerator } from './useGenerator';

const LS_ENABLED = 'mts.enabled.v1';
const LS_ORIENTATION = 'mts.orientation';

function useAtlas() {
  const [atlas, setAtlas] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setAtlas(img);
    img.src = ATLAS_URL;
  }, []);
  return atlas;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 4 4" aria-hidden="true" shapeRendering="crispEdges">
      <rect width="2" height="2" fill="#35a7c4" />
      <rect x="2" width="2" height="2" fill="#f0b020" />
      <rect y="2" width="2" height="2" fill="#a03030" />
      <rect x="2" y="2" width="2" height="2" fill="#508030" />
    </svg>
  );
}

const TOOL_KEYS: Record<string, Tool> = { b: 'brush', e: 'eraser', i: 'picker', g: 'fill', r: 'replace', m: 'measure' };
const LS_RULERS = 'mts.rulers';

export default function App() {
  const atlas = useAtlas();
  const gen = useGenerator();
  const history = useRef(new History()).current;

  const [image, setImage] = useState<LoadedImage | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [orientation, setOrientationState] = useState<Orientation>(() =>
    loadJSON<Orientation>(LS_ORIENTATION, 'wall') === 'floor' ? 'floor' : 'wall',
  );
  const [size, setSize] = useState<Size>({ width: 64, height: 64 });
  const [lockAspect, setLockAspect] = useState(true);
  const [resize, setResize] = useState<ResizeMode>('smooth');
  const [ditherOn, setDitherOn] = useState(false);
  const [ditherStrength, setDitherStrength] = useState(0.8);
  const [bgOn, setBgOn] = useState(false);
  const [bgTolerance, setBgTolerance] = useState(15);
  const [bgMode, setBgMode] = useState<BackgroundMode>('edges');
  const [bgInfo, setBgInfo] = useState<BackgroundInfo | null>(null);
  const [enabled, setEnabledState] = useState<Set<string>>(() => {
    const saved = loadJSON<string[] | null>(LS_ENABLED, null);
    return new Set((Array.isArray(saved) ? saved : defaultEnabledIds()).filter((id) => blockIndexById.has(id)));
  });

  const [grid, setGrid] = useState<Grid | null>(null);
  const [version, setVersion] = useState(0);
  const [edited, setEdited] = useState(false);
  /** Settings the current grid was made with: everything except background removal, and background removal. */
  const [lastGen, setLastGen] = useState<{ base: string; bg: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Undo step of our own background erase. While it is the newest step, a new erase replaces it (live slider)
  // and switching the option off takes it back. Ids survive undo/redo, so a redone erase is recognised again.
  const [eraseId, setEraseIdState] = useState<number | null>(null);
  const eraseIdRef = useRef<number | null>(null);
  const setEraseId = (id: number | null) => {
    eraseIdRef.current = id;
    setEraseIdState(id);
  };
  const eraseIsTop = () => eraseIdRef.current !== null && history.topId === eraseIdRef.current;

  const [tool, setTool] = useState<Tool>('brush');
  const [brushSize, setBrushSize] = useState(1);
  const [currentBlock, setCurrentBlock] = useState(() => blockIndexById.get('white_concrete') ?? 0);
  const [recent, setRecent] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('textures');
  const [showGrid, setShowGrid] = useState(true);
  const [showRulers, setShowRulersState] = useState(() => loadJSON<boolean>(LS_RULERS, true) !== false);
  const setShowRulers = (v: boolean) => {
    setShowRulersState(v);
    saveJSON(LS_RULERS, v);
  };
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitSignal, setFitSignal] = useState(0);
  const [tab, setTab] = useState<'blocks' | 'materials'>('blocks');
  const [name, setName] = useState('pixel_art');
  const [dragOver, setDragOver] = useState(false);

  // ---- size --------------------------------------------------------------------------------

  const maxH = maxHeightFor(orientation);
  const aspect = image ? image.naturalHeight / image.naturalWidth : size.height / size.width;

  const setWidth = (w: number) =>
    setSize(lockAspect ? sizeFromWidth(w, aspect, MAX_SIDE, maxH) : clampSize({ width: w, height: size.height }, MAX_SIDE, maxH));
  const setHeight = (h: number) =>
    setSize(lockAspect ? sizeFromHeight(h, aspect, MAX_SIDE, maxH) : clampSize({ width: size.width, height: h }, MAX_SIDE, maxH));
  const setLongest = (n: number) =>
    setSize(lockAspect ? sizeFromLongest(n, aspect, MAX_SIDE, maxH) : clampSize({ width: n, height: n }, MAX_SIDE, maxH));

  const setOrientation = (o: Orientation) => {
    setOrientationState(o);
    saveJSON(LS_ORIENTATION, o);
    const mh = maxHeightFor(o);
    if (size.height > mh) setSize(lockAspect ? sizeFromHeight(mh, aspect, MAX_SIDE, mh) : clampSize(size, MAX_SIDE, mh));
  };

  const setEnabled = useCallback((next: Set<string>) => {
    setEnabledState(next);
    saveJSON(LS_ENABLED, [...next]);
  }, []);

  // ---- generation --------------------------------------------------------------------------

  const palette = useMemo(
    () => BLOCKS.flatMap((b, i) => (enabled.has(b.id) ? [{ value: i, rgb: faceOf(b, orientation).rgb }] : [])),
    [enabled, orientation],
  );

  const background = bgOn ? { tolerance: bgTolerance / 100, mode: bgMode } : null;
  const baseKey = image
    ? JSON.stringify([image.key, size.width, size.height, orientation, resize, ditherOn ? ditherStrength : 0, palette.map((p) => p.value)])
    : null;
  const bgKey = JSON.stringify(background);
  const genKey = baseKey && `${baseKey}|${bgKey}`;
  const lastGenKey = lastGen && `${lastGen.base}|${lastGen.bg}`;

  // With manual edits, turning on (or adjusting) background removal acts like the eraser on the current grid:
  // background cells become air, the edits stay, and Ctrl+Z (or switching it off) brings the background back.
  const bgOnlyChange = !!baseKey && edited && !!grid && lastGen?.base === baseKey && lastGen.bg !== bgKey;
  // Every history change bumps `version` and re-renders, so this render-time read stays current.
  const eraseOnTop = eraseId !== null && history.topId === eraseId;
  const eraseOnly = bgOnlyChange && (background !== null || eraseOnTop);
  const stale = !!genKey && edited && genKey !== lastGenKey && !eraseOnly;

  const runGenerate = () => {
    if (!image || !baseKey || palette.length === 0) return;
    const gen0 = { base: baseKey, bg: bgKey };
    const req = { width: size.width, height: size.height, resize, dither: ditherOn ? ditherStrength : 0, palette, background };
    gen.generate(req, (r) => {
      setGrid({ width: r.width, height: r.height, cells: r.cells });
      setBgInfo(r.background);
      history.clear();
      setVersion((v) => v + 1);
      setEdited(false);
      setEraseId(null);
      setLastGen(gen0);
    });
  };
  const runRef = useRef(runGenerate);
  runRef.current = runGenerate;

  const runErase = () => {
    if (!grid || !baseKey) return;
    const target = grid;
    const gen0 = { base: baseKey, bg: bgKey };
    if (!background) {
      // Switched off: take back our own erase; the manual edits underneath stay.
      if (eraseIsTop()) history.undo(target);
      setEraseId(null);
      setVersion((v) => v + 1);
      setBgInfo(null);
      setLastGen(gen0);
      return;
    }
    gen.backgroundMask({ width: target.width, height: target.height, resize, background }, (r) => {
      // Replace the previous background erase instead of stacking, so lowering the tolerance restores cells.
      if (eraseIsTop()) history.undo(target);
      history.begin();
      let erased = 0;
      for (let i = 0; i < r.mask.length; i++) if (r.mask[i] && history.set(target, i, AIR)) erased++;
      setEraseId(history.commit(target) ? history.topId : null);
      setVersion((v) => v + 1);
      setBgInfo(r.background);
      setLastGen(gen0);
      if (erased) setNotice(`Erased ${erased.toLocaleString()} background blocks. Your edits were kept (Ctrl+Z to undo).`);
    });
  };
  const eraseRef = useRef(runErase);
  eraseRef.current = runErase;

  // Regenerate automatically while there are no manual edits to lose; erase in place when there are.
  useEffect(() => {
    if (!genKey || genKey === lastGenKey || palette.length === 0 || (edited && !eraseOnly)) return;
    const t = setTimeout(() => (eraseOnly ? eraseRef.current() : runRef.current()), 150);
    return () => clearTimeout(t);
  }, [genKey, lastGenKey, edited, eraseOnly, palette.length]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Blank canvas: resizing keeps the drawing (top-left anchored).
  useEffect(() => {
    if (image || !grid || (grid.width === size.width && grid.height === size.height)) return;
    setGrid(resizeGrid(grid, size.width, size.height));
    history.clear();
    setVersion((v) => v + 1);
  }, [image, grid, size, history]);

  // ---- image / canvas lifecycle ------------------------------------------------------------

  const confirmDiscard = () => !edited || window.confirm('Discard your manual edits?');

  const onFile = async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setImageError(`“${file.name}” is not a PNG, JPG, GIF or WebP image.`);
      return;
    }
    if (!confirmDiscard()) return;
    try {
      const img = await loadImageFile(file);
      setImageError(null);
      setImage((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return img;
      });
      gen.setSource(img.pixels);
      setEdited(false);
      setEraseId(null);
      setLastGen(null);
      setName(sanitizeName(file.name));
      if (lockAspect) {
        setSize((s) => sizeFromLongest(Math.max(s.width, s.height), img.naturalHeight / img.naturalWidth, MAX_SIDE, maxH));
      }
    } catch (e) {
      setImageError(`Couldn’t read “${file.name}”: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const onFileRef = useRef(onFile);
  onFileRef.current = onFile;

  const startBlank = () => {
    if (!confirmDiscard()) return;
    setImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    gen.setSource(null);
    setGrid(createGrid(size.width, size.height));
    history.clear();
    setVersion((v) => v + 1);
    setEdited(false);
    setEraseId(null);
    setLastGen(null);
    setName('pixel_art');
  };

  // Drop an image anywhere on the page.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragOver(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) onFileRef.current(f);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  // ---- editing -----------------------------------------------------------------------------

  const pushRecent = (v: number) => setRecent((r) => [v, ...r.filter((x) => x !== v)].slice(0, 12));

  const onEdit = useCallback(() => {
    setVersion((v) => v + 1);
    setEdited(true);
  }, []);

  const onPick = useCallback((v: number) => {
    if (v === AIR) return;
    setCurrentBlock(v);
    setRecent((r) => [v, ...r.filter((x) => x !== v)].slice(0, 12));
    setTool((t) => (t === 'picker' || t === 'eraser' ? 'brush' : t));
  }, []);

  const selectBlock = (v: number) => {
    setCurrentBlock(v);
    pushRecent(v);
    if (tool === 'picker' || tool === 'eraser') setTool('brush');
  };

  const undo = () => {
    if (grid && history.undo(grid)) setVersion((v) => v + 1);
  };
  const redo = () => {
    if (grid && history.redo(grid)) setVersion((v) => v + 1);
  };

  // Keyboard shortcuts (ignored while typing in a field).
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    // Ignore shortcuts only while typing; a focused checkbox, slider or button must not swallow Ctrl+Z.
    const typing = 'input:not([type=checkbox]):not([type=range]):not([type=radio]), textarea, select, [contenteditable]';
    if ((e.target as HTMLElement)?.closest?.(typing)) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if ((e.ctrlKey || e.metaKey) && k === 'y') {
      e.preventDefault();
      redo();
    } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if (TOOL_KEYS[k] && grid) setTool(TOOL_KEYS[k]);
      else if (k === '[') setBrushSize((s) => Math.max(1, s - 1));
      else if (k === ']') setBrushSize((s) => Math.min(5, s + 1));
      else if (k === 'f') setFitSignal((n) => n + 1);
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // ---- derived -----------------------------------------------------------------------------

  const counts = useMemo(() => (grid ? countBlocks(grid) : new Map<number, number>()), [grid, version]);
  const blockCount = useMemo(() => [...counts.values()].reduce((a, b) => a + b, 0), [counts]);

  let status: ReactNode = <span className="muted">Hover the canvas to inspect blocks</span>;
  if (grid && hover) {
    const v = grid.cells[hover.y * grid.width + hover.x];
    const pos = cellToBlockPos(hover.x, hover.y, grid.height, orientation);
    status = (
      <>
        <span className="num">
          x {pos.x} · y {pos.y} · z {pos.z}
        </span>
        <span className="status-block">{v === AIR ? 'Air' : BLOCKS[v]?.name}</span>
      </>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span>Make the Schem</span>
        </div>
        <div className="muted small">
          Minecraft Java {blockData.minecraftVersion} · data version {blockData.dataVersion} · {BLOCKS.length} blocks
        </div>
      </header>

      <aside className="sidebar left">
        <Section title="Image">
          <ImagePanel image={image} onFile={onFile} onBlank={startBlank} error={imageError} />
        </Section>
        <Section title="Size & style">
          <SettingsPanel
            orientation={orientation}
            setOrientation={setOrientation}
            size={size}
            setWidth={setWidth}
            setHeight={setHeight}
            setLongest={setLongest}
            lockAspect={lockAspect}
            setLockAspect={setLockAspect}
            resize={resize}
            setResize={setResize}
            ditherOn={ditherOn}
            setDitherOn={setDitherOn}
            ditherStrength={ditherStrength}
            setDitherStrength={setDitherStrength}
            bgOn={bgOn}
            setBgOn={setBgOn}
            bgTolerance={bgTolerance}
            setBgTolerance={setBgTolerance}
            bgMode={bgMode}
            setBgMode={setBgMode}
            bgInfo={bgOn ? bgInfo : null}
            hasImage={!!image}
          />
        </Section>
        <Section title="Export">
          <ExportPanel grid={grid} orientation={orientation} blockCount={blockCount} name={name} setName={setName} />
        </Section>
      </aside>

      <main className="workspace">
        <Toolbar
          tool={tool}
          setTool={setTool}
          brushSize={brushSize}
          setBrushSize={setBrushSize}
          currentBlock={currentBlock}
          recent={recent}
          onSelectBlock={selectBlock}
          orientation={orientation}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={undo}
          onRedo={redo}
          viewMode={viewMode}
          setViewMode={setViewMode}
          showGrid={showGrid}
          setShowGrid={setShowGrid}
          showRulers={showRulers}
          setShowRulers={setShowRulers}
          onFit={() => setFitSignal((n) => n + 1)}
          disabled={!grid}
        />
        <div className="stage">
          {(stale || gen.error || notice) && (
            <div className="stage-banners">
              {notice && !stale && <div className="banner info">{notice}</div>}
              {stale && (
                <div className="banner">
                  <span>Settings changed since your manual edits.</span>
                  <button type="button" className="btn small primary" onClick={() => runRef.current()}>
                    Regenerate
                  </button>
                  <span className="muted small">discards edits</span>
                </div>
              )}
              {gen.error && <div className="banner">Generation failed: {gen.error}</div>}
            </div>
          )}
          <Editor
            grid={grid}
            version={version}
            blocks={BLOCKS}
            orientation={orientation}
            atlas={atlas}
            tileSize={blockData.tileSize}
            atlasColumns={blockData.atlasColumns}
            viewMode={viewMode}
            showGrid={showGrid}
            showRulers={showRulers}
            tool={tool}
            brushSize={brushSize}
            currentBlock={currentBlock}
            history={history}
            fitSignal={fitSignal}
            onEdit={onEdit}
            onPick={onPick}
            onHover={setHover}
            onZoom={setZoom}
            onMeasure={setMeasurement}
          />
          {!grid && (
            <div className="empty">
              <Icon name="image" size={40} />
              <p>
                <strong>Drop an image here</strong> or choose one on the left.
              </p>
              <p className="muted small">It’s matched to Minecraft blocks right in your browser. Nothing is uploaded.</p>
            </div>
          )}
          {gen.busy && <div className="busy">Generating…</div>}
        </div>
        <footer className="statusbar">
          <div className="status-left">
            {status}
            {measurement && (
              <span className="status-measure" title="Esc clears the measurement">
                <Icon name="measure" size={14} /> {measureSummary(measurement, orientation)}
              </span>
            )}
          </div>
          <div className="status-right muted num">
            {grid && `${grid.width} × ${grid.height}`}
            {grid && ` · ${Math.round(zoom * 100) / 100}px/block`}
          </div>
        </footer>
      </main>

      <aside className="sidebar right">
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'blocks'} className={tab === 'blocks' ? 'is-active' : ''} onClick={() => setTab('blocks')}>
            Blocks <span className="badge">{enabled.size}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'materials'}
            className={tab === 'materials' ? 'is-active' : ''}
            onClick={() => setTab('materials')}
          >
            Materials <span className="badge">{counts.size}</span>
          </button>
        </div>
        <div className="tab-body">
          {tab === 'blocks' ? (
            <BlockPalettePanel enabled={enabled} setEnabled={setEnabled} orientation={orientation} />
          ) : (
            <MaterialsList counts={counts} orientation={orientation} />
          )}
        </div>
      </aside>

      {dragOver && (
        <div className="drop-overlay">
          <div>Drop the image to load it</div>
        </div>
      )}
    </div>
  );
}
