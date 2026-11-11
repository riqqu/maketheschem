import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, Grid2x2, Image as ImageIcon, ImageUp, RulerDimensionLine, SquareDashed } from 'lucide-react';
import { toast } from 'sonner';
import { confirm, ConfirmDialog } from '@/components/confirm';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ATLAS_URL, BLOCKS, blockData, blockIndexById } from '../data';
import { countBlocks, createGrid, History, resizeGrid, type Grid } from '../core/grid';
import { layout } from '../core/layout';
import { measureSummary, type Measurement } from '../core/measure';
import { parseSchem, schemToGrid } from '../core/schemRead';
import { decodeGrid } from '../core/serialize';
import type { ClipTransform } from '../core/shapes';
import { AIR, type Orientation } from '../core/types';
import { ACCEPT_ATTR, ACCEPTED_TYPES, isModelFile, isSchemFile, loadImageFile, type LoadedImage } from '../lib/image';
import { loadJSON, saveJSON } from '../lib/storage';
import type { BackgroundInfo } from '../worker/generate.worker';
import { BlockPalettePanel } from './BlockPalettePanel';
import { Editor, type EditorHandle, type SelectionInfo, type Tool, type ViewMode } from './Editor';
import { ExportDialog, sanitizeName } from './ExportDialog';
import { HistoryPanel } from './HistoryPanel';
import { ImagePanel } from './ImagePanel';
import { AppLayout, BusyPill, EmptyState, SideTabs, Stage, StageBanner, StatusBar, type SideTab } from './Layout';
import { MaterialsList } from './MaterialsList';
import { MatchingPanel, SizePanel, SourceOptions } from './SettingsPanel';
import {
  buildPalette, generationKeys, LAST_SETTINGS_KEY, loadLastSettings, sanitizeSettings, type ArtSettings, type GenerationKeys,
} from './settings';
import { clampSize, MAX_SIDE, MAX_WALL_HEIGHT, maxHeightFor, sizeFromHeight, sizeFromLongest, sizeFromWidth } from './size';
import { ToolRail, Toolbar } from './Toolbar';
import { useArtHistory } from './useArtHistory';
import { useGenerator } from './useGenerator';

// three.js is large: load the 3D model mode only when it's first used.
const ModelWorkspace = lazy(() => import('./ModelWorkspace').then((m) => ({ default: m.ModelWorkspace })));

function useLoadedImage(url: string | null) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) return setImg(null);
    let live = true;
    const el = new Image();
    el.onload = () => live && setImg(el);
    el.src = url;
    return () => {
      live = false;
    };
  }, [url]);
  return img;
}

const TOOL_KEYS: Record<string, Tool> = {
  b: 'brush', e: 'eraser', i: 'picker', g: 'fill', r: 'replace', m: 'measure', l: 'line', u: 'rect', s: 'select',
};
const LS_RULERS = 'mts.rulers';
const LS_MODE = 'mts.mode';
type Mode = 'pixel' | 'model';
const NO_SELECTION: SelectionInfo = { rect: null, floating: false, clipboard: false };

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
const notify = (message: string) => void toast(message);

/** Pixel art / 3D model: the same control in both workspaces' top bar. */
function ModeSwitch({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <Segmented
      label="Mode"
      value={mode}
      onChange={setMode}
      className="w-60 max-[560px]:w-44"
      options={[
        { value: 'pixel', label: <><ImageIcon /> Pixel art</> },
        { value: 'model', label: <><Box /> 3D model</> },
      ]}
    />
  );
}

