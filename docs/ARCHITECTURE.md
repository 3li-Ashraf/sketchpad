# Architecture

How Sketchpad is put together, and why. The code carries short comments where
a line needs one; this document holds the reasoning that spans files.

## Layers

```
src/
  log/       the logger, which every layer may use
  domain/    pure rules: grid, color, line, tools, history, sketchDocument, workspace
  io/        browser I/O over plain data: sketchFile, compression, pngExport, fileDownload, autosave, autosaveChannel
  state/     sketchStore, the one Zustand store
  ui/
    canvas/    Canvas, CanvasRow, CanvasCell, useCellColor, usePaintGestures
    toolbar/   Toolbar, ToolbarButton, ToolButton, ColorPicker, ColorfulPenIcon, RotateRightIcon, useNewSketch
    gridSize/  GridSizeControl, GridSizeSlider, useGridResize
    files/     useSketchFiles, fileMessages
    autosave/  restoreAutosave, autosaveSession, useAutosave
    common/    Dialog, TextButton, isDialogOpen, Tooltip, layout
  app/       App, Header, Footer, ErrorBoundary, errorReporting, and hooks
  styles/    index.css, the Tailwind entry point and design tokens
  test/      helpers, stubs and fixtures shared by the tests
```

| Layer    | May import (besides `log`) | Why                                                              |
| -------- | -------------------------- | ---------------------------------------------------------------- |
| `log`    | nothing                    | Every layer may log, so the logger can depend on none of them.   |
| `domain` | nothing                    | Pure rules that can be reasoned about, and tested, on their own. |
| `io`     | `domain`                   | File formats work on plain data, without a store.                |
| `state`  | `domain`                   | The store applies rules and never performs I/O.                  |
| `ui`     | `domain`, `io`, `state`    | Components and the hooks that drive them.                        |
| `app`    | everything but `io`        | The shell composes `ui`; browser I/O belongs behind a `ui` hook. |

`eslint.config.js` builds a `no-restricted-imports` rule for each layer from
this table, so a wrong-way import fails `npm run lint` with the reason. Tests
are exempt, since they draw fixtures from `src/test/`; nothing else may
import from there.

Inside `ui/`, a folder is a feature: a component together with the hooks and
copy that only it uses.

Imports are in one order everywhere, enforced by
`eslint-plugin-simple-import-sort` and applied by `eslint --fix`: packages,
then relative paths from the farthest to the nearest.

## The document model

A **sketch** is the artwork alone: `{ gridSize, colors }`, where `colors` is a
flat, row-major array of `gridSize²` uppercase `#RRGGBB` strings. A
**document** (`domain/sketchDocument.ts`) adds what editing needs: the undo and
redo stacks, and the baseline of the stroke in progress.

Every edit is a pure function from one document to the next: `beginStroke`,
`paintCells`, `endStroke`, `fillFrom`, `clearCanvas`, `rotateCanvas`,
`undo`, `redo`, `resizeDocument`, `openDocument` and `startNewDocument`. An edit that changes nothing returns its
input, so callers detect a no-op by identity.

- **History is diffs.** An entry lists only the cells a step changed, with their
  colors before and after, so memory follows what was drawn, not grid area. The
  stack keeps 100 steps; one step is a stroke, a fill, a clear or a rotation.
  A rotation is recorded like any other step, as the cells whose color it
  changed, so undo needs no inverse turn.
- **A drag is one step.** `beginStroke` records the current colors as a
  baseline, `paintCells` paints, and `endStroke` diffs the result against the
  baseline and commits the difference.
- **Nothing else writes history while a stroke is open.** `fillFrom`,
  `clearCanvas`, `rotateCanvas`, `undo` and `redo` are refused between
  `beginStroke` and `endStroke`. Without that rule, one finger drawing and another on the toolbar
  would record `before` colors no committed state held, and then record the
  same cells again when the stroke ended. `resizeDocument`, `openDocument`
  and `startNewDocument` start a new document instead, which abandons the
  stroke.
