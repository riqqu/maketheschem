// The "3D model" mode: load a GLB/glTF/STL, turn it into blocks, preview it in 3D and export it.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Matrix4 } from 'three';
import { MAX_MODEL_SIZE, MIN_MODEL_SIZE, voxelTransform } from '../core/meshVoxels';
import type { VoxelHit } from '../core/voxelRay';
import { countCells } from '../core/volume';
import { orientMatrix } from '../core/mesh';
import { blockData, blockIndexById, BLOCKS } from '../data';
import { isModelFile, loadModelFile, MODEL_EXTENSIONS, type LoadedModel } from '../lib/model';
import { saveJSON } from '../lib/storage';
import { BlockPalettePanel } from './BlockPalettePanel';
import { BlockPicker } from './BlockPicker';
import { BlockSwatch } from './BlockSwatch';
import { ExportPanel, sanitizeName } from './ExportPanel';
import { Icon } from './Icon';
import { MaterialsList } from './MaterialsList';
import { ModelPreview, type ModelPreviewHandle, type PreviewView } from './ModelPreview';
import {
  BLOCK_TILES, LS_MODEL_SETTINGS, loadModelSettings, MODEL_SIZE_PRESETS, modelPalettes, type ModelSettings,
} from './modelSettings';
import { MatchingPanel } from './SettingsPanel';
import type { ModelBuildResult } from '../worker/model.worker';
import { useModelBuilder } from './useModelBuilder';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

const FRONT = ['south', 'west', 'north', 'east'];
const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

interface Props {
  /** Rendered only while active; state (the loaded model, the last build) is kept while hidden. */
  active: boolean;
  /** A model file dropped or chosen elsewhere in the app; opened whenever `n` changes. */
  request: { file: File; n: number } | null;
  atlas: HTMLImageElement | null;
}