export default function App() {
  const atlas = useLoadedImage(ATLAS_URL);
  const gen = useGenerator();
  const history = useRef(new History()).current;
  const editorRef = useRef<EditorHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [image, setImage] = useState<LoadedImage | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ArtSettings>(loadLastSettings);
  const update = useCallback((patch: Partial<ArtSettings>) => setSettings((s) => ({ ...s, ...patch })), []);
  useEffect(() => saveJSON(LAST_SETTINGS_KEY, settings), [settings]);
  const [bgInfo, setBgInfo] = useState<BackgroundInfo | null>(null);

  const [grid, setGrid] = useState<Grid | null>(null);
  const [version, setVersion] = useState(0);
  const [edited, setEdited] = useState(false);
  /** Settings the current grid was made with. */
  const [lastGen, setLastGen] = useState<GenerationKeys | null>(null);
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
  const [rectFilled, setRectFilled] = useState(false);
  const [currentBlock, setCurrentBlock] = useState(() => blockIndexById.get('white_concrete') ?? 0);
  const [recent, setRecent] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('textures');
  const [showGrid, setShowGrid] = useState(true);
  const [showRulers, setShowRulersState] = useState(() => loadJSON<boolean>(LS_RULERS, true) !== false);
  const setShowRulers = (v: boolean) => {
    setShowRulersState(v);
    saveJSON(LS_RULERS, v);
  };
  const [overlayOn, setOverlayOn] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const overlayImg = useLoadedImage(image?.url ?? null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [selection, setSelection] = useState<SelectionInfo>(NO_SELECTION);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitSignal, setFitSignal] = useState(0);
  const [tab, setTab] = useState<SideTab>('blocks');
  const [name, setName] = useState('pixel_art');
  const [dragOver, setDragOver] = useState(false);
  const [mode, setModeState] = useState<Mode>(() => (loadJSON<string>(LS_MODE, 'pixel') === 'model' ? 'model' : 'pixel'));
  const setMode = (m: Mode) => {
    setModeState(m);
    saveJSON(LS_MODE, m);
    if (m === 'pixel') setFitSignal((n) => n + 1); // the editor remounts
  };
  const [modelRequest, setModelRequest] = useState<{ file: File; n: number } | null>(null);
  // Once opened, the model mode stays mounted (hidden) so the loaded model survives switching back and forth.
  const modelUsed = useRef(false);
  if (mode === 'model') modelUsed.current = true;

  const { orientation } = settings;
  const enabled = useMemo(() => new Set(settings.enabled), [settings.enabled]);
  const setEnabled = useCallback((next: Set<string>) => update({ enabled: [...next] }), [update]);

  // ---- derived -----------------------------------------------------------------------------

  const counts = useMemo(() => (grid ? countBlocks(grid) : new Map<number, number>()), [grid, version]);
  const blockCount = useMemo(() => [...counts.values()].reduce((a, b) => a + b, 0), [counts]);

  // ---- history (autosave) ------------------------------------------------------------------

  const art = useArtHistory(
    () => ({ name: sanitizeName(name), settings, grid, edited, hasImage: !!image, blockCount }),
    notify,
  );
  useEffect(() => art.schedule(), [grid, version, settings, name, edited, image, art.schedule]);

  // ---- size --------------------------------------------------------------------------------

  const size = { width: settings.width, height: settings.height };
  const maxH = maxHeightFor(orientation);
  const aspect = image ? image.naturalHeight / image.naturalWidth : settings.height / settings.width;

  const setWidth = (w: number) =>
    update(settings.lockAspect ? sizeFromWidth(w, aspect, MAX_SIDE, maxH) : clampSize({ width: w, height: settings.height }, MAX_SIDE, maxH));
  const setHeight = (h: number) =>
    update(settings.lockAspect ? sizeFromHeight(h, aspect, MAX_SIDE, maxH) : clampSize({ width: settings.width, height: h }, MAX_SIDE, maxH));
  const setLongest = (n: number) =>
    update(settings.lockAspect ? sizeFromLongest(n, aspect, MAX_SIDE, maxH) : clampSize({ width: n, height: n }, MAX_SIDE, maxH));

  const setOrientation = (o: Orientation) => {
    const mh = maxHeightFor(o);
    const patch: Partial<ArtSettings> = { orientation: o };
    if (settings.height > mh) Object.assign(patch, settings.lockAspect ? sizeFromHeight(mh, aspect, MAX_SIDE, mh) : clampSize(size, MAX_SIDE, mh));
    update(patch);
  };

  // ---- generation --------------------------------------------------------------------------

  const palette = useMemo(() => buildPalette(settings), [settings.enabled, settings.orientation, settings.smoothness]);

  const background = settings.bgOn ? { tolerance: settings.bgTolerance / 100, mode: settings.bgMode } : null;
  const keys = image ? generationKeys(image.key, settings) : null;
  const baseKey = keys?.base ?? null;
  const bgKey = keys?.bg ?? 'null';
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
    if (!image || !keys || palette.length === 0) return;
    const gen0 = keys;
    gen.generate(
      {
        width: settings.width,
        height: settings.height,
        resize: settings.resize,
        dither: settings.dither === 'off' ? 0 : settings.ditherStrength,
        ditherMode: settings.dither === 'ordered' ? 'ordered' : 'diffusion',
        palette,
        maxTypes: settings.maxTypesOn ? settings.maxTypes : 0,
        background,
      },
      (r) => {
        setGrid({ width: r.width, height: r.height, cells: r.cells });
        setBgInfo(r.background);
        history.clear();
        setVersion((v) => v + 1);
        setEdited(false);
        setEraseId(null);
        setLastGen(gen0);
      },
    );
  };
  const runRef = useRef(runGenerate);
  runRef.current = runGenerate;

  const runErase = () => {
    if (!grid || !keys) return;
    const target = grid;
    const gen0 = keys;
    if (!background) {
      // Switched off: take back our own erase; the manual edits underneath stay.
      if (eraseIsTop()) history.undo(target);
      setEraseId(null);
      setVersion((v) => v + 1);
      setBgInfo(null);
      setLastGen(gen0);
      return;
    }
    gen.backgroundMask({ width: target.width, height: target.height, resize: settings.resize, background }, (r) => {
      // Replace the previous background erase instead of stacking, so lowering the tolerance restores cells.
      if (eraseIsTop()) history.undo(target);
      history.begin();
      let erased = 0;
      for (let i = 0; i < r.mask.length; i++) if (r.mask[i] && history.set(target, i, AIR)) erased++;
      setEraseId(history.commit(target) ? history.topId : null);
      setVersion((v) => v + 1);
      setBgInfo(r.background);
      setLastGen(gen0);
      if (erased) notify(`Erased ${erased.toLocaleString()} background blocks. Your edits were kept (Ctrl+Z to undo).`);
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
    if (gen.error) toast.error(`Generation failed: ${gen.error}`);
  }, [gen.error]);

  // Blank canvas: resizing keeps the drawing (top-left anchored).
  useEffect(() => {
    if (image || !grid || (grid.width === settings.width && grid.height === settings.height)) return;
    setGrid(resizeGrid(grid, settings.width, settings.height));
    history.clear();
    setVersion((v) => v + 1);
  }, [image, grid, settings.width, settings.height, history]);

  // ---- art lifecycle -----------------------------------------------------------------------

  // Without browser storage there is no history to fall back on, so ask before throwing edits away.
  const confirmDiscard = async () =>
    art.available === true || !edited || confirm({ title: 'Discard your edits?', action: 'Discard', destructive: true });

  const replaceImage = (img: LoadedImage | null) => {
    gen.cancel(); // a result for the previous image must not land on the new art
    setImage((prev) => {
      if (prev && prev !== img) URL.revokeObjectURL(prev.url);
      return img;
    });
    gen.setSource(img ? img.pixels : null);
    if (!img) setOverlayOn(false);
  };

  /** Shows a grid as the whole art: clears undo, edits and generation state. */
  const showGrid0 = (g: Grid | null, opts: { edited?: boolean; lastGen?: GenerationKeys | null } = {}) => {
    setGrid(g);
    history.clear();
    setVersion((v) => v + 1);
    setEdited(opts.edited ?? false);
    setEraseId(null);
    setLastGen(opts.lastGen ?? null);
    setBgInfo(null);
    setMeasurement(null);
    setFitSignal((n) => n + 1);
  };

  const openSchemFile = async (file: File) => {
    try {
      const parsed = await parseSchem(new Uint8Array(await file.arrayBuffer()));
      const r = schemToGrid(parsed, BLOCKS, { maxSide: MAX_SIDE, maxWallHeight: MAX_WALL_HEIGHT });
      if (!(await confirmDiscard())) return;
      await art.flush();
      setImageError(null);
      replaceImage(null);
      update({ orientation: r.orientation, facing: r.facing, width: r.grid.width, height: r.grid.height, lockAspect: true });
      showGrid0(r.grid);
      setName(sanitizeName(parsed.name || file.name));
      art.begin(null);
      const unknown = [...r.unknown.values()].reduce((a, b) => a + b, 0);
      notify(
        `Opened ${r.grid.width} × ${r.grid.height} ${r.orientation}` +
          (r.orientation === 'wall' ? ` facing ${r.facing}` : '') +
          (unknown ? `. ${plural(unknown, 'block')} of ${plural(r.unknown.size, 'unsupported type')} became air.` : '.'),
      );
    } catch (e) {
      setImageError(`Couldn’t open “${file.name}”: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const onFile = async (file: File) => {
    if (isModelFile(file)) {
      setMode('model');
      setModelRequest((r) => ({ file, n: (r?.n ?? 0) + 1 }));
      return;
    }
    if (isSchemFile(file)) {
      setMode('pixel');
      return openSchemFile(file);
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setImageError(`“${file.name}” is not a PNG, JPG, GIF or WebP image, a .schem file or a 3D model (.glb, .gltf, .stl).`);
      setMode('pixel');
      return;
    }
    setMode('pixel');
    if (!(await confirmDiscard())) return;
    try {
      const img = await loadImageFile(file);
      await art.flush();
      setImageError(null);
      replaceImage(img);
      // The old grid must not be saved under the new art: show nothing until the first generation is done.
      showGrid0(null);
      setName(sanitizeName(file.name));
      if (settings.lockAspect) {
        update(sizeFromLongest(Math.max(settings.width, settings.height), img.naturalHeight / img.naturalWidth, MAX_SIDE, maxH));
      }
      art.begin({ blob: file, name: file.name, type: file.type });
    } catch (e) {
      setImageError(`Couldn’t read “${file.name}”: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const onFileRef = useRef(onFile);
  onFileRef.current = onFile;

  const startBlank = async () => {
    if (!(await confirmDiscard())) return;
    await art.flush();
    replaceImage(null);
    showGrid0(createGrid(settings.width, settings.height));
    setName('pixel_art');
    art.begin(null);
  };

  const openArt = async (id: string) => {
    if (id === art.currentId) return;
    editorRef.current?.commitFloating();
    try {
      const rec = await art.open(id);
      if (!rec) {
        notify('That art is no longer in the history.');
        return;
      }
      const { grid: g, missing } = decodeGrid(rec.data.grid, blockIndexById);
      const s = { ...sanitizeSettings(rec.data.settings, settings), width: g.width, height: g.height };
      let img: LoadedImage | null = null;
      let imageLost = false;
      if (rec.source) {
        try {
          img = await loadImageFile(new File([rec.source.blob], rec.source.name, { type: rec.source.type }));
        } catch {
          imageLost = true;
        }
      }
      // Everything below happens in one render, so the autosave never sees a half-opened art.
      setImageError(null);
      replaceImage(img);
      setSettings(s);
      showGrid0(g, { edited: rec.data.edited, lastGen: img ? generationKeys(img.key, s) : null });
      setName(rec.meta.name);
      art.adopt(rec.meta, { name: rec.meta.name, settings: s, edited: rec.data.edited }, g);
      const missingCount = [...missing.values()].reduce((a, b) => a + b, 0);
      if (missingCount) notify(`${plural(missingCount, 'block')} that this Minecraft version doesn’t have became air.`);
      else if (imageLost) notify('The original image couldn’t be loaded. The blocks are kept.');
    } catch (e) {
      notify(`Couldn’t open that art: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const deleteArt = async (id: string) => {
    const wasCurrent = id === art.currentId;
    await art.remove(id);
    if (wasCurrent) {
      replaceImage(null);
      showGrid0(null);
      setName('pixel_art');
    }
  };

  // Reopen the latest art once the history is ready (unless something was opened in the meantime).
  const restored = useRef(false);
  useEffect(() => {
    if (art.available === null || restored.current) return;
    restored.current = true;
    if (art.available && art.list.length && !grid && !image) void openArt(art.list[0].id);
  }, [art.available]);

  // Save when the tab is hidden or closed; without storage, warn before losing edits.
  const editedRef = useRef(edited);
  editedRef.current = edited;
  useEffect(() => {
    const hidden = () => document.visibilityState === 'hidden' && void art.flush();
    const unload = (e: BeforeUnloadEvent) => {
      void art.flush();
      if (art.available === false && editedRef.current) e.preventDefault();
    };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('beforeunload', unload);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('beforeunload', unload);
    };
  }, [art.flush, art.available]);

  // Drop an image or schematic anywhere on the page.
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
      if (f) void onFileRef.current(f);
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

  // A floating selection is not on the grid yet: undo/redo drop it first.
  const undo = () => {
    if (editorRef.current?.cancelFloating()) return;
    if (grid && history.undo(grid)) setVersion((v) => v + 1);
  };
  const redo = () => {
    editorRef.current?.cancelFloating();
    if (grid && history.redo(grid)) setVersion((v) => v + 1);
  };
  const transform = (op: ClipTransform) => editorRef.current?.transform(op);

  // Keyboard shortcuts (ignored while typing in a field). Selection keys live in the editor.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    // Ignore shortcuts only while typing; a focused checkbox, slider or button must not swallow Ctrl+Z.
    const typing = 'input:not([type=checkbox]):not([type=range]):not([type=radio]), textarea, select, [contenteditable], [role=dialog]';
    if ((e.target as HTMLElement)?.closest?.(typing)) return;
    if (modeRef.current === 'model') return; // the editor's shortcuts don't apply to the 3D view
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
      else if (k === 'o' && image) setOverlayOn((v) => !v);
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // ---- view --------------------------------------------------------------------------------

  let status: ReactNode = <span className="text-muted-foreground">Hover the canvas to inspect blocks</span>;
  if (grid && hover) {
    const v = grid.cells[hover.y * grid.width + hover.x];
    const pos = layout(grid.width, grid.height, orientation, settings.facing).blockPos(hover.x, hover.y);
    status = (
      <>
        <span className="tabular-nums text-muted-foreground">
          x {pos.x} · y {pos.y} · z {pos.z}
        </span>
        <span className="truncate font-medium">{v === AIR ? 'Air' : BLOCKS[v]?.name}</span>
      </>
    );
  }
  const readout = 'flex items-center gap-1.5 font-medium tabular-nums text-brand [&_svg]:size-3.5';

  const modeSwitch = <ModeSwitch mode={mode} setMode={setMode} />;
  const openImage = () => fileInput.current?.click();

  const pixel = (
    <AppLayout
      modeSwitch={modeSwitch}
      actions={
        <ExportDialog
          target={{
            kind: 'art',
            grid,
            orientation,
            facing: settings.facing,
            setFacing: (facing) => update({ facing }),
            atlas: { atlas, tileSize: blockData.tileSize, atlasColumns: blockData.atlasColumns },
          }}
          blockCount={blockCount}
          name={name}
          setName={setName}
        />
      }
      left={
        <>
          <Section title="Source">
            <ImagePanel image={image} onOpen={openImage} onBlank={() => void startBlank()} error={imageError} />
            {image && <SourceOptions settings={settings} update={update} bgInfo={settings.bgOn ? bgInfo : null} />}
          </Section>
          <Section title="Size">
            <SizePanel
              settings={settings}
              update={update}
              setOrientation={setOrientation}
              setWidth={setWidth}
              setHeight={setHeight}
              setLongest={setLongest}
            />
          </Section>
          {image && (
            <Section title="Matching">
              <MatchingPanel settings={settings} update={update} />
            </Section>
          )}
        </>
      }
      main={
        <>
          <Toolbar
            tool={tool}
            brushSize={brushSize}
            setBrushSize={setBrushSize}
            rectFilled={rectFilled}
            setRectFilled={setRectFilled}
            currentBlock={currentBlock}
            recent={recent}
            onSelectBlock={selectBlock}
            orientation={orientation}
            canUndo={history.canUndo || selection.floating}
            canRedo={history.canRedo}
            onUndo={undo}
            onRedo={redo}
            selection={selection}
            onCopy={() => editorRef.current?.copy()}
            onCut={() => editorRef.current?.cut()}
            onPaste={() => editorRef.current?.paste()}
            onDelete={() => editorRef.current?.deleteSelection()}
            hasOverlay={!!image}
            overlayOn={overlayOn}
            setOverlayOn={setOverlayOn}
            overlayOpacity={overlayOpacity}
            setOverlayOpacity={setOverlayOpacity}
            viewMode={viewMode}
            setViewMode={setViewMode}
            showGrid={showGrid}
            setShowGrid={setShowGrid}
            showRulers={showRulers}
            setShowRulers={setShowRulers}
            onFit={() => setFitSignal((n) => n + 1)}
            disabled={!grid}
          />
          <div className="flex min-h-0 flex-1">
            <ToolRail tool={tool} setTool={setTool} selection={selection} onTransform={transform} disabled={!grid} />
            <Stage>
              {stale && (
                <StageBanner>
                  <span>Settings changed since your edits</span>
                  <Button size="sm" className="rounded-full" onClick={() => runRef.current()}>
                    Regenerate
                  </Button>
                </StageBanner>
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
                rectFilled={rectFilled}
                currentBlock={currentBlock}
                history={history}
                fitSignal={fitSignal}
                overlay={overlayOn ? overlayImg : null}
                overlayOpacity={overlayOpacity}
                handleRef={editorRef}
                onEdit={onEdit}
                onPick={onPick}
                onHover={setHover}
                onZoom={setZoom}
                onMeasure={setMeasurement}
                onSelection={setSelection}
                onToolChange={setTool}
              />
              {!grid && !image && (
                <EmptyState icon={ImageIcon} title="Drop an image">
                  <Button onClick={openImage}>
                    <ImageUp /> Open image
                  </Button>
                  <Button variant="outline" onClick={() => void startBlank()}>
                    <Grid2x2 /> Blank canvas
                  </Button>
                </EmptyState>
              )}
              {(gen.busy || (image && !grid)) && <BusyPill>Generating…</BusyPill>}
            </Stage>
          </div>
          <StatusBar
            left={
              <>
                {status}
                {selection.rect && (
                  <span className={readout}>
                    <SquareDashed /> {selection.rect.w} × {selection.rect.h}
                    {selection.floating ? ' · moving' : ''}
                  </span>
                )}
                {measurement && (
                  <span className={readout}>
                    <RulerDimensionLine /> {measureSummary(measurement, orientation)}
                  </span>
                )}
              </>
            }
            right={grid && `${grid.width} × ${grid.height} · ${Math.round(zoom * 100) / 100}px/block`}
          />
        </>
      }
      right={
        <SideTabs
          tab={tab}
          setTab={setTab}
          blocks={<BlockPalettePanel enabled={enabled} setEnabled={setEnabled} orientation={orientation} />}
          materials={<MaterialsList counts={counts} orientation={orientation} />}
          history={
            art.available ? (
              <HistoryPanel list={art.list} currentId={art.currentId} onOpen={(id) => void openArt(id)} onDelete={(id) => void deleteArt(id)} />
            ) : null
          }
        />
      }
    />
  );

  return (
    <TooltipProvider delayDuration={300}>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT_ATTR}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = '';
        }}
      />
      {modelUsed.current && (
        <Suspense
          fallback={
            mode === 'model' ? (
              <AppLayout modeSwitch={modeSwitch} left={null} main={<div className="grid flex-1 place-items-center text-muted-foreground">Loading…</div>} right={null} />
            ) : null
          }
        >
          <ModelWorkspace active={mode === 'model'} request={modelRequest} atlas={atlas} modeSwitch={modeSwitch} />
        </Suspense>
      )}
      {mode === 'pixel' && pixel}
      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-background/60 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-foreground/30 bg-popover px-7 py-5 text-base font-medium shadow-lg">Drop to open</div>
        </div>
      )}
      <Toaster />
      <ConfirmDialog />
    </TooltipProvider>
  );
}
