import { useEffect, useState } from 'react';
import { buildCommands, datapackFiles, functionCommand, PART_SIZE, type CommandSet, type Placement } from '../core/commands';
import { BLOCKS, blockData } from '../data';
import type { Grid } from '../core/grid';
import type { Facing } from '../core/layout';
import { buildLitematic } from '../core/litematic';
import { buildSchem, schemDimensions } from '../core/schem';
import type { Orientation } from '../core/types';
import type { Volume } from '../core/volume';
import { zip } from '../core/zip';
import { loadJSON, saveJSON } from '../lib/storage';
import { canvasToBlob, downloadBlob, MIN_TEXTURE_SCALE, pngScale, renderArt, type AtlasInfo } from '../lib/render';
import { Icon } from './Icon';

/** WorldEdit command-friendly file name. */
export const sanitizeName = (s: string) =>
  s.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'pixel_art';

type Format = 'schem' | 'litematic' | 'commands';
const FORMATS: Format[] = ['schem', 'litematic', 'commands'];
const LS_FORMAT = 'mts.exportFormat';

const FORMAT_HINT: Record<Format, string> = { schem: 'WorldEdit / FAWE', litematic: 'Litematica mod', commands: 'vanilla, no mods' };

/** Where /fill commands put the build, remembered between sessions. */
interface CommandSettings {
  relative: boolean;
  /** Offsets from the player (relative). */
  rel: { x: number; y: number; z: number };
  /** World coordinates (absolute). */
  abs: { x: number; y: number; z: number };
  clear: boolean;
}
const LS_COMMANDS = 'mts.commands.v1';
const DEFAULT_COMMANDS: CommandSettings = { relative: true, rel: { x: 0, y: 0, z: 0 }, abs: { x: 0, y: 64, z: 0 }, clear: false };

function loadCommandSettings(): CommandSettings {
  const r = loadJSON<Partial<CommandSettings> | null>(LS_COMMANDS, null) ?? {};
  const xyz = (v: unknown, d: CommandSettings['rel']) => {
    const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    const n = (k: 'x' | 'y' | 'z') => (Number.isInteger(o[k]) && Math.abs(o[k] as number) <= 30_000_000 ? (o[k] as number) : d[k]);
    return { x: n('x'), y: n('y'), z: n('z') };
  };
  return {
    relative: typeof r.relative === 'boolean' ? r.relative : DEFAULT_COMMANDS.relative,
    rel: xyz(r.rel, DEFAULT_COMMANDS.rel),
    abs: xyz(r.abs, DEFAULT_COMMANDS.abs),
    clear: typeof r.clear === 'boolean' ? r.clear : DEFAULT_COMMANDS.clear,
  };
}

