import { useState } from 'react';
import { BLOCKS, blockData } from '../data';
import type { Grid } from '../core/grid';
import { buildSchem, schemDimensions } from '../core/schem';
import type { Orientation } from '../core/types';
import { Icon } from './Icon';

/** WorldEdit command-friendly file name. */
export const sanitizeName = (s: string) =>
  s.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'pixel_art';

interface Props {
  grid: Grid | null;
  orientation: Orientation;
  blockCount: number;
  name: string;
  setName: (s: string) => void;
}

export function ExportPanel({ grid, orientation, blockCount, name, setName }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileName = sanitizeName(name);
  const dims = grid ? schemDimensions(grid.width, grid.height, orientation) : null;

  const download = async () => {
    if (!grid) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = await buildSchem({
        grid,
        blocks: BLOCKS,
        orientation,
        dataVersion: blockData.dataVersion,
        name: fileName,
      });
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.schem`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="export">
      <label className="field">
        <span className="field-label">File name</span>
        <div className="input-suffix">
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setName(fileName)} spellCheck={false} />
          <span className="muted">.schem</span>
        </div>
      </label>
      {dims && (
        <p className="small muted">
          {dims.width} × {dims.height} × {dims.length} (W × H × L) · {orientation === 'floor' ? 'floor' : 'wall'} ·{' '}
          {blockCount.toLocaleString()} blocks · data version {blockData.dataVersion}
        </p>
      )}
      <button type="button" className="btn primary wide" onClick={download} disabled={!grid || blockCount === 0 || busy}>
        <Icon name="download" /> {busy ? 'Building…' : 'Download .schem'}
      </button>
      {error && <p className="note warn">{error}</p>}
      <details className="howto">
        <summary>How to paste it in Minecraft</summary>
        <ol>
          <li>
            Copy the file into <code>plugins/WorldEdit/schematics/</code> on a server, or <code>config/worldedit/schematics/</code> for the
            Fabric/NeoForge mod.
          </li>
          <li>
            Run <code>//schem load {fileName}</code>
          </li>
          <li>
            Stand where the {orientation === 'floor' ? 'north-west corner' : 'bottom-left corner'} should go and run <code>//paste -a</code>{' '}
            (<code>-a</code> skips air so transparent areas don’t erase anything).
          </li>
        </ol>
        <p className="small muted">
          {orientation === 'floor'
            ? 'The floor reads correctly from above with north at the top.'
            : 'The wall is built facing south: view it from the south side looking north. Use //rotate before //paste to face another way.'}
        </p>
      </details>
    </div>
  );
}
