# Make the Schem

Turn an image into one-layer Minecraft pixel art, as a wall or a floor, then edit it block by block and export a
Sponge v3 `.schem` for WorldEdit or FAWE. Everything runs locally in your browser.

## Run

Requires Node 18+ and Minecraft Java **26.3** installed through the official launcher (launch it once so
`%APPDATA%\.minecraft\versions\26.3\26.3.jar` exists).

```sh
npm install
npm run dev        # http://localhost:5173
```

The first `dev`/`build` reads the block list, colours and textures from your jar into `src/data/blocks.json` and
`public/atlas.png`. These contain Mojang assets, so they are git-ignored. Don't publish them.

Other Minecraft versions: `npm run extract -- "<path to version jar>"` (add `--list` to print every block it keeps).

## Use

1. Drop an image anywhere, or start with a blank canvas.
2. Pick **Wall** or **Floor**, the size (aspect lock, presets) and the resize mode. Dithering is optional.
   **Remove background** detects the colour along the image edges and turns it into air. **Outside only** keeps
   enclosed areas such as white letters inside a logo. **Everywhere** removes that colour in holes too. Raise
   **Tolerance** if a fringe is left. Images that already have transparency need no removal.
3. Choose the blocks to generate from in the **Blocks** tab (categories, individual blocks, search, presets).
4. Edit: brush `B`, eraser `E`, pick `I` (or right-click / Alt+click), fill `G`, replace all `R`, brush size `[` `]`,
   undo `Ctrl+Z`, redo `Ctrl+Y`, fit `F`. Zoom with the wheel; pan with Space+drag or the middle mouse button.
5. Measure: **rulers** along the top and right edges show block distances from the build's origin corner. They count x
   from the left; on walls y counts up from the bottom (height above the paste point); on floors z counts down from
   the north edge. The numbering adapts to the zoom level, and the thick grid lines fall every 10 blocks to match.
   The **measure tool** `M` works by dragging between two blocks. It shows the span (e.g. `13 × 6 blocks`, both end blocks
   counted), Δx/Δy and the straight-line distance. Shift keeps the line straight, and the measurement stays visible while
   you paint. `Esc` clears it.
6. Check the **Materials** tab for a survival shopping list, then **Download .schem**.

In game: put the file in `plugins/WorldEdit/schematics/` (server) or `config/worldedit/schematics/` (mod), then run
`//schem load <name>` and `//paste -a`. Walls face south (view them from the south side) and floors read with north at
the top. Use `//rotate` before pasting to turn them.

## Blocks

Only blocks that stay put and look the same from every visible side are offered. The block list leaves out:
- transparent, tinted and non-full blocks;
- block entities and redstone components;
- live coral, unwaxed copper, mycelium and nylium;
- infested and technical blocks.

Sand, gravel and concrete powder are listed under **Gravity** and are off by default. Matching uses each block's
average texture colour in OKLab, with the top face for floors and the side face for walls.

## Develop

```sh
npm test           # core logic: matching, grid editing, NBT, .schem round trip
npm run typecheck
npm run build
```