- **Painting copies lazily.** `paintCells` copies the colors only when a cell
  actually changes, so dragging within a cell, or over the color already
  there, returns the same document and re-renders nothing. Symmetry is visited
  through a callback (`forEachMirroredCell`), so a drag allocates no arrays per
  cell.
- **Fill ignores symmetry.** It floods exactly the region that was clicked, and
  collects it iteratively, since a recursive flood overflows the stack on a
  blank 64×64 grid.

## State

`state/sketchStore.ts` holds `document`, `settings` and the three "ask
before" flags. `settings` is the workspace's own `EditorSettings`
(`domain/workspace.ts`): tool, pen color, symmetry and grid lines, as one
object that every change replaces. So restoring puts it back whole, and
autosave sees any change to it by identity alone.

Each action applies a domain edit, or a change of settings, through one of two
helpers. When nothing changes (the edit returns the same document, or a
setting is chosen as it already is), the helper hands Zustand back the same
state object, and Zustand then notifies no subscriber at all.

Actions live on one `actions` object that is created once, so
`useSketchActions()` never causes a re-render. Derived values come in two
kinds, and the name says which:

- **Selectors** (`select…`), safe to pass to `useSketchStore`, return a
  primitive: `selectCanUndo`, `selectCanRedo` and `selectHasWorkToLose`.