/** Whole-number input that accepts a lone "-" while typing. */
function IntInput({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText((t) => (parseInt(t, 10) === value ? t : String(value))), [value]);
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        type="number"
        step={1}
        value={text}
        inputMode="numeric"
        onChange={(e) => {
          setText(e.target.value);
          const n = parseInt(e.target.value, 10);
          if (Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => setText(String(value))}
      />
    </label>
  );
}

const FACING_LABEL: Record<Facing, string> = { south: 'South', west: 'West', north: 'North', east: 'East' };
const FACING_ORDER: Facing[] = ['south', 'west', 'north', 'east'];

/** A one-layer art (wall or floor), or a 3D build from a model. */
export type ExportTarget =
  | { kind: 'art'; grid: Grid | null; orientation: Orientation; facing: Facing; setFacing: (f: Facing) => void; atlas: AtlasInfo }
  | { kind: 'model'; volume: Volume | null; snapshot: () => Promise<Blob | null> };

interface Props {
  target: ExportTarget;
  blockCount: number;
  name: string;
  setName: (s: string) => void;
}

export function ExportPanel({ target, blockCount, name, setName }: Props) {
  const art = target.kind === 'art' ? target : null;
  const grid = art?.grid ?? null;
  const volume = target.kind === 'model' ? target.volume : null;
  const orientation: Orientation = art?.orientation ?? 'wall';
  const facing: Facing = art?.facing ?? 'south';
  const ready = !!(grid || volume);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormatState] = useState<Format>(() => {
    const f = loadJSON<string>(LS_FORMAT, 'schem');
    return FORMATS.includes(f as Format) ? (f as Format) : 'schem';
  });
  const setFormat = (f: Format) => {
    setFormatState(f);
    saveJSON(LS_FORMAT, f);
  };
  const [cmd, setCmdState] = useState<CommandSettings>(loadCommandSettings);
  const setCmd = (patch: Partial<CommandSettings>) =>
    setCmdState((c) => {
      const next = { ...c, ...patch };
      saveJSON(LS_COMMANDS, next);
      return next;
    });
  /** Summary of the last generated commands; cleared when the build changes. */
  const [cmdInfo, setCmdInfo] = useState<string | null>(null);
  const fileName = sanitizeName(name);
  const wallFacing: Facing = art && orientation === 'wall' ? facing : 'south';
  const dims = volume
    ? { width: volume.width, height: volume.height, length: volume.length }
    : grid
      ? schemDimensions(grid.width, grid.height, orientation, wallFacing)
      : null;

  useEffect(() => setCmdInfo(null), [grid, volume, blockCount, orientation, wallFacing]);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const exportInput = () => {
    const meta = { blocks: BLOCKS, dataVersion: blockData.dataVersion, name: fileName };
    return volume ? { ...meta, volume } : grid ? { ...meta, grid, orientation, facing: wallFacing } : null;
  };

  const placement: Placement = cmd.relative ? { relative: true, ...cmd.rel } : { relative: false, ...cmd.abs };
  const makeCommands = (): CommandSet | null => {
    const input = exportInput();
    if (!input) return null;
    const set = buildCommands(input, { placement, clear: cmd.clear });
    const parts = Math.ceil(set.commands.length / PART_SIZE);
    setCmdInfo(
      `${set.commands.length.toLocaleString()} commands: ${set.fills.toLocaleString()} fill, ${set.setblocks.toLocaleString()} setblock` +
        (set.clears ? `, ${set.clears.toLocaleString()} to clear` : '') +
        (parts > 1 ? ` · built over ${parts} ticks` : ''),
    );
    return set;
  };

  const download = () =>
    run(async () => {
      const input = exportInput();
      if (!input) return;
      if (format === 'commands') {
        const set = makeCommands();
        if (!set) return;
        const enc = new TextEncoder();
        const files = datapackFiles(set, { name: fileName, packFormat: blockData.dataPackFormat });
        const bytes = await zip(files.map((f) => ({ path: f.path, data: enc.encode(f.text) })));
        downloadBlob(new Blob([bytes as BlobPart], { type: 'application/zip' }), `${fileName}_datapack.zip`);
        return;
      }
      const bytes = format === 'litematic' ? await buildLitematic(input) : await buildSchem(input);
      downloadBlob(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }), `${fileName}.${format}`);
    });

  const copyCommands = () =>
    run(async () => {
      const set = makeCommands();
      if (!set) return;
      // A leading slash so any single line can go straight into chat or a command block.
      await navigator.clipboard.writeText(set.commands.map((c) => `/${c}`).join('\n'));
      setCmdInfo((i) => `Copied. ${i ?? ''}`);
    });

  const downloadPng = () =>
    run(async () => {
      let blob: Blob | null = null;
      if (target.kind === 'model') blob = await target.snapshot();
      else if (grid) blob = await canvasToBlob(renderArt(grid, BLOCKS, orientation, pngScale(grid), true, target.atlas));
      else return;
      if (!blob) throw new Error('Could not create the image');
      downloadBlob(blob, `${fileName}.png`);
    });

  const pngPx = grid ? pngScale(grid) : 16;
  const corner = volume
    ? 'bottom north-west corner'
    : orientation === 'floor'
      ? 'north-west corner'
      : `bottom-left corner (as seen from the ${wallFacing} side)`;

  return (
    <div className="export">
      <label className="field">
        <span className="field-label">File name</span>
        <div className="input-suffix">
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setName(fileName)} spellCheck={false} />
          <span className="muted">{format === 'commands' ? '_datapack.zip' : `.${format}`}</span>
        </div>
      </label>

      <div className="field">
        <span className="field-label">Format <span className="muted">· {FORMAT_HINT[format]}</span></span>
        <div className="segmented small" role="group" aria-label="Export format">
          <button type="button" className={format === 'schem' ? 'is-active' : ''} onClick={() => setFormat('schem')} title="Sponge schematic for WorldEdit / FAWE">
            .schem
          </button>
          <button type="button" className={format === 'litematic' ? 'is-active' : ''} onClick={() => setFormat('litematic')} title="Litematica schematic: in-game hologram and material list">
            .litematic
          </button>
          <button type="button" className={format === 'commands' ? 'is-active' : ''} onClick={() => setFormat('commands')} title="/fill and /setblock commands in a data pack: builds it instantly in a creative world, no mods">
            Commands
          </button>
        </div>
      </div>

      {format === 'commands' && (
        <>
          <div className="field">
            <span className="field-label">Position</span>
            <div className="segmented small" role="group" aria-label="Position">
              <button type="button" className={cmd.relative ? 'is-active' : ''} onClick={() => setCmd({ relative: true })} title="Relative coordinates (~): builds wherever you run it">
                Where you stand
              </button>
              <button type="button" className={!cmd.relative ? 'is-active' : ''} onClick={() => setCmd({ relative: false })} title="Fixed world coordinates">
                Coordinates
              </button>
            </div>
            <div className="xyz-row">
              {(['x', 'y', 'z'] as const).map((k) => (
                <IntInput
                  key={`${cmd.relative}-${k}`}
                  label={cmd.relative ? (k === 'x' ? '~ east' : k === 'y' ? '~ up' : '~ south') : k}
                  value={cmd.relative ? cmd.rel[k] : cmd.abs[k]}
                  onChange={(n) => (cmd.relative ? setCmd({ rel: { ...cmd.rel, [k]: n } }) : setCmd({ abs: { ...cmd.abs, [k]: n } }))}
                />
              ))}
            </div>
            <p className="small muted">
              {cmd.relative
                ? `Where the ${corner} goes, counted from your feet. 0 0 0 puts it where you stand, like //paste.`
                : `World coordinates of the ${corner} (F3 shows yours).`}
            </p>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={cmd.clear} onChange={(e) => setCmd({ clear: e.target.checked })} />
            <span>Clear the area first</span>
            <span className="muted small">fills the build’s box with air</span>
          </label>
        </>
      )}

      {art && orientation === 'wall' && (
        <div className="field">
          <span className="field-label">Wall faces</span>
          <div className="segmented small" role="group" aria-label="Wall facing">
            {FACING_ORDER.map((f) => (
              <button key={f} type="button" className={facing === f ? 'is-active' : ''} onClick={() => art.setFacing(f)} title={`Viewed from the ${f} side`}>
                {FACING_LABEL[f]}
              </button>
            ))}
          </div>
        </div>
      )}

      {dims && (
        <p className="small muted">
          {dims.width} × {dims.height} × {dims.length} (W × H × L) · {volume ? '3D' : orientation} · {blockCount.toLocaleString()} blocks · data
          version {blockData.dataVersion}
        </p>
      )}
      <button type="button" className="btn primary wide" onClick={download} disabled={!ready || blockCount === 0 || busy}>
        <Icon name="download" /> {busy ? 'Building…' : format === 'commands' ? 'Download data pack' : `Download .${format}`}
      </button>
      {format === 'commands' && (
        <>
          <button type="button" className="btn small" onClick={copyCommands} disabled={!ready || blockCount === 0 || busy} title="One command per line, each starting with /">
            <Icon name="copy" size={15} /> Copy commands
          </button>
          {cmdInfo && <p className="small muted num">{cmdInfo}</p>}
        </>
      )}
      <button
        type="button"
        className="btn small"
        onClick={downloadPng}
        disabled={!ready || blockCount === 0 || busy}
        title={
          volume
            ? 'An image of the 3D view as it is now'
            : `${pngPx} px per block${pngPx >= MIN_TEXTURE_SCALE ? ', with textures' : ', flat colours (the art is too large for textures)'}`
        }
      >
        <Icon name="image" size={15} /> {volume ? 'Download view .png' : 'Download preview .png'}
      </button>
      {error && <p className="note warn">{error}</p>}
      <details className="howto">
        <summary>How to use it in Minecraft</summary>
        {format === 'commands' ? (
          <>
            <ol>
              <li>
                Open the world’s folder (Singleplayer → select the world → <strong>Edit</strong> → <strong>Open World Folder</strong>) and put
                the .zip in its <code>datapacks</code> folder. For a new world: <strong>More</strong> → <strong>Data Packs</strong> and drop the
                .zip there.
              </li>
              <li>
                In the world (cheats on) run <code>/reload</code>. If <code>/datapack list</code> doesn’t show it, run{' '}
                <code>/datapack enable "file/{fileName}_datapack.zip"</code>.
              </li>
              <li>
                {cmd.relative ? 'Stand where it should go' : 'Go near the build site so it’s loaded'} and run <code>{functionCommand(fileName)}</code>.
              </li>
            </ol>
            <p className="small muted">
              Big builds run in parts, one per tick. <strong>Copy commands</strong> is for small builds: chat and command blocks take one
              command at a time.
            </p>
          </>
        ) : format === 'schem' ? (
          <ol>
            <li>
              Copy the file into <code>plugins/WorldEdit/schematics/</code> on a server, or <code>config/worldedit/schematics/</code> for
              the Fabric/NeoForge mod.
            </li>
            <li>
              Run <code>//schem load {fileName}</code>
            </li>
            <li>
              Stand where the {corner} should go and run <code>//paste -a</code> (<code>-a</code> skips air so transparent areas don’t
              erase anything).
            </li>
          </ol>
        ) : (
          <ol>
            <li>
              Copy the file into <code>.minecraft/schematics/</code> (create the folder if needed).
            </li>
            <li>
              In game press <code>M</code> → <strong>Load Schematics</strong>, pick <code>{fileName}</code> and load it.
            </li>
            <li>Move the placement where you want it, then build along the hologram. The material list is in the same menu.</li>
          </ol>
        )}
        <p className="small muted">
          {format === 'commands'
            ? `The build goes east (x), up (y) and south (z) from that corner${volume ? ', with the model’s front facing the direction set under Turn' : orientation === 'wall' ? `, and the picture faces ${wallFacing}` : ''}.`
            : volume
            ? `The model's front faces the direction set under Turn. ${format === 'schem' ? 'You can still turn it with //rotate before //paste.' : 'Litematica can rotate the placement too.'}`
            : orientation === 'floor'
            ? 'The floor reads correctly from above with north at the top.'
            : `The wall reads correctly from the ${wallFacing} side${format === 'schem' ? '. You can still turn it with //rotate before //paste.' : '.'}`}
        </p>
      </details>
    </div>
  );
}
