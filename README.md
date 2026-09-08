# Sketchpad

A pixel-art drawing app built with React, TypeScript, Zustand and Tailwind CSS.

## Features

**Tools** — pen, eraser, flood fill, and a colorful pen that lays down a different color on every cell.

**Canvas** — grid sizes from 1×1 to 64×64, optional grid lines, and mirroring across either axis (or both) for symmetrical designs.

**History** — undo and redo a whole stroke at a time, up to 100 steps back, with <kbd>Ctrl</kbd>+<kbd>Z</kbd> to undo and <kbd>Ctrl</kbd>+<kbd>Y</kbd> or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> to redo (<kbd>Cmd</kbd> on macOS).

**Files** — save a sketch to a compact binary `.skpd` file and load it back, or export the artwork as a PNG at 50 pixels per cell.

## Getting started

```sh
git clone https://github.com/3li-ashraf/sketchpad.git
cd sketchpad
npm install
npm run dev
```

Then open http://localhost:5173/sketchpad/. The path matters: `base` in `vite.config.ts` is set for a GitHub Pages project site, so the app is not served from the root.

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check (`tsc -b`) and build to `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run the tests in watch mode |
| `npm run test:coverage` | Run the tests with a coverage report |
| `npm run lint` | ESLint, warnings treated as errors |
| `npm run deploy` | Build and publish `dist/` to GitHub Pages |

The base path appears twice and has to agree with itself: `base` in
`vite.config.ts` and `homepage` in `package.json`. It does *not* appear in the
web manifest — `start_url` and `scope` there are relative (`../../`), which
resolves against the manifest's own URL under `assets/favicon/` and so follows
the base path rather than restating it. Without them an installed app would
launch into the favicon folder, since `start_url` defaults to the manifest's
directory rather than the site root.

## Architecture

Five layers, each importing only from the ones above it:

```
src/
  domain/   pure rules of a sketch — no DOM, no React, no store
  io/       browser I/O — the save format, PNG export, downloads
  state/    the Zustand store, the one place the layers meet
  ui/       the editor surfaces, each with the hook that drives it
  app/      the shell that arranges them
```

In practice `io/` and `state/` both reach only into `domain/` and not into each
other, `ui/` draws on all three, and `app/` composes `ui/` without touching
browser I/O itself. **These rules are enforced.** `eslint.config.js` derives a
`no-restricted-imports` rule per layer from one table, so a cross-layer import
fails `npm run lint` with the reason it is not allowed rather than being caught
in review — or not at all. Tests are exempt, since they import fixtures and
stubs from `src/test/` across every layer.

**`domain/`** is the part that can be reasoned about on its own: grid geometry,
mirroring and flood fill (`grid.ts`), color conversion (`color.ts`), Bresenham
line tracing (`line.ts`), tool semantics (`tools.ts`) and the undo/redo model
(`history.ts`). None of it imports anything outside the folder.

**`io/`** is everything that touches a browser API: the save-file format
(`sketchFile.ts`), deflate over `CompressionStream` (`compression.ts`), PNG
export (`pngExport.ts`) and downloads (`fileDownload.ts`).

**`ui/` is grouped by surface rather than by kind,** so each hook sits with the
one component that uses it instead of in a shared `hooks/` bucket:

```
ui/
  canvas/   Canvas, CanvasCell, usePaintGestures
  toolbar/  Toolbar, ToolbarButton, ColorPicker, GridSizeSlider, useSketchFiles
  common/   Tooltip, and the panel sizes the canvas and toolbar must agree on
