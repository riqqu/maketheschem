// The "3D model" mode: load a GLB/glTF/STL, turn it into blocks, preview it in 3D and export it.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, Scan, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Field, SliderField } from '@/components/field';
import { IconButton } from '@/components/icon-button';
import { Note } from '@/components/note';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { Matrix4 } from 'three';
import { MAX_MODEL_SIZE, MIN_MODEL_SIZE, voxelTransform } from '../core/meshVoxels';
import type { VoxelHit } from '../core/voxelRay';
import { countCells } from '../core/volume';
import { orientMatrix } from '../core/mesh';
import { blockData, blockIndexById, BLOCKS } from '../data';
import { deleteModels, listModels, loadModel, saveModel, type ModelMeta, type ModelSource } from '../lib/db';
import { isModelFile, loadModelFile, MODEL_EXTENSIONS, type LoadedModel } from '../lib/model';
import { squareThumbnail } from '../lib/render';
import { saveJSON } from '../lib/storage';
import { BlockPalettePanel } from './BlockPalettePanel';
import { BlockPicker } from './BlockPicker';
import { ExportDialog, sanitizeName } from './ExportDialog';
import { HistoryPanel } from './HistoryPanel';
import { AppLayout, BusyPill, EmptyState, SideTabs, Stage, StageBanner, StatusBar, type SideTab } from './Layout';
import { MaterialsList } from './MaterialsList';
import { ModelPreview, type ModelPreviewHandle, type PreviewView } from './ModelPreview';
import {
  BLOCK_TILES, LS_MODEL_SETTINGS, loadModelSettings, MODEL_SIZE_PRESETS, modelPalettes, sanitizeModelSettings, type ModelSettings,
} from './modelSettings';
import { MatchingPanel } from './SettingsPanel';
import { ToolbarRow } from './Toolbar';
import type { ModelBuildResult } from '../worker/model.worker';
import { useAutosaveHistory, type HistoryStore } from './useAutosaveHistory';
import { useModelBuilder } from './useModelBuilder';

const FRONT = ['south', 'west', 'north', 'east'];
const notify = (message: string) => void toast(message);
const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

/** Most models kept in the history; the oldest are dropped beyond this. */
const MODEL_HISTORY_LIMIT = 40;
type SavedModel = Awaited<ReturnType<typeof loadModel>>;
const MODEL_STORE: HistoryStore<ModelMeta, SavedModel> = { list: listModels, load: loadModel, remove: deleteModels };
const describeModel = (m: ModelMeta) => `${m.width} × ${m.height} × ${m.length} · ${plural(m.blockCount, 'block')}`;
/** An entry is the model file plus its settings; the blocks are rebuilt from them when it's opened. */
const modelSignature = (name: string, s: ModelSettings) => JSON.stringify([name, s]);

interface Props {
  /** Rendered only while active; state (the loaded model, the last build) is kept while hidden. */
  active: boolean;
  /** A model file dropped or chosen elsewhere in the app; opened whenever `n` changes. */
  request: { file: File; n: number } | null;
  atlas: HTMLImageElement | null;
  /** The Pixel art / 3D model switch for the top bar. */
  modeSwitch: ReactNode;
}

