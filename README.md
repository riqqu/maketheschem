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

1. Drop an image anywhere, start with a blank canvas, or open a `.schem` to keep editing it.
2. Pick **Wall** or **Floor**, the size (aspect lock, presets) and the resize mode.
   **Remove background** detects the colour along the image edges and turns it into air. **Outside only** keeps
   enclosed areas such as white letters inside a logo. **Everywhere** removes that colour in holes too. Raise
   **Tolerance** if a fringe is left. Images that already have transparency need no removal.
3. Tune the **Matching**:
   - **Prefer smooth textures** steers away from noisy or patterned blocks (ores, glazed terracotta, logs) unless
     they match much better.
   - **Dithering**: *Smooth* (error diffusion) for gradients, *Pattern* (ordered 8×8) for a tidier look that is
     easier to build by hand.
   - **Limit block types** picks the N blocks that represent the image best, which means fewer blocks to collect
     in survival.
4. Choose the blocks to generate from in the **Blocks** tab (categories, individual blocks, search, presets).
5. Edit. The tools are in the rail left of the canvas:

   | Tool | Key | Notes |
   |---|---|---|
   | Brush / Eraser | `B` / `E` | `[` `]` change the size |
   | Line / Rectangle | `L` / `U` | Shift snaps to 45° / a square; the rectangle can be an outline or filled |
   | Fill / Replace all | `G` / `R` | |
   | Pick block | `I` | or right-click / Alt+click with any tool |
   | Select | `S` | drag to select, drag inside to move; `Ctrl+C` `Ctrl+X` `Ctrl+V` `Delete`, `Ctrl+A`; `Enter` places a moved or pasted part, `Esc` cancels. Air in a pasted part is see-through. |
   | Measure | `M` | see below |

   Flip and 180° turns work on the selection, or on the whole art when nothing is selected. A 90° turn needs a
   selection (turn whole builds with `//rotate` in game). `O` lays the source image over the blocks for comparison.
   Undo `Ctrl+Z`, redo `Ctrl+Y`, fit `F`. Zoom with the wheel; pan with Space+drag or the middle mouse button.
6. Measure: **rulers** along the top and right edges show block distances from the build's origin corner. They count x
   from the left; on walls y counts up from the bottom (height above the paste point); on floors z counts down from
   the north edge. The numbering adapts to the zoom level, and the thick grid lines fall every 10 blocks to match.
   The **measure tool** `M` works by dragging between two blocks. It shows the span (e.g. `13 × 6 blocks`, both end blocks
   counted), Δx/Δy and the straight-line distance. Shift keeps the line straight, and the measurement stays visible while
   you paint. `Esc` clears it.
7. Check the **Materials** tab for a survival shopping list, then export:
   - **.schem** for WorldEdit / FAWE, or **.litematic** for Litematica (in-game hologram and material list);
   - **Wall faces**: the side the picture is seen from (south, west, north or east), so no `//rotate` is needed;
   - **Download preview .png**: an image of the art with textures, for sharing.

**History.** Every art (each image you load, blank canvas or opened `.schem`) is saved automatically in this
browser and listed in the **History** tab, newest first, with a thumbnail. Click one to continue where you left off;
the last one reopens when you come back. It keeps the original image, so settings can still be changed and
regenerated later. Undo steps are not kept between sessions. The history holds the 40 most recent arts and lives
in the browser's storage: clearing site data deletes it.

In game: put a `.schem` in `plugins/WorldEdit/schematics/` (server) or `config/worldedit/schematics/` (mod), then run
`//schem load <name>` and `//paste -a`. Put a `.litematic` in `.minecraft/schematics/` and load it from Litematica's
menu (`M`). Floors read with north at the top.

Opening a `.schem` works for one-block-thick builds (a wall or a floor) in the Sponge format written by WorldEdit 7+
and this app. Blocks that aren't in the usable block list become air (you'll see how many).

## Blocks

Only blocks that stay put and look the same from every visible side are offered. The block list leaves out:
- transparent, tinted and non-full blocks;
- block entities and redstone components;
- live coral, unwaxed copper, mycelium and nylium;
- infested and technical blocks.

Sand, gravel and concrete powder are listed under **Gravity** and are off by default. Matching uses each block's
average texture colour in OKLab, with the top face for floors and the side face for walls. The extractor also
measures how noisy each texture is (for **Prefer smooth textures**). When that data format changes, the next
`dev`/`build` re-extracts it from your jar automatically.

## Develop

```sh
npm test           # core logic: matching, dithering, grid editing and shapes, NBT, .schem / .litematic, history encoding
npm run typecheck
npm run build
```
