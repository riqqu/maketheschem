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
   | Brush / Eraser | `B` / `E` | size 1–100, square or round; `[` `]` step the size |
   | Line / Rectangle | `L` / `U` | Shift snaps to 45° / a square. Line: width and square or round tip. Rectangle: outline or filled, outline thickness, corner radius, and drawing out from the middle block |
   | Ellipse | `C` | drag out its box; Shift makes a circle. Outline or filled, outline thickness, and drawing out from the middle block. A circle of size n is the round brush of size n |
   | Text | `T` | type the text in the options bar (the field takes the focus when you pick the tool), and it shows under the pointer; click to stamp it, with its top-left corner at the click, in the current block. A 5×7 pixel font with lowercase and accented Latin letters (á ő ű ç… ). **Scale** makes every pixel of the font that many blocks wide; `[` `]` step it |
   | Fill / Replace all | `G` / `R` | **Tolerance** also takes blocks of a similar colour, not only the clicked block; Fill can also **include diagonals** |
   | Gradient | `D` | drag from where it starts, in the current block, to where it ends, in the **end block** picked in the options bar. It fills the area of identical blocks you pressed on, like a bucket, or the selection when you press inside one. It steps through the enabled blocks that lie between the two colours, so narrow them in the **Blocks** tab for a cleaner ramp. **Dithering**: *Off* for hard steps, *Smooth* (error diffusion) or *Pattern* (ordered) to blend them. Shift snaps the direction to 45° |
   | Pick block | `I` | or right-click / Alt+click with any tool; by default it switches back to the brush |
   | Select | `S` | drag to select, drag inside to move; `Ctrl+C` `Ctrl+X` `Ctrl+V` `Delete`, `Ctrl+A`; `Enter` places a moved or pasted part, `Esc` cancels. Air in a moved or pasted part is see-through unless you turn that off. |
   | Measure | `M` | see below |

   Each tool has its own options in the bar above the canvas, like the options bar in Photoshop. Size-like options open
   a slider with a number box, preset sizes and a preview of what the brush, rectangle, ellipse or text draws. The
   options are remembered between sessions.

   **Mirror painting.** The brush, eraser, line, rectangle and ellipse have two mirror buttons at the end of their
   options: left–right and top–bottom, on one or both. Everything you draw is drawn at its reflection too (one undo
   step), and the footprint under the pointer shows the copies. A dashed line marks each mirror, with a round handle
   outside the art: drag it to move the line, in half-block steps, so it can run between two blocks or through the
   middle of one (that column maps to itself). It goes back to the middle when the size changes. Reflections that fall
   off the art are dropped.

   Flip and 180° turns work on the selection, or on the whole art when nothing is selected. A 90° turn needs a
   selection (turn whole builds with `//rotate` in game). `O` lays the source image over the blocks for comparison.
   Undo `Ctrl+Z`, redo `Ctrl+Y`, fit `F`. Zoom with the wheel; pan with Space+drag or the middle mouse button.
6. Measure: **rulers** along the top and right edges show block distances from the build's origin corner. They count x
   from the left; on walls y counts up from the bottom (height above the paste point); on floors z counts down from
   the north edge. The numbering adapts to the zoom level, and the thick grid lines fall every 10 blocks to match.
   The **measure tool** `M` works by dragging between two blocks. It shows the span (e.g. `13 × 6 blocks`, both end blocks
   counted), Δx/Δy and the straight-line distance. Shift keeps the line straight, and the measurement stays visible while
   you paint. `Esc` clears it.
7. The **Materials** tab is the survival shopping list, and it is interactive:
   - Click a block to show only where it goes. Everything else fades on the canvas; click it again or press `Esc` to
     clear.
   - The ban icon on a row **avoids** that block (see it on hover, or on the highlighted row). Its blocks become the
     nearest allowed block, matched the same way as generating, and the block is dropped from the **Blocks** selection so
     a later regenerate keeps avoiding it. Only those blocks change; the rest of your edits stay, and `Ctrl+Z` undoes
     the swap. It needs at least one other block enabled.
8. The **Build** tab plans building it by hand in survival. While it is open the canvas is read-only: chunk lines every
   16 blocks, counted from the origin corner like the rulers, replace the tens; the current part is lit and the rest
   fades.
   - **Rows** are one block row at a time, a wall from the bottom up and a floor from the north edge down.
     **Sections** cut the art into 16 × 16 squares in the same order, so the ones at the far edges can be smaller.
   - The panel lists the blocks of the current part with counts and stacks. Click one to highlight it on the canvas.
   - **Mark done** (`D`) ticks the part off and moves to the next one still to do. `[` and `]` step through the parts,
     and a click on the canvas picks the one under the cursor. Built blocks are tinted green, and a finished section
     gets a tick.
   - Progress is kept per block, so switching between rows and sections keeps it. A block you change after building
     it counts as to do again. It is saved with the art in the History. **Reset progress** starts over.
9. Click **Export** (top right). The dialog shows the steps for Minecraft after each export:
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
npm test           # core logic: matching, dithering, grid editing, shapes, mirroring, gradients and the pixel font, avoiding
                   # blocks, build steps and progress, NBT, .schem / .litematic, history encoding, mesh voxelizing and
                   # 3D export, /fill commands and data packs
npm run typecheck
npm run build
```

The UI is React with [shadcn/ui](https://ui.shadcn.com) components on Tailwind CSS v4. See `CLAUDE.md` for where things go.