export function ModelWorkspace({ active, request, atlas, modeSwitch }: Props) {
  const builder = useModelBuilder();
  const previewRef = useRef<ModelPreviewHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [model, setModel] = useState<LoadedModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ModelSettings>(loadModelSettings);
  const update = useCallback((patch: Partial<ModelSettings>) => setSettings((s) => ({ ...s, ...patch })), []);
  useEffect(() => saveJSON(LS_MODEL_SETTINGS, settings), [settings]);
  const [result, setResult] = useState<ModelBuildResult | null>(null);
  /** buildKey the result was made with: it is stale while this differs from the current one. */
  const [resultKey, setResultKey] = useState<string | null>(null);
  const [hover, setHover] = useState<VoxelHit | null>(null);
  const [view, setView] = useState<PreviewView>('blocks');
  const [tab, setTab] = useState<SideTab>('blocks');
  const [name, setName] = useState('model');

  // ---- history (autosave) -------------------------------------------------------------------

  /** What is shown now, read at save time. Filled in below once everything is derived. */
  const live = useRef({
    name, settings, result, resultKey, buildKey: null as string | null, blockCount: 0, canSnapshot: false, list: [] as ModelMeta[],
  });
  const hist = useAutosaveHistory<ModelMeta, SavedModel, Omit<ModelSource, 'id'>>({
    store: MODEL_STORE,
    limit: MODEL_HISTORY_LIMIT,
    onError: notify,
    // Saved once the blocks match the current settings, so the thumbnail and block count are right.
    signature: () => {
      const s = live.current;
      return s.result && s.resultKey === s.buildKey ? modelSignature(s.name, s.settings) : null;
    },
    save: async (entry) => {
      const s = live.current;
      const v = s.result!.volume;
      const shot = s.canSnapshot ? await previewRef.current?.snapshot().catch(() => null) : null;
      const thumb = (shot && (await squareThumbnail(shot).catch(() => null))) || (s.list.find((m) => m.id === entry.id)?.thumb ?? null);
      const meta: ModelMeta = {
        id: entry.id,
        name: s.name,
        createdAt: entry.createdAt,
        updatedAt: Date.now(),
        width: v.width,
        height: v.height,
        length: v.length,
        blockCount: s.blockCount,
        thumb,
      };
      await saveModel(meta, { id: entry.id, settings: s.settings }, entry.pending ? { id: entry.id, ...entry.pending } : null);
      return meta;
    },
  });

  // ---- loading ------------------------------------------------------------------------------

  const loadSeq = useRef(0);
  /** Opens a model file: a new one (new history entry, default orientation) or a saved one with its settings. */
  const load = async (file: File, saved?: { meta: ModelMeta; settings: ModelSettings }) => {
    if (!isModelFile(file)) {
      setLoadError(`“${file.name}” is not a .glb, .gltf or .stl file.`);
      return;
    }
    const seq = ++loadSeq.current; // only the newest of overlapping loads lands
    setLoading(true);
    setLoadError(null);
    try {
      const m = await loadModelFile(file);
      if (seq !== loadSeq.current) return;
      if (!saved) await hist.flush(); // the previous model's last changes go to its own entry
      if (seq !== loadSeq.current) return;
      builder.setSource(m.mesh);
      setResult(null);
      setResultKey(null);
      setHover(null);
      setModel(m);
      if (saved) {
        setName(saved.meta.name);
        setSettings(saved.settings);
        hist.adopt(saved.meta, modelSignature(saved.meta.name, saved.settings));
      } else {
        setName(sanitizeName(file.name));
        // A model without colours (most STL files) starts with one block; coloured ones match their colours.
        const coloured = m.format !== 'stl' || !!m.mesh.colors;
        update({ up: m.defaultUp, turns: 0, colorMode: coloured ? 'match' : 'single' });
        hist.begin({ blob: file, name: file.name, type: file.type });
      }
    } catch (e) {
      if (seq === loadSeq.current) setLoadError(`Couldn’t open “${file.name}”: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  };
  const open = (file: File) => load(file);
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (request) void openRef.current(request.file);
  }, [request]);

  const openSaved = async (id: string) => {
    if (id === hist.currentId) return;
    try {
      const rec = await hist.open(id);
      if (!rec) {
        notify('That model is no longer in the history.');
        return;
      }
      const file = new File([rec.source.blob], rec.source.name, { type: rec.source.type });
      await load(file, { meta: rec.meta, settings: sanitizeModelSettings(rec.data.settings, settings) });
    } catch (e) {
      notify(`Couldn’t open that model: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const openSavedRef = useRef(openSaved);
  openSavedRef.current = openSaved;

  const deleteSaved = async (id: string) => {
    const wasCurrent = id === hist.currentId;
    await hist.remove(id);
    if (wasCurrent) {
      loadSeq.current++;
      builder.setSource(null);
      setModel(null);
      setResult(null);
      setResultKey(null);
      setHover(null);
      setName('model');
    }
  };

  // Reopen the latest model once the history is ready, unless a model is already being opened.
  const restored = useRef(false);
  useEffect(() => {
    if (hist.available === null || restored.current) return;
    restored.current = true;
    if (hist.available && hist.list.length && !request && loadSeq.current === 0) void openSavedRef.current(hist.list[0].id);
  }, [hist.available]);

  // Save when the tab is hidden or closed.
  useEffect(() => {
    const hidden = () => document.visibilityState === 'hidden' && void hist.flush();
    const unload = () => void hist.flush();
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('beforeunload', unload);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('beforeunload', unload);
    };
  }, [hist.flush]);

  // ---- building -----------------------------------------------------------------------------

  const palettes = useMemo(() => modelPalettes(settings), [settings.enabled, settings.smoothness]);
  const single = settings.colorMode === 'single' ? blockIndexById.get(settings.singleBlock) ?? null : null;
  const noBlocks = settings.colorMode === 'match' && palettes.side.length === 0;
  const buildKey = model
    ? JSON.stringify([
        model.key, settings.size, settings.up, settings.turns, settings.interior, single,
        single === null ? [settings.enabled, settings.smoothness, settings.dither, settings.ditherStrength, settings.maxTypesOn && settings.maxTypes] : 0,
      ])
    : null;

  useEffect(() => {
    if (!model || !buildKey || noBlocks) return;
    const key = buildKey;
    const t = setTimeout(() => {
      builder.build(
        {
          size: settings.size,
          up: settings.up,
          turns: settings.turns,
          interior: settings.interior,
          top: palettes.top,
          side: palettes.side,
          dither: settings.dither === 'ordered' ? settings.ditherStrength : 0,
          maxTypes: settings.maxTypesOn ? settings.maxTypes : 0,
          single,
          tiles: BLOCK_TILES,
          atlasColumns: blockData.atlasColumns,
        },
        (r) => {
          setResult(r);
          setResultKey(key);
        },
      );
    }, 150);
    return () => clearTimeout(t);
  }, [buildKey, noBlocks]);

  const counts = useMemo(() => (result ? countCells(result.volume.cells) : new Map<number, number>()), [result]);
  const blockCount = useMemo(() => [...counts.values()].reduce((a, b) => a + b, 0), [counts]);

  // The thumbnail is a snapshot of the blocks view, so only take it while that is on screen.
  live.current = { name, settings, result, resultKey, buildKey, blockCount, canSnapshot: active && view === 'blocks', list: hist.list };
  useEffect(() => hist.schedule(), [result, resultKey, name, settings, hist.schedule]);

  // Where the original model sits in voxel space, for the "Source model" view, and the size it will get.
  const placement = useMemo(() => {
    if (!model) return null;
    try {
      const { scale, offset, dims } = voxelTransform(model.mesh, settings);
      const r = orientMatrix(settings.up, settings.turns);
      const rot = new Matrix4().set(r[0], r[1], r[2], 0, r[3], r[4], r[5], 0, r[6], r[7], r[8], 0, 0, 0, 0, 1);
      const matrix = new Matrix4().makeTranslation(offset[0], offset[1], offset[2]).multiply(new Matrix4().makeScale(scale, scale, scale)).multiply(rot);
      return { dims, source: { object: model.object, matrix } };
    } catch {
      return null;
    }
  }, [model, settings.size, settings.up, settings.turns]);

  const fitKey = model ? `${model.key}|${settings.up}|${settings.turns}` : '';
  const snapshot = useCallback(() => previewRef.current?.snapshot() ?? Promise.resolve(null), []);

  useEffect(() => {
    if (builder.error) toast.error(`Building failed: ${builder.error}`);
  }, [builder.error]);

  if (!active) return null;

  // ---- UI -----------------------------------------------------------------------------------

  const dims = placement?.dims;
  const openFile = () => fileInput.current?.click();

  let status: ReactNode = <span className="text-muted-foreground">{model ? 'Drag to turn · right-drag to pan · wheel to zoom' : 'No model'}</span>;
  if (hover) {
    status = (
      <>
        <span className="tabular-nums text-muted-foreground">
          x {hover.x} · y {hover.y} · z {hover.z}
        </span>
        <span className="truncate font-medium">{BLOCKS[hover.block]?.name}</span>
      </>
    );
  }

  return (
    <AppLayout
      modeSwitch={modeSwitch}
      actions={
        <ExportDialog target={{ kind: 'model', volume: result?.volume ?? null, snapshot }} blockCount={blockCount} name={name} setName={setName} />
      }
      left={
        <>
          <Section title="Source">
            <input
              ref={fileInput}
              type="file"
              accept={MODEL_EXTENSIONS.join(',')}
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void open(f);
                e.target.value = '';
              }}
            />
            <div className="grid gap-3">
              {model && (
                <div className="flex items-center gap-3">
                  <div className="grid size-14 shrink-0 place-items-center rounded-md border bg-muted text-muted-foreground" aria-hidden="true">
                    <Box className="size-6" strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-medium" title={model.name}>
                      {model.name}
                    </div>
                    <div className="text-xs tabular-nums text-muted-foreground">{plural(model.triangles, 'triangle')}</div>
                  </div>
                </div>
              )}
              <Button variant="outline" onClick={openFile} disabled={loading}>
                <Upload /> {loading ? 'Loading…' : model ? 'Change' : 'Open model'}
              </Button>
              {model?.warnings.map((w) => (
                <Note key={w} tone="info">
                  {w}
                </Note>
              ))}
              {loadError && <Note>{loadError}</Note>}
            </div>
          </Section>

          <Section title="Size">
            <SliderField
              label="Longest side"
              value={settings.size}
              display={dims ? `${dims[0]} × ${dims[1]} × ${dims[2]}` : settings.size}
              min={MIN_MODEL_SIZE}
              max={MAX_MODEL_SIZE}
              onChange={(size) => update({ size })}
            />
            <Segmented label="Size presets" value={settings.size} onChange={(size) => update({ size })} options={MODEL_SIZE_PRESETS.map((n) => ({ value: n, label: n }))} />
            {dims && dims[1] > 384 && <Note>Taller than the world height (384).</Note>}
            <Field label="Up axis">
              <Segmented
                label="Up axis"
                value={settings.up}
                onChange={(up) => update({ up })}
                options={[
                  { value: 'y', label: 'Y up', tooltip: 'glTF and most game models' },
                  { value: 'z', label: 'Z up', tooltip: 'Most STL and CAD models' },
                ]}
              />
            </Field>
            <Field label="Turn" value={`front faces ${FRONT[settings.turns]}`}>
              <Segmented label="Turn" value={settings.turns} onChange={(turns) => update({ turns })} options={[0, 1, 2, 3].map((t) => ({ value: t, label: `${t * 90}°` }))} />
            </Field>
          </Section>

          <Section title="Style">
            <Field label="Inside">
              <Segmented
                label="Inside"
                value={settings.interior}
                onChange={(interior) => update({ interior })}
                options={[
                  { value: 'hollow', label: 'Hollow', tooltip: 'A one-block shell: far fewer blocks' },
                  { value: 'solid', label: 'Solid', tooltip: 'Filled with the nearest surface block' },
                ]}
              />
            </Field>
            <Field label="Colours">
              <Segmented
                label="Colours"
                value={settings.colorMode}
                onChange={(colorMode) => update({ colorMode })}
                options={[
                  { value: 'match', label: 'Match model' },
                  { value: 'single', label: 'One block' },
                ]}
              />
              {settings.colorMode === 'single' && (
                <BlockPicker
                  value={single}
                  onSelect={(v) => update({ singleBlock: BLOCKS[v].id })}
                  orientation="wall"
                  placeholder="Choose a block"
                  className="w-full"
                />
              )}
            </Field>
          </Section>

          {settings.colorMode === 'match' && (
            <Section title="Matching">
              <MatchingPanel settings={settings} update={update} noDiffusion />
            </Section>
          )}
        </>
      }
      main={
        <>
          <ToolbarRow>
            <Segmented
              label="Show"
              value={view}
              onChange={setView}
              disabled={!model}
              className="w-56"
              options={[
                { value: 'blocks', label: 'Blocks' },
                { value: 'source', label: 'Original' },
              ]}
            />
            <div className="ml-auto">
              <IconButton icon={Scan} label="Fit to view" onClick={() => previewRef.current?.fit()} disabled={!result} />
            </div>
          </ToolbarRow>
          <Stage>
            {noBlocks && (
              <StageBanner>
                <span className="pr-3">No blocks are enabled. Choose some in the Blocks tab.</span>
              </StageBanner>
            )}
            <ModelPreview
              faces={result?.faces ?? null}
              volume={result?.volume ?? null}
              source={placement?.source ?? null}
              view={view}
              atlas={atlas}
              tileSize={blockData.tileSize}
              atlasColumns={blockData.atlasColumns}
              fitKey={fitKey}
              handleRef={previewRef}
              onHover={setHover}
            />
            {!model && (
              <EmptyState icon={Box} title="Drop a 3D model">
                <Button onClick={openFile} disabled={loading}>
                  <Upload /> Open model
                </Button>
              </EmptyState>
            )}
            {(builder.busy || loading) && <BusyPill>{loading ? 'Loading…' : 'Building…'}</BusyPill>}
          </Stage>
          <StatusBar
            left={status}
            right={
              result &&
              `${result.volume.width} × ${result.volume.height} × ${result.volume.length} · ${plural(blockCount, 'block')}` +
                (result.interiorCount ? ` (${result.interiorCount.toLocaleString()} inside)` : '')
            }
          />
        </>
      }
      right={
        <SideTabs
          tab={tab}
          setTab={setTab}
          blocks={<EnabledBlocks settings={settings} update={update} />}
          materials={<MaterialsList counts={counts} orientation="wall" />}
          history={
            hist.available ? (
              <HistoryPanel
                list={hist.list}
                currentId={hist.currentId}
                onOpen={(id) => void openSaved(id)}
                onDelete={(id) => void deleteSaved(id)}
                describe={describeModel}
                smoothThumbs
              />
            ) : null
          }
        />
      }
    />
  );
}

function EnabledBlocks({ settings, update }: { settings: ModelSettings; update: (p: Partial<ModelSettings>) => void }) {
  const enabled = useMemo(() => new Set(settings.enabled), [settings.enabled]);
  const setEnabled = useCallback((next: Set<string>) => update({ enabled: [...next] }), [update]);
  return (
    <>
      {settings.colorMode === 'single' && (
        <Note tone="info" className="mx-4 mt-4">
          Not used while “One block” is on.
        </Note>
      )}
      <BlockPalettePanel enabled={enabled} setEnabled={setEnabled} orientation="wall" />
    </>
  );
}