```

**Constants live with the code that gives them meaning** — grid bounds in
`domain/grid.ts`, the history cap in `domain/history.ts`, the file extension in
`io/sketchFile.ts`, and the two panel heights that have to match in
`ui/common/panelSize.ts`.

**The canvas is a flat, row-major `string[]` of cell colors.** Undo and redo are
diffs: a history entry lists only the cells a step changed, along with their
colors before and after. A drag is committed as one entry when the pointer is
released, so one undo steps back over a whole stroke. A flood fill and a clear
each record one entry too, so the 100-step cap counts undoable steps rather than
strokes specifically.

**Nothing else may write history while a stroke is open.** `fillFrom`,
`clearGrid`, `undo` and `redo` are all refused between `beginStroke` and
`endStroke`; `setGridSize` and `loadSketch` are the exceptions, and they abandon
the stroke outright by clearing the baseline with the stacks. Two fingers reach
this — one drawing, one on the toolbar — and without the rule the history breaks
two ways at once: the interloping entry reads `before` colors off a grid no
committed state ever held, and `endStroke` then diffs across the same cells and
records them a second time.

**Rendering is per cell.** Each `CanvasCell` is memoized and subscribes to its
own color, so a stroke re-renders only the cells it touched rather than the whole
grid. Grid lines are drawn by a rule on the container
(`.canvas-surface--lined > *`), which keeps toggling them off the cells entirely.
The store copies the color array lazily — only once a cell actually changes — so
dragging inside one cell, or repainting a color that is already there, allocates
nothing and leaves the array identity alone.

**The paint path allocates nothing per cell.** `forEachMirroredCell` hands each
reflection to a visitor instead of returning an array, and `paintCells` builds
that visitor once per call rather than once per cell, so tracing a fast drag
across dozens of cells costs one closure rather than dozens of short-lived
arrays.

**Input is pointer-based.** The canvas element handles `pointerdown`/`pointermove`
once for mouse, touch and pen; the cell under the pointer is computed from the
surface rectangle, so cells carry no event listeners of their own. Cells between
two pointer samples are filled in with Bresenham so fast strokes stay connected.
Release and cancel are watched on the window, so a stroke is still committed when
the pointer comes up off-canvas.

**Colors are uppercase `#RRGGBB` everywhere,** so they compare by value. The
native color input is the one source that reports another case, and `setPenColor`
normalizes it; colors decoded from a file are already uppercase, because
`rgbToHex` builds them that way.

**Failures are reported in the page.** Saving, loading and exporting run through
`useSketchFiles`, which puts any failure into a `role="alert"` message in the
toolbar. That covers a file that cannot be decoded and, separately, one that
cannot be read at all — `arrayBuffer` rejects for a file moved or deleted since
it was picked, which the browser only discovers after the picker has closed.

**The bundle is split app-from-vendor.** React and the icon set are most of its
weight and change only on a dependency upgrade, so `advancedChunks` in
`vite.config.ts` puts them in their own content-hashed chunk: a deploy that
touches only app code invalidates about 6 kB gzipped rather than the whole 69 kB.

## Styling

Tailwind is configured from CSS. `@theme` in `src/styles/index.css` is the single source of the palette, fonts and animations, and Tailwind v4 discovers source files itself, so there is no `tailwind.config.js` and no `content` list to keep in step.

The two fonts those tokens name are self-hosted from `@fontsource`, imported in `src/main.tsx` and bundled by Vite, so the app makes no third-party requests. Only the faces in use are imported — Roboto 400 and 500, Press Start 2P 400 — and only the latin subset of each, since every string the app renders is fixed English.

Icons come from `react-icons`. The grid size control is a native `<input type="range">` restyled through its track and thumb pseudo-elements, and the tooltip is a pair of CSS `::after`/`::before` rules reading a `data-tooltip` attribute, so it costs no JavaScript and no extra DOM. The shared look of the toolbar buttons, the color swatch and the settings toggle is one `.toolbar-control` rule rather than utility classes repeated on each.

The app is dark throughout, and two declarations in `@layer base` make the rest of the page agree with it. `color-scheme: dark` on `html` is what renders the platform's own widgets to match — the color picker the swatch opens, scrollbars, the range input's focus ring — and a `background-color` there covers anything the app's own root element does not, such as an iOS rubber-band overscroll, which would otherwise show white behind a near-black app. The same color is declared as `theme-color` in `index.html` and in the web manifest, so the browser chrome and an installed app's splash screen match rather than flashing white.

## Save file format

A `.skpd` file is a small binary container:

