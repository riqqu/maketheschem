# Make the Schem

Turn an image into one-layer Minecraft pixel art, as a wall or a floor, then edit it block by block and export a
Sponge v3 `.schem` for WorldEdit or FAWE. Or turn a 3D model into a full 3D build. Everything runs locally in your
browser.

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
7. Check the **Materials** tab for a survival shopping list, then click **Export** (top right). The dialog shows the steps
   for Minecraft after each export:
   - **.schem** for WorldEdit / FAWE, or **.litematic** for Litematica (in-game hologram and material list);
   - **Commands**: a data pack of vanilla `/fill` and `/setblock` commands that builds it instantly in a creative
     world, no mods (see below);
   - **Wall faces**: the side the picture is seen from (south, west, north or east), so no `//rotate` is needed;
   - **.png**: an image of the art with textures, for sharing.

**History.** Every art (each image you load, blank canvas or opened `.schem`) is saved automatically in this
browser and listed in the **History** tab, newest first, with a thumbnail. Click one to continue where you left off;
the last one reopens when you come back. It keeps the original image, so settings can still be changed and
regenerated later. Undo steps are not kept between sessions. The history holds the 40 most recent arts and lives
in the browser's storage: clearing site data deletes it.

In game: put a `.schem` in `plugins/WorldEdit/schematics/` (server) or `config/worldedit/schematics/` (mod), then run
`//schem load <name>` and `//paste -a`. Put a `.litematic` in `.minecraft/schematics/` and load it from Litematica's
menu (`M`). Floors read with north at the top.

**Commands (no mods).** Pick **Commands** as the format. Neighbouring blocks of the same kind are merged into
`/fill` boxes (each at most 32,768 blocks, the game's default limit), and single blocks become `/setblock`.
- **Run with: Command block** (no files needed): **Make commands** packs everything into as few single
  commands as fit a command block (32,500 characters each), listed as Part 1, Part 2, … with a **Copy** button each.
  Each part is one `/summon` of a falling redstone block and activator rail carrying command block minecarts, one
  per command (the "one command" technique from the Minecraft Wiki). The minecarts run their commands, then the
  rail and redstone block clear themselves, leaving the command block for the next part. Place the command block
  outside the build with 3 free blocks above it and a button on its side, then for each part: paste, **Done**,
  press the button. Paste one part at a time; a command block can't take several commands.
- **Run with: Data pack**: **Download** gives `<name>_datapack.zip`. Put it in the world's `datapacks` folder
  (Singleplayer → select the world → Edit → Open World Folder), run `/reload`, then `/function mts:<name>`. Builds
  with more than 20,000 commands run in parts, one per tick (a function stops after 65,536 commands). For relative
  placement a marker entity remembers where you ran it. The pack targets the data pack format read from your jar.
  With `npm run dev` (or `npm run preview`) there's no file handling at all: pick the world under **World**
  (your worlds, last played first) and **Save to world** writes `<name>_datapack.zip` into its `datapacks` folder. The
  dev server does the writing, because browsers refuse folders inside AppData. It reads the launcher's default
  saves folder (`%APPDATA%\.minecraft\saves`, `~/Library/Application Support/minecraft/saves` or
  `~/.minecraft/saves`); for another launcher start it with `MTS_SAVES=<saves folder>`.
- **Position**: relative (`~`) counts from the command block, or from where you stand for the data pack. The x/y/z
  fields move the build's bottom north-west corner (x east, y up, z south). **Coordinates** writes fixed world
  coordinates instead.
- **Clear the area first** fills the build's box with air before placing blocks, so the build is clean even over
  terrain or an earlier copy.

Opening a `.schem` works for one-block-thick builds (a wall or a floor) in the Sponge format written by WorldEdit 7+
and this app. Blocks that aren't in the usable block list become air (you'll see how many).

## 3D models

Switch to **3D model** at the top, or just drop a `.glb`, `.gltf` or `.stl` file anywhere.

1. **Size & orientation**
   - **Longest side**: 4 to 256 blocks. The other sides keep the model's proportions; the result is shown as W × H × L.
   - **Up axis**: glTF models are Y-up and STL models usually Z-up (picked automatically). Switch it if the model
     lies on its back.
   - **Turn**: quarter turns seen from above. The label says which way the model's front faces.
   - **Inside**: **Hollow** builds a closed one-block shell (far fewer blocks). **Solid** also fills the inside with
     the nearest surface block. Models with holes in their surface stay hollow.
2. **Colours**: **Match model** uses the model's textures, vertex colours and material colours. Faces that point
   up or down are matched with the blocks' top textures, the rest with their side textures. **One block** builds
   everything from a single block, which is the default for STL files since they have no colours.
   Transparent materials are skipped, and cut-out texture areas (leaves, fences) become air.
3. **Matching** works as for images: smooth textures, **Pattern** dithering (laid on each surface) and **Limit block
   types**. The **Blocks** tab chooses which blocks may be used.
4. The preview can be turned (drag), panned (right-drag) and zoomed (wheel). Hover a block to see its position and
   name. **Original** shows the model itself at the same place for comparison.
5. **Export** writes a 3D `.schem`, `.litematic` or **Commands** data pack, and a `.png` of the current view. Paste
   it with the bottom north-west corner at your position (`//paste -a`), or run the data pack's function.

Limits: only self-contained files are supported, so export a `.gltf` that uses separate `.bin` or image files as a
single `.glb`. Draco-compressed meshes and KTX2 textures can't be read; meshopt compression works. Models are not
kept in the History and can't be edited block by block yet. The 3D mode loads on first use, so the pixel-art editor
stays light.

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
npm test           # core logic: matching, dithering, grid editing and shapes, NBT, .schem / .litematic, history encoding,
                   # mesh voxelizing and 3D export, /fill commands and data packs
npm run typecheck
npm run build
```

The UI is React with [shadcn/ui](https://ui.shadcn.com) components on Tailwind CSS v4. See `CLAUDE.md` for where things go.
