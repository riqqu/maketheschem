import { useEffect, useState, type ReactNode } from 'react';
import { Check, Copy, Download, FolderDown, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { Field, SwitchField } from '@/components/field';
import { IconButton } from '@/components/icon-button';
import { Note } from '@/components/note';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  buildCommands, commandBlockOutputRule, commandBlockParts, commandBlockPlacement, coversCommandBlock, datapackFiles, functionCommand,
  PART_SIZE, type CommandSet, type Placement,
} from '../core/commands';
import { BLOCKS, blockData } from '../data';
import type { Grid } from '../core/grid';
import type { Facing } from '../core/layout';
import { buildLitematic } from '../core/litematic';
import { buildSchem, schemDimensions } from '../core/schem';
import type { Orientation } from '../core/types';
import type { Volume } from '../core/volume';
import { zip } from '../core/zip';
import { loadJSON, saveJSON } from '../lib/storage';
import { canvasToBlob, downloadBlob, pngScale, renderArt, type AtlasInfo } from '../lib/render';
import { loadSaves, saveDatapack, type Saves } from '../lib/saves';

/** WorldEdit command-friendly file name. */
export const sanitizeName = (s: string) =>
  s.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'pixel_art';

type Format = 'schem' | 'litematic' | 'commands';
const FORMATS: Format[] = ['schem', 'litematic', 'commands'];
const LS_FORMAT = 'mts.exportFormat';

/** How /fill commands are run and where they put the build, remembered between sessions. */
interface CommandSettings {
  /** A data pack function, or single commands pasted into a command block. */
  runWith: 'block' | 'datapack';
  relative: boolean;
  /** Offsets from the player or command block (relative). */
  rel: { x: number; y: number; z: number };
  /** World coordinates (absolute). */
  abs: { x: number; y: number; z: number };
  clear: boolean;
}
const LS_COMMANDS = 'mts.commands.v1';
const DEFAULT_COMMANDS: CommandSettings = {
  runWith: 'block', relative: true, rel: { x: 1, y: 0, z: 0 }, abs: { x: 0, y: 64, z: 0 }, clear: false,
};
/** More command block pastes than this and the data pack is suggested instead. */
const MANY_PARTS = 10;
/** Folder name of the world data packs are saved into. */
const LS_WORLD = 'mts.world';

function loadCommandSettings(): CommandSettings {
  const r = loadJSON<Partial<CommandSettings> | null>(LS_COMMANDS, null) ?? {};
  const xyz = (v: unknown, d: CommandSettings['rel']) => {
    const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    const n = (k: 'x' | 'y' | 'z') => (Number.isInteger(o[k]) && Math.abs(o[k] as number) <= 30_000_000 ? (o[k] as number) : d[k]);
    return { x: n('x'), y: n('y'), z: n('z') };
  };
  return {
    runWith: r.runWith === 'datapack' || r.runWith === 'block' ? r.runWith : DEFAULT_COMMANDS.runWith,
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
    <Field label={label}>
      <Input
        type="number"
        step={1}
        value={text}
        inputMode="numeric"
        aria-label={label}
        className="tabular-nums"
        onChange={(e) => {
          setText(e.target.value);
          const n = parseInt(e.target.value, 10);
          if (Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => setText(String(value))}
      />
    </Field>
  );
}

/** Inline code the user types in Minecraft. */
const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8em] [overflow-wrap:anywhere]">{children}</code>
);

const FACING_ORDER: Facing[] = ['south', 'west', 'north', 'east'];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

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