```
byte  size  field
0     4     magic "SKPD"
4     1     grid size, 1..64
5     1     payload mode
6     ..    zlib-deflated payload
```

The payload comes in two modes:

- **Palette** — palette length, that many RGB triples, then one bit-packed palette index per cell, most significant bit first, at `max(1, ceil(log2(length)))` bits.
- **RGB** — one RGB triple per cell.

The one-bit floor is not only about a one-color file's size. At zero bits the packed section would be empty whatever the cell count, so the decoder's length check would stop depending on the declared grid size and a four-byte payload would satisfy it for any grid.

Both are layouts of the same data. The palette is built from the sketch itself, so neither mode changes a single color; a saved file always reloads pixel-identical.

Choosing between them takes two steps. Palette mode is **eligible** only when the sketch has at most 255 distinct colors, since the palette length is one byte — beyond that, RGB is the only option, which is what the colorful pen tends to produce. When palette mode is eligible, both payloads are deflated and the **smaller one wins**.

Color count alone does not decide it, because deflate has already removed the redundancy by the time the two are compared. On flat areas a run of identical cells collapses to nearly nothing in either layout and the winner comes down to a handful of bytes. Palette mode pulls clearly ahead — 35–55% in measurements — on variety without repetition: a few colors scattered irregularly, where RGB mode has no repeated sequence for the compressor to point at. Blobby artwork with more than about sixteen colors goes the other way and RGB wins, which is why the choice is measured rather than guessed.

Cells are row-major in both modes. A 64×64 sketch lands at roughly 600 bytes to 1 kB for ordinary artwork, a couple of dozen bytes for a blank canvas, and about 8 kB in the worst case where every cell differs — against roughly 40 kB for the same grid stored as JSON hex strings.

Loading treats the file as hostile. The magic bytes are checked; the grid size is range-checked **before** it is used to size anything; each decoder requires the payload length to match the cell count exactly; and palette indices are checked against the palette length, since a bit width can encode indices past its end. Corruption is caught by the zlib checksum, which the format gets for six bytes by using zlib-wrapped deflate rather than `deflate-raw`. Anything that fails returns null and the app reports it rather than throwing.

## PNG export

The sketch is drawn once at one image pixel per cell, then blitted up to full size with `imageSmoothingEnabled = false`, which keeps cells square-edged instead of blurring them into each other. That is an exact nearest-neighbour scale only at a whole-number factor, and nothing enforces one; it rests on callers passing an integer cell size. The two canvases are checked separately, because a browser can refuse a surface as large as the full-size one — 3200×3200 for a 64×64 sketch — while granting the small one.

## Tests

`npm test` runs the suite — 229 tests across 14 files; `npm run test:coverage`
adds a report, and currently reports 100% of lines and 99.8% of statements.
Tests sit beside the code they cover and mirror the layers above, with shared
helpers in `src/test/`: store helpers, deterministic sketch fixtures, and stubs
for the browser APIs jsdom does not implement (canvas 2D, object URLs, pointer
capture).

Two things the suite deliberately cannot prove, because jsdom does not implement
them, are worth knowing about before changing the code they cover. The PNG export
is asserted through a recording stub — that the right pixels are written, at the
right size, with smoothing off — but no image is ever decoded, so nothing in CI
would catch a genuinely broken PNG. And `deflate` runs on Node's Compression
Streams rather than a browser's, so a round trip proves the format is
self-consistent rather than portable. Both were checked by hand in a real browser
against this revision: a 32×32 sketch round-tripped byte-identical through the
file input, a corrupted file was rejected by the real zlib checksum, and the
exported PNG decoded to 1600×1600 with hard cell edges — pure white at x=49
against pure black at x=50, which is what nearest-neighbour scaling has to
produce and what smoothing would blur.

## Acknowledgements

[React](https://reactjs.org/) · [Zustand](https://zustand.docs.pmnd.rs/) · [Tailwind CSS](https://tailwindcss.com/) · [Vite](https://vitejs.dev/) · [Vitest](https://vitest.dev/) · [React Icons](https://react-icons.github.io/react-icons/)