export function ModelWorkspace({ active, request, atlas }: Props) {
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
  const [hover, setHover] = useState<VoxelHit | null>(null);
  const [view, setView] = useState<PreviewView>('blocks');
  const [tab, setTab] = useState<'blocks' | 'materials'>('blocks');
  const [name, setName] = useState('model');
  const [pickerAt, setPickerAt] = useState<{ top: number; left: number } | null>(null);

  // ---- loading ------------------------------------------------------------------------------

  const open = async (file: File) => {
    if (!isModelFile(file)) {
      setLoadError(`“${file.name}” is not a .glb, .gltf or .stl file.`);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const m = await loadModelFile(file);
      builder.setSource(m.mesh);
      setResult(null);
      setHover(null);
      setModel(m);
      setName(sanitizeName(file.name));
      // A model without colours (most STL files) starts with one block; coloured ones match their colours.
      const coloured = m.format !== 'stl' || !!m.mesh.colors;
      update({ up: m.defaultUp, turns: 0, colorMode: coloured ? 'match' : 'single' });
    } catch (e) {
      setLoadError(`Couldn’t open “${file.name}”: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (request) void openRef.current(request.file);
  }, [request]);

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
        setResult,
      );
    }, 150);
    return () => clearTimeout(t);
  }, [buildKey, noBlocks]);

  const counts = useMemo(() => (result ? countCells(result.volume.cells) : new Map<number, number>()), [result]);
  const blockCount = useMemo(() => [...counts.values()].reduce((a, b) => a + b, 0), [counts]);

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

  if (!active) return null;

  // ---- UI -----------------------------------------------------------------------------------

  const dims = placement?.dims;
  const singleBlock = single !== null ? BLOCKS[single] : null;
  const togglePicker = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (pickerAt) return setPickerAt(null);
    const r = e.currentTarget.getBoundingClientRect();
    setPickerAt({ top: Math.min(r.bottom + 6, window.innerHeight - 420), left: Math.max(8, Math.min(r.left, window.innerWidth - 372)) });
  };

  let status: ReactNode = <span className="muted">{model ? 'Hover the blocks to inspect them · drag to turn, right-drag to pan, wheel to zoom' : 'No model loaded'}</span>;
  if (hover) {
    status = (
      <>
        <span className="num">
          x {hover.x} · y {hover.y} · z {hover.z}
        </span>
        <span className="status-block">{BLOCKS[hover.block]?.name}</span>
      </>
    );
  }

  return (
    <>
      <aside className="sidebar left">
        <Section title="3D model">
          <div className="image-panel">
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
            {model ? (
              <div className="thumb-row">
                <div className="thumb model-thumb" aria-hidden="true">
                  <Icon name="cube" size={30} />
                </div>
                <div className="thumb-meta">
                  <span className="thumb-name" title={model.name}>{model.name}</span>
                  <span className="muted small">{plural(model.triangles, 'triangle')}</span>
                  <button type="button" className="btn small" onClick={() => fileInput.current?.click()} disabled={loading}>
                    <Icon name="upload" size={15} /> Change
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="dropzone" onClick={() => fileInput.current?.click()} disabled={loading}>
                <Icon name="cube" size={28} />
                <span>
                  <strong>{loading ? 'Loading…' : 'Choose a 3D model'}</strong> or drop it anywhere
                </span>
                <span className="muted small">GLB, glTF or STL · stays on your computer</span>
              </button>
            )}
            {model?.warnings.map((w) => (
              <p key={w} className="note info">{w}</p>
            ))}
            {loadError && <p className="note warn">{loadError}</p>}
          </div>
        </Section>

        <Section title="Size & orientation">
          <div className="field">
            <div className="slider-label">
              <span className="field-label">Longest side</span>
              <span className="num small">{settings.size} blocks</span>
            </div>
            <input
              type="range"
              min={MIN_MODEL_SIZE}
              max={MAX_MODEL_SIZE}
              value={settings.size}
              onChange={(e) => update({ size: Number(e.target.value) })}
              aria-label="Blocks along the longest side"
            />
            <div className="segmented small" role="group" aria-label="Size presets">
              {MODEL_SIZE_PRESETS.map((n) => (
                <button key={n} type="button" className={settings.size === n ? 'is-active' : ''} onClick={() => update({ size: n })}>
                  {n}
                </button>
              ))}
            </div>
            {dims && (
              <p className="small muted num">
                {dims[0]} × {dims[1]} × {dims[2]} (W × H × L)
                {dims[1] > 384 ? ' · taller than the world height (384)' : ''}
              </p>
            )}
          </div>

          <div className="field">
            <span className="field-label">Up axis</span>
            <div className="segmented small" role="group" aria-label="Up axis">
              <button type="button" className={settings.up === 'y' ? 'is-active' : ''} onClick={() => update({ up: 'y' })} title="glTF and most game models">
                Y up
              </button>
              <button type="button" className={settings.up === 'z' ? 'is-active' : ''} onClick={() => update({ up: 'z' })} title="Most STL, CAD and 3D-printing models">
                Z up
              </button>
            </div>
            <p className="small muted">Switch it if the model lies on its back.</p>
          </div>

          <div className="field">
            <span className="field-label">
              Turn <span className="muted">· front faces {FRONT[settings.turns]}</span>
            </span>
            <div className="segmented small" role="group" aria-label="Turn">
              {[0, 1, 2, 3].map((t) => (
                <button key={t} type="button" className={settings.turns === t ? 'is-active' : ''} onClick={() => update({ turns: t })}>
                  {t * 90}°
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label">Inside</span>
            <div className="segmented small" role="group" aria-label="Inside">
              <button type="button" className={settings.interior === 'hollow' ? 'is-active' : ''} onClick={() => update({ interior: 'hollow' })}>
                Hollow
              </button>
              <button type="button" className={settings.interior === 'solid' ? 'is-active' : ''} onClick={() => update({ interior: 'solid' })}>
                Solid
              </button>
            </div>
            <p className="small muted">
              {settings.interior === 'hollow'
                ? 'A one-block shell: far fewer blocks, looks the same from outside.'
                : 'Filled inside with the nearest surface block. Models with holes stay hollow.'}
            </p>
          </div>

          <div className="field">
            <span className="field-label">Colours</span>
            <div className="segmented small" role="group" aria-label="Colours">
              <button type="button" className={settings.colorMode === 'match' ? 'is-active' : ''} onClick={() => update({ colorMode: 'match' })}>
                Match model
              </button>
              <button type="button" className={settings.colorMode === 'single' ? 'is-active' : ''} onClick={() => update({ colorMode: 'single' })}>
                One block
              </button>
            </div>
            {settings.colorMode === 'single' && (
              <>
                <button type="button" className="block-chip" onClick={togglePicker} aria-expanded={!!pickerAt} title="Block for the whole model">
                  <BlockSwatch block={singleBlock} orientation="wall" size={22} />
                  <span className="chip-name">{singleBlock?.name ?? 'Choose a block'}</span>
                  <Icon name="chevron" size={14} />
                </button>
                {pickerAt && (
                  <BlockPicker
                    orientation="wall"
                    current={single ?? 0}
                    recent={[]}
                    style={pickerAt}
                    onSelect={(v) => {
                      update({ singleBlock: BLOCKS[v].id });
                      setPickerAt(null);
                    }}
                    onClose={() => setPickerAt(null)}
                  />
                )}
              </>
            )}
          </div>
        </Section>

        {settings.colorMode === 'match' && (
          <Section title="Matching">
            <MatchingPanel settings={settings} update={update} noDiffusion />
          </Section>
        )}

        <Section title="Export">
          <ExportPanel target={{ kind: 'model', volume: result?.volume ?? null, snapshot }} blockCount={blockCount} name={name} setName={setName} />
        </Section>
      </aside>

      <main className="workspace">
        <div className="toolbar">
          <div className="tool-group">
            <div className="segmented small" role="group" aria-label="Show">
              <button type="button" className={view === 'blocks' ? 'is-active' : ''} onClick={() => setView('blocks')} disabled={!model}>
                Blocks
              </button>
              <button type="button" className={view === 'source' ? 'is-active' : ''} onClick={() => setView('source')} disabled={!model}>
                Original model
              </button>
            </div>
          </div>
          <div className="tool-group push-right">
            <button type="button" className="icon-btn" onClick={() => previewRef.current?.fit()} disabled={!result} title="Fit the model in view" aria-label="Fit">
              <Icon name="fit" />
            </button>
          </div>
        </div>
        <div className="work-row">
          <div className="stage">
            {(builder.error || noBlocks) && (
              <div className="stage-banners">
                {noBlocks && <div className="banner">No blocks are enabled. Choose some in the Blocks tab.</div>}
                {builder.error && <div className="banner">Building failed: {builder.error}</div>}
              </div>
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
              <div className="empty">
                <Icon name="cube" size={40} />
                <p>
                  <strong>Drop a 3D model here</strong> or choose one on the left.
                </p>
                <p className="muted small">
                  GLB / glTF (with colours and textures) or STL. It’s turned into blocks right in your browser and exported as a
                  3D .schem or .litematic.
                </p>
              </div>
            )}
            {(builder.busy || loading) && <div className="busy">{loading ? 'Loading model…' : 'Building…'}</div>}
          </div>
        </div>
        <footer className="statusbar">
          <div className="status-left">{status}</div>
          <div className="status-right muted num">
            {result &&
              `${result.volume.width} × ${result.volume.height} × ${result.volume.length} · ${plural(blockCount, 'block')}` +
                (result.interiorCount ? ` (${result.interiorCount.toLocaleString()} inside)` : '')}
          </div>
        </footer>
      </main>

      <aside className="sidebar right">
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'blocks'} className={tab === 'blocks' ? 'is-active' : ''} onClick={() => setTab('blocks')}>
            Blocks <span className="badge">{settings.enabled.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'materials'} className={tab === 'materials' ? 'is-active' : ''} onClick={() => setTab('materials')}>
            Materials <span className="badge">{counts.size}</span>
          </button>
        </div>
        <div className="tab-body">
          {tab === 'blocks' && <EnabledBlocks settings={settings} update={update} />}
          {tab === 'materials' && <MaterialsList counts={counts} orientation="wall" />}
        </div>
      </aside>
    </>
  );
}

function EnabledBlocks({ settings, update }: { settings: ModelSettings; update: (p: Partial<ModelSettings>) => void }) {
  const enabled = useMemo(() => new Set(settings.enabled), [settings.enabled]);
  const setEnabled = useCallback((next: Set<string>) => update({ enabled: [...next] }), [update]);
  return (
    <>
      {settings.colorMode === 'single' && <p className="note info pad-note">“One block” is on, so this list isn’t used right now.</p>}
      <BlockPalettePanel enabled={enabled} setEnabled={setEnabled} orientation="wall" />
    </>
  );
}