/** The Export button and its dialog. State lives here, outside the dialog content, so it survives closing the dialog. */
export function ExportDialog({ target, blockCount, name, setName }: Props) {
  const art = target.kind === 'art' ? target : null;
  const grid = art?.grid ?? null;
  const volume = target.kind === 'model' ? target.volume : null;
  const orientation: Orientation = art?.orientation ?? 'wall';
  const facing: Facing = art?.facing ?? 'south';
  const ready = !!(grid || volume) && blockCount > 0;
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
  /** Command block commands made last, and which of them were copied. */
  const [parts, setParts] = useState<string[] | null>(null);
  const [copied, setCopied] = useState<ReadonlySet<number>>(new Set());
  /** Your Minecraft worlds, from the dev server; null without it (a static build): download only. */
  const [saves, setSaves] = useState<Saves | null>(null);
  const [worldName, setWorldNameState] = useState(() => loadJSON<string>(LS_WORLD, ''));
  const setWorldName = (n: string) => {
    setWorldNameState(n);
    saveJSON(LS_WORLD, n);
  };
  const world = saves?.worlds.find((w) => w.name === worldName) ?? saves?.worlds[0] ?? null;
  /** World the data pack was last saved into; cleared when the build changes. */
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [fnCopied, setFnCopied] = useState(false);
  /** Format of the last successful export: its steps in Minecraft are shown until something changes. */
  const [done, setDone] = useState<Format | null>(null);
  const fileName = sanitizeName(name);
  const wallFacing: Facing = art && orientation === 'wall' ? facing : 'south';
  const dims = volume
    ? { width: volume.width, height: volume.height, length: volume.length }
    : grid
      ? schemDimensions(grid.width, grid.height, orientation, wallFacing)
      : null;

  useEffect(() => {
    setCmdInfo(null);
    setParts(null);
    setSavedTo(null);
    setDone(null);
  }, [grid, volume, blockCount, orientation, wallFacing, cmd]);

  useEffect(() => {
    let live = true;
    loadSaves().then((s) => live && setSaves(s));
    return () => {
      live = false;
    };
  }, []);

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
  const byBlock = cmd.runWith === 'block';
  const isCommands = format === 'commands';
  const blocksCommandBlock = isCommands && byBlock && !!dims && coversCommandBlock(placement, dims);
  const commandSummary = (set: CommandSet) =>
    `${set.commands.length.toLocaleString()} commands: ${set.fills.toLocaleString()} fill, ${set.setblocks.toLocaleString()} setblock` +
    (set.clears ? `, ${set.clears.toLocaleString()} to clear` : '');
  const makeCommands = (forBlock: boolean): CommandSet | null => {
    const input = exportInput();
    if (!input) return null;
    // Command block minecarts run two blocks above the command block: shift relative builds to make up for it.
    return buildCommands(input, { placement: forBlock ? commandBlockPlacement(placement) : placement, clear: cmd.clear });
  };

  const datapackZip = async () => {
    const set = makeCommands(false);
    if (!set) return null;
    const ticks = Math.ceil(set.commands.length / PART_SIZE);
    setCmdInfo(commandSummary(set) + (ticks > 1 ? ` · built over ${ticks} ticks` : ''));
    const enc = new TextEncoder();
    const files = datapackFiles(set, { name: fileName, packFormat: blockData.dataPackFormat });
    return zip(files.map((f) => ({ path: f.path, data: enc.encode(f.text) })));
  };

  const download = () =>
    run(async () => {
      const input = exportInput();
      if (!input) return;
      if (isCommands) {
        const bytes = await datapackZip();
        if (bytes) downloadBlob(new Blob([bytes as BlobPart], { type: 'application/zip' }), `${fileName}_datapack.zip`);
        setSavedTo(null);
        setDone('commands');
        return;
      }
      const bytes = format === 'litematic' ? await buildLitematic(input) : await buildSchem(input);
      downloadBlob(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }), `${fileName}.${format}`);
      setDone(format);
    });

  /** Lists the worlds again, e.g. after creating one in Minecraft. */
  const refreshWorlds = () =>
    run(async () => {
      const s = await loadSaves();
      if (!s) throw new Error('The app’s dev server is not running. Start it with npm run dev.');
      setSaves(s);
    });

  const saveToWorld = () =>
    run(async () => {
      if (!world) return;
      const bytes = await datapackZip();
      if (!bytes) return;
      await saveDatapack(world.name, `${fileName}_datapack.zip`, bytes);
      setSavedTo(world.name);
      setFnCopied(false);
      setDone('commands');
    });

  const copyFunction = () =>
    run(async () => {
      await navigator.clipboard.writeText(functionCommand(fileName));
      setFnCopied(true);
    });

  const makeParts = () =>
    run(async () => {
      const set = makeCommands(true);
      if (!set) return;
      const made = commandBlockParts(set.commands);
      setParts(made);
      setCopied(new Set());
      setCmdInfo(`${commandSummary(set)} · ${made.length === 1 ? 'one command block paste' : `${made.length} command block pastes`}`);
      setDone('commands');
    });

  const copyPart = (i: number) =>
    run(async () => {
      if (!parts) return;
      await navigator.clipboard.writeText(parts[i]);
      setCopied((c) => new Set(c).add(i));
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

  const corner = volume
    ? 'bottom north-west corner'
    : orientation === 'floor'
      ? 'north-west corner'
      : `bottom-left corner (as seen from the ${wallFacing} side)`;
  const suffix = isCommands ? '_datapack.zip' : `.${format}`;
  const disabled = !ready || busy;

  const primary =
    isCommands && byBlock ? (
      <Button onClick={makeParts} disabled={disabled || blocksCommandBlock}>
        <Copy /> {busy ? 'Building…' : 'Make commands'}
      </Button>
    ) : isCommands && world ? (
      <Button onClick={saveToWorld} disabled={disabled}>
        <FolderDown /> {busy ? 'Building…' : 'Save to world'}
      </Button>
    ) : (
      <Button onClick={download} disabled={disabled}>
        <Download /> {busy ? 'Building…' : 'Download'}
      </Button>
    );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" disabled={!ready}>
          <Download /> Export
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
        </DialogHeader>

        <div className="-mx-4 flex flex-col gap-4 overflow-y-auto px-4 pb-1 *:shrink-0">
          <Field label="File name" htmlFor="export-name">
            <div className="relative">
              <Input
                id="export-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setName(fileName)}
                spellCheck={false}
                style={{ paddingRight: `${suffix.length + 2}ch` }}
              />
              <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-muted-foreground">{suffix}</span>
            </div>
          </Field>

          <Field label="Format">
            <Segmented
              label="Format"
              value={format}
              onChange={setFormat}
              options={[
                { value: 'schem', label: '.schem', tooltip: 'WorldEdit / FAWE' },
                { value: 'litematic', label: '.litematic', tooltip: 'Litematica: in-game hologram and material list' },
                { value: 'commands', label: 'Commands', tooltip: 'Vanilla /fill commands, no mods' },
              ]}
            />
          </Field>

          {art && orientation === 'wall' && (
            <Field label="Wall faces">
              <Segmented label="Wall faces" value={facing} onChange={art.setFacing} options={FACING_ORDER.map((f) => ({ value: f, label: cap(f) }))} />
            </Field>
          )}

          {isCommands && (
            <>
              <Field label="Run with">
                <Segmented
                  label="Run with"
                  value={cmd.runWith}
                  onChange={(runWith) => setCmd({ runWith })}
                  options={[
                    { value: 'block', label: 'Command block', tooltip: 'Paste into a command block; big builds take several pastes' },
                    { value: 'datapack', label: 'Data pack', tooltip: 'Any size in one go' },
                  ]}
                />
              </Field>
              {!byBlock && saves && (
                <Field label="World">
                  <div className="flex gap-1.5">
                    {saves.worlds.length ? (
                      <Select value={world?.name ?? ''} onValueChange={setWorldName}>
                        <SelectTrigger className="min-w-0 flex-1" aria-label="Minecraft world">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {saves.worlds.map((w) => (
                            <SelectItem key={w.name} value={w.name}>
                              {w.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="flex-1 self-center text-muted-foreground">No worlds yet</p>
                    )}
                    <IconButton icon={RefreshCw} label="Refresh worlds" variant="outline" onClick={refreshWorlds} disabled={busy} />
                  </div>
                </Field>
              )}
              <Field label="Position">
                <Segmented
                  label="Position"
                  value={cmd.relative ? 'rel' : 'abs'}
                  onChange={(v) => setCmd({ relative: v === 'rel' })}
                  options={[
                    { value: 'rel', label: byBlock ? 'From command block' : 'From you', tooltip: `Where the ${corner} goes, relative (~)` },
                    { value: 'abs', label: 'Coordinates', tooltip: `World coordinates of the ${corner}` },
                  ]}
                />
                <div className="grid grid-cols-3 gap-1.5">
                  {(['x', 'y', 'z'] as const).map((k) => (
                    <IntInput
                      key={`${cmd.relative}-${k}`}
                      label={cmd.relative ? (k === 'x' ? '~ east' : k === 'y' ? '~ up' : '~ south') : k}
                      value={cmd.relative ? cmd.rel[k] : cmd.abs[k]}
                      onChange={(n) => (cmd.relative ? setCmd({ rel: { ...cmd.rel, [k]: n } }) : setCmd({ abs: { ...cmd.abs, [k]: n } }))}
                    />
                  ))}
                </div>
                {blocksCommandBlock && <Note>The build would cover the command block or the 3 blocks above it. Move it, e.g. 1 east.</Note>}
              </Field>
              <SwitchField label="Clear the area first" checked={cmd.clear} onChange={(clear) => setCmd({ clear })} />
            </>
          )}

          {isCommands && cmdInfo && <p className="text-xs tabular-nums text-muted-foreground">{cmdInfo}</p>}

          {isCommands && byBlock && parts && (
            <>
              {parts.length > MANY_PARTS && (
                <Note>
                  That’s {parts.length} pastes. A data pack builds it in one go.{' '}
                  <button type="button" className="font-medium underline" onClick={() => setCmd({ runWith: 'datapack' })}>
                    Use a data pack
                  </button>
                </Note>
              )}
              <ol className="grid max-h-56 gap-1 overflow-y-auto">
                {parts.map((p, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-lg border py-1 pr-1 pl-3 data-[copied=true]:bg-muted" data-copied={copied.has(i)}>
                    <span className="flex-1 truncate font-medium">
                      Part {i + 1}
                      {parts.length > 1 ? ` of ${parts.length}` : ''}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">{p.length.toLocaleString()} chars</span>
                    <Button variant="outline" size="sm" onClick={() => copyPart(i)}>
                      {copied.has(i) ? <Check /> : <Copy />} {copied.has(i) ? 'Copied' : 'Copy'}
                    </Button>
                  </li>
                ))}
              </ol>
            </>
          )}

          {isCommands && !byBlock && savedTo && (
            <Note tone="info" className="flex items-center gap-3">
              <span className="flex-1">
                Saved to <strong className="text-foreground">{savedTo}</strong>. Run <Code>/reload</Code>, then <Code>{functionCommand(fileName)}</Code>
              </span>
              <Button variant="outline" size="sm" onClick={copyFunction}>
                {fnCopied ? <Check /> : <Copy />} {fnCopied ? 'Copied' : 'Copy'}
              </Button>
            </Note>
          )}

          {done === format && (
            <Steps
              format={format}
              byBlock={byBlock}
              saved={!!savedTo}
              relative={cmd.relative}
              fileName={fileName}
              corner={corner}
              orientation={volume ? null : orientation}
              wallFacing={wallFacing}
            />
          )}

          {error && <Note>{error}</Note>}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-xs tabular-nums text-muted-foreground">
            {dims && `${dims.width} × ${dims.height} × ${dims.length} · ${blockCount.toLocaleString()} blocks`}
          </span>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={downloadPng} disabled={disabled}>
              <ImageIcon /> .png
            </Button>
            {isCommands && !byBlock && world && (
              <Button variant="ghost" onClick={download} disabled={disabled}>
                <Download /> .zip
              </Button>
            )}
            {primary}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** What to do in Minecraft with what was just exported. */
function Steps({
  format, byBlock, saved, relative, fileName, corner, orientation, wallFacing,
}: {
  format: Format;
  byBlock: boolean;
  saved: boolean;
  relative: boolean;
  fileName: string;
  corner: string;
  /** Null for a 3D build. */
  orientation: Orientation | null;
  wallFacing: Facing;
}) {
  let steps: ReactNode[];
  if (format === 'commands' && byBlock) {
    steps = [
      <>
        Get a command block with <Code>/give @s command_block</Code>. Place it outside the build with 3 empty blocks above it and a button on its
        side.
      </>,
      <>Copy part 1, paste it into the command block, click Done and press the button.</>,
      <>Repeat with each next part, one at a time.</>,
      <>
        <Code>/gamerule {commandBlockOutputRule(blockData.dataPackFormat)} false</Code> stops the chat messages.
      </>,
    ];
  } else if (format === 'commands') {
    steps = [
      ...(saved
        ? []
        : [
            <>
              Put the .zip in the world’s <Code>datapacks</Code> folder (Singleplayer → select the world → Edit → Open World Folder).
            </>,
          ]),
      <>
        Run <Code>/reload</Code>. If <Code>/datapack list</Code> doesn’t show it, run <Code>/datapack enable "file/{fileName}_datapack.zip"</Code>.
      </>,
      <>
        {relative ? 'Stand where it should go' : 'Go near the build site'} and run <Code>{functionCommand(fileName)}</Code>.
      </>,
    ];
  } else if (format === 'schem') {
    steps = [
      <>
        Copy the file into <Code>plugins/WorldEdit/schematics/</Code> on a server, or <Code>config/worldedit/schematics/</Code> for the mod.
      </>,
      <>
        Run <Code>//schem load {fileName}</Code>.
      </>,
      <>
        Stand where the {corner} should go and run <Code>//paste -a</Code>.
      </>,
    ];
  } else {
    steps = [
      <>
        Copy the file into <Code>.minecraft/schematics/</Code>.
      </>,
      <>
        Press <Code>M</Code> → Load Schematics and load <Code>{fileName}</Code>.
      </>,
      <>Move the placement where you want it and build along the hologram.</>,
    ];
  }
  const facingNote =
    orientation === null ? 'The model’s front faces the direction set under Turn.' : orientation === 'floor' ? 'North is at the top.' : `The picture faces ${wallFacing}.`;
  return (
    <div className="grid gap-2 rounded-lg bg-muted/60 p-3">
      <h3 className="text-xs font-medium text-muted-foreground">In Minecraft</h3>
      <ol className="grid list-decimal gap-1.5 pl-4 leading-relaxed">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">{facingNote}</p>
    </div>
  );
}
