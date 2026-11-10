import { useState } from 'react';
import { BLOCKS, blockData } from '../data';
import type { Grid } from '../core/grid';
import type { Facing } from '../core/layout';
import { buildLitematic } from '../core/litematic';
import { buildSchem, schemDimensions } from '../core/schem';
import type { Orientation } from '../core/types';
import { loadJSON, saveJSON } from '../lib/storage';
import { canvasToBlob, downloadBlob, MIN_TEXTURE_SCALE, pngScale, renderArt, type AtlasInfo } from '../lib/render';
import { Icon } from './Icon';

/** WorldEdit command-friendly file name. */
export const sanitizeName = (s: string) =>
  s.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'pixel_art';

type Format = 'schem' | 'litematic';
const LS_FORMAT = 'mts.exportFormat';

const FACING_LABEL: Record<Facing, string> = { south: 'South', west: 'West', north: 'North', east: 'East' };
const FACING_ORDER: Facing[] = ['south', 'west', 'north', 'east'];

interface Props {
  grid: Grid | null;
  orientation: Orientation;
  facing: Facing;
  setFacing: (f: Facing) => void;
  blockCount: number;
  name: string;
  setName: (s: string) => void;
  atlas: AtlasInfo;
}

export function ExportPanel({ grid, orientation, facing, setFacing, blockCount, name, setName, atlas }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormatState] = useState<Format>(() => (loadJSON<string>(LS_FORMAT, 'schem') === 'litematic' ? 'litematic' : 'schem'));
  const setFormat = (f: Format) => {
    setFormatState(f);
    saveJSON(LS_FORMAT, f);
  };
  const fileName = sanitizeName(name);
  const wallFacing: Facing = orientation === 'wall' ? facing : 'south';
  const dims = grid ? schemDimensions(grid.width, grid.height, orientation, wallFacing) : null;

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

  const download = () =>
    run(async () => {
      if (!grid) return;
      const input = { grid, blocks: BLOCKS, orientation, facing: wallFacing, dataVersion: blockData.dataVersion, name: fileName };
      const bytes = format === 'litematic' ? await buildLitematic(input) : await buildSchem(input);
      downloadBlob(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }), `${fileName}.${format}`);
    });

  const downloadPng = () =>
    run(async () => {
      if (!grid) return;
      const px = pngScale(grid);
      const blob = await canvasToBlob(renderArt(grid, BLOCKS, orientation, px, true, atlas));
      if (!blob) throw new Error('Could not create the image');
      downloadBlob(blob, `${fileName}.png`);
    });

  const pngPx = grid ? pngScale(grid) : 16;
  const corner =
    orientation === 'floor' ? 'north-west corner' : `bottom-left corner (as seen from the ${wallFacing} side)`;

  return (
    <div className="export">
      <label className="field">
        <span className="field-label">File name</span>
        <div className="input-suffix">
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setName(fileName)} spellCheck={false} />
          <span className="muted">.{format}</span>
        </div>
      </label>

      <div className="field">
        <span className="field-label">Format <span className="muted">· {format === 'schem' ? 'WorldEdit / FAWE' : 'Litematica mod'}</span></span>
        <div className="segmented small" role="group" aria-label="Export format">
          <button type="button" className={format === 'schem' ? 'is-active' : ''} onClick={() => setFormat('schem')} title="Sponge schematic for WorldEdit / FAWE">
            .schem
          </button>
          <button type="button" className={format === 'litematic' ? 'is-active' : ''} onClick={() => setFormat('litematic')} title="Litematica schematic: in-game hologram and material list">
            .litematic
          </button>
        </div>
      </div>

      {orientation === 'wall' && (
        <div className="field">
          <span className="field-label">Wall faces</span>
          <div className="segmented small" role="group" aria-label="Wall facing">
            {FACING_ORDER.map((f) => (
              <button key={f} type="button" className={facing === f ? 'is-active' : ''} onClick={() => setFacing(f)} title={`Viewed from the ${f} side`}>
                {FACING_LABEL[f]}
              </button>
            ))}
          </div>
        </div>
      )}

      {dims && (
        <p className="small muted">
          {dims.width} × {dims.height} × {dims.length} (W × H × L) · {orientation} · {blockCount.toLocaleString()} blocks · data
          version {blockData.dataVersion}
        </p>
      )}
      <button type="button" className="btn primary wide" onClick={download} disabled={!grid || blockCount === 0 || busy}>
        <Icon name="download" /> {busy ? 'Building…' : `Download .${format}`}
      </button>
      <button
        type="button"
        className="btn small"
        onClick={downloadPng}
        disabled={!grid || blockCount === 0 || busy}
        title={`${pngPx} px per block${pngPx >= MIN_TEXTURE_SCALE ? ', with textures' : ', flat colours (the art is too large for textures)'}`}
      >
        <Icon name="image" size={15} /> Download preview .png
      </button>
      {error && <p className="note warn">{error}</p>}
      <details className="howto">
        <summary>How to use it in Minecraft</summary>
        {format === 'schem' ? (
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
          {orientation === 'floor'
            ? 'The floor reads correctly from above with north at the top.'
            : `The wall reads correctly from the ${wallFacing} side${format === 'schem' ? '. You can still turn it with //rotate before //paste.' : '.'}`}
        </p>
      </details>
    </div>
  );
}
