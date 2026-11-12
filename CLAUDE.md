# Make the Schem

A browser app that turns images into one-layer Minecraft pixel art and 3D models into builds, then exports `.schem`, `.litematic` or `/fill` commands. Everything runs locally. The README is the overview and quick start; `docs/GUIDE.md` is the full user guide (every tool, option and export), so update it when behaviour changes.

## Commands

```sh
npm run dev        # http://localhost:5173 (also serves the Minecraft saves API used by "Save to world")
npm test           # vitest: core logic only
npm run typecheck
npm run build      # typecheck + vite build
```

Run `npm test`, `npm run typecheck` and `npm run build` before every commit.

## Where things go

| Folder | Holds |
|---|---|
| `src/core/` | Pure logic: matching, grids, NBT, `.schem`/`.litematic`, commands. No DOM, no React. Tested with vitest. |
| `src/lib/` | Browser glue: IndexedDB, image/model loading, rendering, `cn()` in `utils.ts`. |
| `src/worker/` | Web workers for generation and model building. |
| `src/app/` | The application: `App.tsx` (pixel art), `ModelWorkspace.tsx` (3D), `Layout.tsx` (shared frame), panels and hooks. |
| `src/components/` | Small app primitives built on shadcn: `Segmented`, `IconButton`, `SliderPopover`, `Field`/`SliderField`/`SwitchField`, `Section`, `Note`, `confirm()`. |
| `src/components/ui/` | shadcn/ui components. Add new ones with `npx shadcn@latest add <name>`. |
| `src/styles.css` | Tailwind import and every design token (shadcn tokens plus `--brand`, `--warn`, `--stage`, canvas colours). |

## UI rules

- **Use the primitives.**
  - Pick one of a few options: `Segmented`.
  - A number with a wide range in a toolbar (brush size, tolerance): `SliderPopover`.
  - Icon-only buttons: `IconButton` (label + shortcut in a tooltip, never a `title`).
  - Labelled controls: `Field`, `SliderField` or `SwitchField`.
  - Confirmations: `await confirm({...})`, never `window.confirm`.
  - Transient messages: `toast()` from `sonner`.
  - Warnings that need action: `Note`.
- **No helper text.** No taglines, hint paragraphs or secondary labels. If a control needs explaining, put it in a tooltip. If a screen still doesn't make sense, fix the layout instead of adding copy.
- **Tailwind classes only.** Don't add CSS files or global classes. Theme colours come from tokens (`bg-muted`, `text-muted-foreground`, `text-brand`), never hex values.
- **Dark mode follows the system** (`prefers-color-scheme`). There is no `.dark` class and no toggle. The canvas reads its colours from CSS variables in `Editor.tsx`, so rename tokens there too.
- **Icons are `lucide-react`.**
- **Don't break shortcuts.** Keyboard shortcuts live in `App.tsx` (`keyRef`) and are ignored inside text inputs and dialogs. A new tool needs its key in `TOOL_KEYS` and its `IconButton` `shortcut`.
- **Tool options** (brush size, rectangle outline, tolerance…) are defined in `src/app/toolOptions.ts` (types, defaults, validation of saved values) and shown per tool in `ToolOptionsBar.tsx`. A new option needs both, and its logic goes in `src/core/` with a test.
- **Generated components stay generated.** Files in `src/components/ui/` are shadcn output. Local edits so far:
  - `slider.tsx` forwards `aria-label` to the thumb.
  - `checkbox.tsx` has an indeterminate state.
  - `sonner.tsx` uses `theme="system"` instead of next-themes.

  Keep these edits if you re-add those components.

## Public repo rules

This repo is public and MIT-licensed, so keep out anything we may not redistribute.

- **No Minecraft assets.** `src/data/blocks.json`, `public/atlas.png`, jars, textures and sounds stay git-ignored. Don't paste extracted data or texture images into docs, tests or fixtures.
- **No third-party images, 3D models or fonts** in the repo. Screenshots and test inputs must be original or CC0.
- **Credit what isn't ours.** A new dependency, or code copied from elsewhere (shadcn components included), gets an entry in `THIRD_PARTY_NOTICES.md`.
- **Keep the disclaimer.** Mojang's [Minecraft Usage Guidelines](https://www.minecraft.net/en-us/usage-guidelines) ask for "NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT." on the product, listing and related materials. It is in the README, `THIRD_PARTY_NOTICES.md`, `docs/GUIDE.md` and the `index.html` description; put it on any new doc or page too. Never use "Minecraft" as the project's own name, or Minecraft's logo, fonts or other brand elements.
- **Never publish a build.** `npm run build` copies `public/atlas.png` into `dist/`. Don't deploy `dist/` (Pages, releases, artifacts) while it holds game textures.