- **Values built on each call** (`…Of`) are read from `getState()`: `sketchOf`,
  and `workspaceOf`, which `restoreWorkspace` puts back (see
  [Autosave](#autosave)). As a selector, a new object every time would never
  compare equal, and the component would render without end.

## Validation

Each kind of value has one rule, defined once in `domain/`, and every boundary
where that kind of value arrives checks it:

| Rule                                                               | Checked where                                                                                      |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `parseHexColor` / `isHexColor`: a string of `#` and six hex digits | `setPenColor` (from the color input), and the brush and fill colors in `paintCells` and `fillFrom` |
| `isCellIndex`: a whole number inside the grid                      | `paintCells`, `fillFrom` and `collectFillRegion`                                                   |
| A finite grid size, clamped to 1..64                               | `resizeDocument` (from the slider)                                                                 |
| `isValidSketch`: supported size, one valid color per cell          | `openDocument` (loading), `encodeSketch` (saving) and `renderSketchPng` (exporting)                |
| `decodeAutosave`: every part of an autosaved workspace             | `readAutosave`, when the page opens                                                                |
| The `.skpd` format's own checks                                    | `decodeSketch` and `readSketchFile`; see [the format](#the-skpd-format)                            |

**Who hears about it depends on who can cause it.**

- A value the user can get wrong is reported to the user. Only a picked file
  qualifies: it gets a dialog with the reason, as do a failed save and a
  failed export.
- A value only a bug can produce is reported to the developer. The color
  picker, the slider and the pointer can only produce valid values, so every
  guard in the table above fires only on a bug, apart from `decodeAutosave`: a
  stored workspace can be stale or damaged with no bug at all, so it is
  ignored with a warning instead. Each of the others calls
  `reportInvalidInput` (`domain/invalidInput.ts`), which logs an error
  saying where and why (see [Logging and errors](#logging-and-errors)). It
  goes to the console, never the page: the user never sees a message about a
  bug they cannot act on.

A refused edit changes nothing and notifies no subscriber. Saving and
exporting refuse an invalid sketch outright, so the user sees their failure
dialog rather than a corrupt file. Values whose type already rules out invalid
input, such as the `DrawingTool` union, are not checked again when they come
from code; read back from storage, they are (`isDrawingTool`).

The native color input reports lowercase, so `parseHexColor` uppercases what it
accepts, and decoded files are built by `rgbToHex`. Every color the app holds is
therefore uppercase `#RRGGBB`, and colors compare with `===`. `isHexColor`
checks the type before the pattern, because a pattern test converts its
argument to a string: a `String` object, which storage keeps as one, would
otherwise pass as the color it spells and then compare unequal to it.

## Logging and errors

`log/logger.ts` is the app's one way to log. Each module creates a logger
named for its area and logs a warning or an error as a constant message plus
data:

```ts
const log = createLogger("files");
log.error("save failed", { error });
```

The logger has only `warn` and `error`, because only problems are logged,
never normal use. Constant messages keep entries searchable and countable;
the particulars go in the data. Nothing the user made is ever logged, such as
file names or drawing contents.

Entries go to **sinks**. The only one is `consoleSink`, which writes through
`console.warn` and `console.error` (so the browser's level filter works)
behind a `[sketchpad/<source>]` prefix to filter on. Nothing leaves the
device. A new destination, such as a remote error tracker, would be one more
sink passed to `setLogSinks`, with no change to any code that logs. A sink
that throws is skipped, so a broken destination cannot break the app.

What is logged:

| Source       | Level | Message                                      | When                                                                  |
| ------------ | ----- | -------------------------------------------- | --------------------------------------------------------------------- |
| `validation` | error | invalid input refused                        | A guard refused a value, which only a bug produces                    |
| `files`      | error | save failed, export failed                   | With the cause; the user sees the failure dialog                      |
| `files`      | warn  | file could not be read                       | The browser's reason; the user sees "File unavailable"                |
| `app`        | error | render crashed; showing the error screen     | A component threw while rendering                                     |
| `app`        | error | render crashed                               | A render error outside the error screen's reach                       |
| `app`        | warn  | render recovered from an error               | React recovered on its own                                            |
| `app`        | error | uncaught error, unhandled promise rejection  | Anything else nothing handled                                         |
| `autosave`   | warn  | autosave failed                              | Once per run of failed saves, clears or reads, such as a full disk    |
| `autosave`   | warn  | autosave could not be read, autosave ignored | Opening blank: storage failed or was late, or the record was unusable |

A bad file the decoder refuses is not logged: that is the user's file, not a
fault, and the dialog already explains it.

**Crashes** (`app/`): `main.tsx` passes `reactErrorHandlers` to
`createRoot`, which routes React's error hooks to the logger and replaces
React's own console reports, so each error appears once.
`installGlobalErrorHandlers` logs the window's `error` and
`unhandledrejection` events, and prevents their defaults so the browser does
not print them a second time. `ErrorBoundary` wraps the app: if rendering
crashes, the page shows "Something went wrong" and a Try again button instead
of going blank. The drawing lives in the store, outside the tree that crashed,
so it survives the retry.

## Rendering and input

The canvas is a CSS grid of one memoized `CanvasCell` per cell, built only
when the grid size changes. Two choices keep a stroke's cost to the cells it
touched:

- **One subscription for every cell** (`useCellColor`). A store selector per
  cell ran 4096 of them on every change to the store, colors or not. One
  listener instead compares the colors when they change and wakes only the
  cells whose color did. It compares over the length both grids share: a
  resize keeps the elements of the cells whose index survives, and past that
  length a cell is either new, reading the store as it mounts, or leaving.
- **Cells grouped in rows** (`CanvasRow`). From one flat list of 4096, React
  walked every cell to reach the one that changed. A memoized row per grid
  row, `display: contents` so its cells stay items of the grid, cuts that to
  the row and the list of rows.

Grid lines are an `outline` rule on the surface, reaching the cells through
their rows, so toggling them changes one class and no cell.

Measured on the production build in desktop Chromium at 64×64 (4096 cells),
from dispatch until React has rendered, before and after those two changes:

| Operation                                    | Before                    | After                     |
| -------------------------------------------- | ------------------------- | ------------------------- |
| One pointer move of a drag, including render | 0.6 ms median, p99 1.3 ms | 0.1 ms median, p99 0.3 ms |
| Resizing from 8×8 to 64×64                   | about 54 ms               | about 22 ms               |

Drawing fits many times over in a frame, so a `<canvas>` renderer would not pay
for what it costs: DOM cells can be queried in tests, and grid lines are one
CSS rule. The surface is `role="img"`, named "Canvas, N by N", so screen
readers meet one image rather than thousands of empty cells.

Input is Pointer Events, one path for mouse, touch and pen
(`ui/canvas/usePaintGestures.ts`):

- The cell under the pointer is computed from the surface's rectangle; cells
  carry no listeners.
- Consecutive samples are joined with Bresenham (`domain/line.ts`), so a fast
  drag stays connected.
- Only the primary button, and only one pointer at a time, can draw.
- Release and cancel are heard on `window`, so a stroke still commits when the
  pointer comes up off the canvas. Leaving the canvas mid-drag starts a new
  segment on return, rather than drawing a line across the gap.
- A move that reports no button held ends the stroke instead of painting:
  the release was never delivered, as when the window loses focus mid-drag,
  and painting on would draw wherever the pointer hovered.
- A stroke also commits when the canvas unmounts mid-drag, as when a crash
  swaps in the error screen. Nothing would hear its release, and an open
  stroke refuses undo, fill, clear and rotate, and holds back the autosave.
- `touch-action: none` on the frame keeps the browser from claiming a finger
  drag as a pan or zoom.

## Protecting a drawing

Resizing, opening a file and New sketch are the three actions that discard a
drawing without an undo step. Each asks first whenever `hasWorkToLose` is
true: a painted cell, or any history at all, since a cleared canvas is still
one undo away from its drawing.

- **Resizing** (`ui/gridSize/`): over a drawing the slider is locked. The input
  ignores the pointer, so a press cannot start a drag that would carry on
  beneath the dialog, and a key that would step it is caught first. Either one
  asks. Unlocking erases nothing by itself: the drawing goes only when the
  slider then moves. The approval is held by the identity of the colors
  array, which every edit to the drawing or its history replaces, so it
  lapses on its own at the next one.
- **Opening a file** (`ui/files/`): the question comes only after the file has
  decoded, so a bad file reports its failure and asks nothing.
- **New sketch** (`ui/toolbar/useNewSketch.ts`): a blank canvas at the same
  size, with no history. Clear canvas is an undo step, so it asks nothing, but
  it leaves the drawing one undo away, in memory and in the autosave; New
  sketch is how a drawing leaves the device. It clears the autosave at once
  (see [Autosave](#autosave)).

"Don't ask again" sets a flag in the store, which is not autosaved, so it
lasts until the page is reloaded.

A file dropped anywhere on the page opens exactly as if it had been picked,
question and all. Left to the browser, the drop would navigate to the file and
replace the page. While a dialog is already asking something, a drop is
refused.

## Autosave

Everything worth keeping is saved on the device and restored when the page
opens, so a reload, a closed tab, a crash or a phone unloading the tab loses
nothing. The **workspace** (`domain/workspace.ts`) is the drawing with its
full undo and redo history, plus the tool, pen color, symmetry and grid lines.
The "Don't ask again" choices are left out on purpose: nothing in the app
can turn those questions back on, so keeping them would make them permanent.

- **Where:** IndexedDB (`io/autosave.ts`), one record under one key. A full
  history can outgrow `localStorage`'s few megabytes, and IndexedDB stores
  structured values without JSON. Each call opens and closes the database, so
  no connection is held that could block another tab from upgrading it.
- **How:** the record is not the workspace as memory holds it. Each undo step
  is stored as three typed arrays (the cells, and their colors before and
  after as `0xRRGGBB`) instead of an object per cell. With a full history of
  64×64 fills, the browser spent 120 to 330 ms copying those objects into
  storage, on the main thread, at every save; the arrays copy in 2 to 6 ms,
  and restoring fell from up to 265 ms to under 40. A step never changes once
  recorded, so each is converted once and remembered, by identity, and the
  steps restored are remembered as the arrays they were read from.
- **When** (`autosaveSession` in `ui/autosave/`, which `useAutosave` starts
  and stops): 500 ms after edits settle, so a burst writes once, and at once
  when the page is hidden or unloaded, because a phone can end a background
  tab without warning. A save that falls due during a stroke waits for the
  stroke to end rather than stall the drag. Whether an edit changed what is
  kept is checked on every change to the store, pointer moves included, so the
  check builds nothing: the settings compare by identity, and the document by
  `isSameCommittedDocument`, part by part.
- **What:** the drawing as last committed (`committedDocument`). A stroke
  still being drawn is not an undo step yet, so saving its cells would keep
  paint that undo could never take away; leaving the page mid-stroke keeps
  everything but that stroke.
- **Restoring:** `main.tsx` awaits `restoreAutosave` before the first render,
  so the page opens on the saved drawing instead of flashing a blank one. A
  stored record could have been written by another version, damaged, or put
  there by other code, so `decodeAutosave` checks every part and rebuilds it
  from what passed. Nothing saved, a record it cannot use, or storage that
  gives no answer within 2 s: the page opens blank, with a warning in the log.
- **Never over an unseen save:** a page writes only once it has seen what the
  device holds. When storage failed or was late at opening, `restoreAutosave`
  says so (`Restored`), and `App` hands that to `useAutosave`, which holds its
  writes and reads the device first: the late answer if it comes, or a fresh
  read before the first write. A saved drawing found then goes on the canvas
  if the canvas has not changed since, by drawing, opening a file or anything
  else. If it has, keeping either erases the other, so the user is asked, in
  words that name no one cause: Restore saved drawing, or Keep this drawing,
  which writes it at once. Without this, the first edit on a page
  that opened blank would silently replace the saved drawing. `Restored` lives
  outside React, so the rule holds when a crash remounts the app.
- **Other tabs:** every tab shares the one record, so a tab left open with an
  older drawing would otherwise write it over newer work the moment it was
  used. After each save or clear a tab announces it on a `BroadcastChannel`
  (`io/autosaveChannel.ts`). A tab that hears of a save, with nothing of its
  own waiting to be written and no stroke open, reads the record and takes it
  up, which is no change of its own to write back; one that hears of a clear
  starts a new sketch itself, keeping its size and settings. A page restored
  from the back-forward cache, which may have missed announcements, reads the
  record as if it had heard of a save. Two tabs edited within the same half
  second is the one case left: the later save wins, and the other tab then
  takes it up.
- **New sketch clears the device:** it empties the store at once
  (`clearAutosave`), rather than leave the drawing there until the next save
  would replace it, so a crash or a power cut a moment later cannot bring it
  back. `useNewSketch` starts the new sketch in the store first and then
  calls `clearSavedWorkspace`, and the session drops the write that change
  scheduled, so nothing is written until something else changes; a reload
  before then opens a default blank page. A page that has not seen the
  device leaves it alone, since the drawing there is not one it showed.

## Dialogs

Every warning and failure is a native `<dialog>` opened with `showModal`
(`ui/common/Dialog.tsx`), which provides the top layer, an inert page behind
it and Escape as a `cancel` event.

- A dialog is open exactly while it is mounted, so it cannot disagree with
  React state.
- It portals itself to `<body>`: the settings panel is `display: none` while
  collapsed, and a modal inside it would leave an inert page with nothing
  visible to dismiss.
- The dialog, not a control, takes focus, so Enter presses nothing until a
  button is chosen. Tab reaches the controls, and neither button is styled as
  the default.
- Escape is reported exactly once. When the browser allows it, `cancel` is
  prevented and reported. When it does not (Escape with no user activation to
  spend), the browser closes the dialog and `close` reports it.
- Every failure offers a next step beside Close: a failed save or export offers
  to try again, and a failed open offers another file.

## The `.skpd` format

```
byte  size  field
0     4     magic "SKPD"
4     1     grid size, 1..64
5     1     payload mode
6     ..    zlib-deflated payload
```

- **Palette mode** (0): palette length (1..255), that many RGB triples, then one
  palette index per cell, bit-packed most significant bit first, at
  `max(1, ceil(log2(length)))` bits each.
- **RGB mode** (1): one RGB triple per cell.

Both are lossless layouts of the same data. Palette mode is eligible only with
at most 255 colors. When it is, both payloads are deflated and the smaller one
is written. Color count does not predict the winner once deflate has run:
palette mode wins by 35–55% on a few colors scattered irregularly, while
blobby art with more than about sixteen colors favors RGB. A 64×64 sketch
takes roughly 600 bytes to 1 kB for ordinary art, a few dozen for a blank
canvas, and about 12 kB at worst.

The one-bit floor on index width is a security check, not rounding. At zero
bits the packed section would be empty for any cell count, so the exact-length
check would stop depending on the grid size, and a four-byte payload could
claim to be a 64×64 sketch.

**Opening treats the file as hostile** (`io/sketchFile.ts`):

1. `readSketchFile` reads at most 64 KiB + 1 byte of the picked file. The
   largest valid file is about 12 kB, so a large file picked by mistake is
   never loaded whole.
2. The magic is checked, then the grid size and mode are checked, before
   either is used to size anything.
3. Inflation stops as soon as output passes the largest payload the declared
   grid and mode can hold. Before this cap, a 255 KB file that inflates to
   256 MB made the page allocate 512 MB before being refused.
4. Each payload must match its cell count exactly, and palette indices are
   bounds-checked, since a whole number of bits can encode indices past the
   palette.
5. Corruption is caught by zlib's adler32. Wrapped `deflate` costs six bytes
   over `deflate-raw` and saves the format a checksum of its own.

Failures are returned, never thrown, as one of four reasons, each with its own
wording: `not-a-sketch`, `unsupported` (a grid size or mode from another
version), `damaged`, and `unreadable` (the browser could not read the file,
typically one moved or deleted since it was picked).

## PNG export

`io/pngExport.ts` draws the sketch at one pixel per cell, scales that up once
with `imageSmoothingEnabled = false`, and encodes it with `toBlob`. The scale
is exact nearest-neighbour only for a whole-number cell size (50 by default).
The small and the full-size canvas (3200×3200 for 64×64) are checked
separately, since a browser can grant one and refuse the other. The export
downloads through the same `downloadBlob` as saving.

## Styling

Tailwind v4 is configured in CSS. `@theme` in `src/styles/index.css` holds the
palette, fonts and animations, and `source("..")` limits class scanning to
`src/`. Without that limit Tailwind also reads files such as this one, and
turns words that happen to be utility names into CSS no element uses.

- `.control` is the shared look of every control: the toolbar's buttons, the
  swatch, the settings toggle, and, through `TextButton`, the buttons of the
  dialogs and the error screen. Its pressed and expanded states are read from
  `aria-pressed` and `aria-expanded`, so the look cannot disagree with what
  assistive technology is told. Keyboard focus shows the browser's own ring;
  the swatch, whose input is transparent, wears it on its outline instead.
- The settings icon spins only for users who have not asked for reduced
  motion (`motion-safe:`), since it never stops.
- Tooltips are CSS drawn from a `data-tooltip` attribute, shown on hover only
  where the device can hover, and on keyboard focus only. In the toolbar's two
  columns each label opens toward the other column, since one centered on its
  button runs off a 768 px screen.
- The toolbar's two columns hold its controls two to a row: Pen and Eraser,
  Fill and Color, Colorful pen and Grid lines, Clear canvas and New sketch,
  the two symmetries, Rotate and Export PNG, Undo and Redo, then Save and
  Open. `Toolbar.test` pins the order, so changing it is a decision rather
  than an accident.
- From `md` up the canvas and the settings panel are one size
  (`ui/common/layout.ts`): the breakpoint's 570, 680 or 780 px, or less when
  the window is too short, so that on a laptop screen the whole canvas is in
  view. `main` is a size container, and the size is `clamp(540px, 100cqh -
16px, breakpoint)`; the panel's row gap closes as it shrinks. Below 540 px
  the panel could not hold its controls, so the page scrolls instead. A
  window at most 800 px tall (`short:`) also gets a smaller header and footer.
  On a screen tall enough for the breakpoint's size nothing changes.
- Below `md` the settings panel is a popover over the canvas, opened by the
  header's button and closed by a press anywhere outside it. That press only
  closes it: `useToolbarPopover` takes it in the document's capture phase,
  before React's listeners, and stops it there, so tapping the canvas to put
  the panel away does not also paint a cell.
- The app is dark throughout: `color-scheme: dark` styles native widgets, and
  `theme-color` in `index.html` and the web manifest keeps browser chrome and
  splash screens from flashing white.
- Fonts are self-hosted through `@fontsource`, in the latin subset and only the
  weights in use, so the page makes no third-party requests.

## Testing

Vitest runs three projects (`vite.config.ts`):

| Project   | Environment                                      | Covers                                                                                                                       |
| --------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `unit`    | Node                                             | `domain/`, `state/` and the save format. Also proves they need no DOM.                                                       |
| `dom`     | jsdom                                            | Components and hooks, with stubs for what jsdom lacks (`src/test/jsdomStubs`) and an in-memory IndexedDB (`fake-indexeddb`). |
| `browser` | Chromium, Firefox and WebKit, through Playwright | What jsdom cannot show (`*.browser.test.*`).                                                                                 |

The browser project exists because jsdom cannot prove these properties:

- The exported PNG decodes to the right size, with every pixel exactly its
  cell's color. A single blurred edge fails the test.
- The browser's own zlib opens files written by Node, and stops a payload
  that inflates past its grid.
- The dialog is modal, holds focus, leaves the page behind inert, and reports a
  real Escape once.
- A real mouse drag across the laid-out canvas paints one connected stroke,
  and so does a finger drag, in Chromium only, since the other engines offer
  no way to drive a finger. Without `touch-action: none`, the finger drag
  fails.
- Save sketch and Export PNG write real files that decode to the drawing. That
  also shows that revoking the object URL right after the click is safe.
- A real drop opens the file and keeps the page, and the whole workspace
  survives a round trip through real IndexedDB. A save announced on the
  browser's own `BroadcastChannel` is heard, and taken up, by another
  channel on the page, as another tab's would be.
- The settings icon stays still for a user who asks for reduced motion, and
  the color swatch shows a focus ring when the keyboard reaches it
  (`setMotionPreference` emulates the preference through Playwright).
- The whole app fits a 320 px screen without scrolling sideways, with a
  square canvas, and the settings panel holds every control at each
  breakpoint. On the viewports of common laptop screens the whole canvas is
  in view, and below the smallest size the page scrolls rather than squeeze
  the panel.

The commands that catch a download and drive a finger run in Node beside
Playwright (`browserCommands.ts`). `TEST_BROWSERS`, from the environment or
an untracked `.env.local`, narrows the engines on a machine where one cannot
run. On the Windows machine this was built on, Playwright's Firefox 155 fails
to start (Windows cannot activate its dependency on its own `mozglue`
library), so that machine runs Chromium and WebKit.

`src/test/goldenFiles.ts` holds save files byte for byte, in both payload
modes. They stand for files people already have, and must keep opening
exactly.

Every test runs with the logger's output captured rather than printed, and
fails if it logged anything it did not ask for (`src/test/logCapture.ts`): an
entry from the logger, or a warning or error written to the console directly,
as React does on a real problem. A test that expects an entry asserts it with
`expectLogged(level, source, message, data)`, or `expectInvalidInput(where)`
for a refused value, which also checks that the report says what was wrong
and can check the value refused. Across the whole suite, only tests that
provoke a failure on purpose log anything.

### Properties and models

Where a rule has too many cases to pick from by hand, it is checked by
property, with [fast-check](https://fast-check.dev/): hundreds of generated
cases, and a failing one shrunk to its smallest form. Each property compares
the code against a second, simpler statement of the same rule:

- **The document** (`sketchDocument.model.test`). Random sequences of every
  edit, with strokes left open, bad input and all, run against a reference
  model that keeps whole snapshots for undo, paints every reflection by brute
  force and floods breadth-first. After every edit the two must agree on the
  colors, the history, the open stroke and what was reported, and an edit that
  changes nothing must hand back its document. Each document is frozen before
  an edit sees it, so one that changed its input would throw. A second
  property records more steps than the history keeps, then undoes and redoes
  past the cap.
- **Save files** (`sketchFile.test`). Any sketch comes back exactly, at every
  width of palette index and in RGB. Any payload decodes as a reference
  decoder, written from the format's description, says it must. A real file,
  damaged anyhow, settles on a valid sketch or a known reason.
- **The autosave record** (`autosave.test`). Any workspace reads back exactly,
  and a stored record with any part replaced by anything reads back as
  nothing or as a whole, checked workspace.
- **The canvas** (`Canvas.test`). After any sequence of store changes, every
  cell of every canvas mounted shows the store's color. Any press and drag,
  on, across and off every edge, paints exactly the cells the line tracer
  joins within each stretch on the canvas.

Smaller rules are checked exhaustively instead: the line tracer between every
pair of cells of a 12×12 grid, and the reflections of every cell and rotation
at every size up to 8×8. Flood fill is checked by property, against a
breadth-first search.

Every property starts from one fixed seed (`src/test/property.ts`), so a run
is the same on every machine. `TEST_SEED` in the environment picks another, to
explore further or to replay the seed a failure printed.

### The journey

`app/journey.browser.test` goes through one visit in the real app, as a person
would. It shrinks the grid, draws, fills, erases with symmetry, undoes from the
keyboard and redoes from the toolbar, and rotates. It then saves and exports,
resizes past the question, opens the saved file, leaves and comes back to the
autosave, and starts a new sketch, which leaves nothing on the device. Each
step is checked where a person would see it: in the cells on screen, in the
files the browser wrote, or in IndexedDB.

### How strong the tests are

Coverage thresholds in `vite.config.ts` are 100% of lines, statements,
functions and branches, so `npm run check` fails when new code arrives
untested. Coverage says only that a line ran; mutation testing says whether a
test would notice it changing. [StrykerJS](https://stryker-mutator.io/) was run
over `src`, and every mutant that survived was either killed by a new test or
shown to change nothing a test could see. It found, among others:

- A test that passed without testing its claim: a tab asked to start over
  "keeping its settings" had drawn with the eraser on a blank canvas, so there
  was nothing to start over from.
- Gaps the example tests never reached: a tab that stopped saving its own
  edits after taking up another tab's save, a remount answering from a device
  read made before the crash, reads doubling up while one was under way, a
  press past the right or bottom edge of the canvas, and a surface placed
  anywhere but the window's corner.
- Code no test could make matter, now gone: two checks of the resize
  approval that the third always covered; a timer cancelled, and a flag
  cleared, where nothing could read them after; a check for a surface the
  pointer event itself guarantees; and one for a surface with no size, which
  the bounds check already refuses.

What survives changes what the code costs, not what it does: a preallocated
array, a cache, an early return. Or it breaks a tie between two equally near
cells in the line tracer, or is a class only a browser lays out, which the
mutation run does not load: it runs the `unit` and `dom` projects only. Tests
that guard a limit or a hazard, such as the inflate cap, the bounded read, the
pixel-exact PNG and the touch gesture rule, were also checked by hand, by
breaking the code they protect and watching them fail.

Stryker is not a dependency. Its Vitest runner (10.0) runs no tests under
Vitest 5, which names a test in full as `suite > test` where the runner looks
for `suite test`, so every mutant appears to survive. To run it again, patch
`nameParts.join(' ')` to `nameParts.join(' > ')` in the runner's
`stryker-setup.js` and `test-helpers.js`, and give it a Vitest config with the
browser project left out.

## Build and deployment

The app is served from `/sketchpad/` on GitHub Pages. The path appears twice
and has to agree: `base` in `vite.config.ts` and `homepage` in `package.json`.
The web manifest's `start_url` and `scope` are relative (`../../`), so they
follow the base path rather than restating it.

React and the icon set change only on a dependency upgrade, so they build into
their own content-hashed `vendor` chunk (about 63 kB gzipped). An app-only
deploy invalidates just the app chunk, about 12.5 kB gzipped.
