# Sketchpad

A pixel-art editor for the browser, built with React, TypeScript, Zustand and
Tailwind CSS. It runs at <https://3li-ashraf.github.io/sketchpad>.

## Features

- **Tools**: pen, colorful pen (a new color on every cell), eraser and flood
  fill.
- **Canvas**: grids from 1×1 to 64×64 and optional grid lines.
- **Symmetry**: turn on left–right symmetry, top–bottom symmetry, or both, and
  each stroke is also painted on the opposite side of the canvas.
- **Rotate**: turn the whole drawing a quarter turn clockwise; Undo turns it
  back.
- **New sketch**: start over on a blank canvas of the same size. Clear
  canvas can be undone; New sketch also erases the undo history, and clears
  the copy autosaved on the device at once. Other open tabs start over too.
- **History**: undo and redo a whole stroke at a time, up to 100 steps.
  <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes; <kbd>Ctrl</kbd>+<kbd>Y</kbd> or
  <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> redoes (<kbd>Cmd</kbd> on
  macOS), on any keyboard layout.
- **Files**: save a sketch to a compact `.skpd` file and open it again, or
  export it as a PNG at 50 pixels per cell. A file that cannot be opened is
  reported with the reason.
- **Drag and drop**: drop a `.skpd` file anywhere on the page to open it.
- **Autosave**: the drawing, its whole undo history and the settings are kept
  in the browser on this device, and come back after a reload, a closed tab
  or a crash. Open tabs keep in step, so one left behind never writes an
  older drawing over newer work, and a saved drawing that is slow to load is
  never erased unasked.
- **No lost work**: resizing the grid, opening a file or starting a new
  sketch asks first whenever it would erase a drawing. "Don't ask again"
  lasts until the page is reloaded.

## Getting started

Requires Node.js 22.22, 24.15 or later (`engines` in `package.json`).

```sh
npm install
npx playwright install chromium firefox webkit  # once, for the browser tests
npm run dev
```

Then open <http://localhost:5173/sketchpad/>. The path matters: the app is
built for a GitHub Pages project site, so it is not served from the root.

The browser tests run in all three engines. On a machine where one cannot
run, name the others in `TEST_BROWSERS`, for example in an untracked
`.env.local`: `TEST_BROWSERS=chromium,webkit`.

The property tests start from a fixed seed, so every run checks the same
cases. `TEST_SEED=<number> npm test` checks others, or replays the seed a
failure printed.

| Script                  | What it does                                                     |
| ----------------------- | ---------------------------------------------------------------- |
| `npm run dev`           | Vite dev server                                                  |
| `npm run build`         | Type-check and build to `dist/`                                  |
| `npm run preview`       | Serve the built `dist/`                                          |
| `npm test`              | Unit and component tests (Node and jsdom)                        |
| `npm run test:browser`  | Browser tests in headless Chromium, Firefox and WebKit           |
| `npm run test:coverage` | `npm test` with a coverage report and thresholds                 |
| `npm run test:watch`    | `npm test` in watch mode                                         |
| `npm run lint`          | ESLint, type-aware, warnings treated as errors                   |
| `npm run typecheck`     | TypeScript only                                                  |
| `npm run format`        | Format everything with Prettier (`format:check` only verifies)   |
| `npm run check`         | Everything above that verifies, in one go; run it before pushing |
| `npm run deploy`        | Build and publish `dist/` to GitHub Pages                        |

## How it is built

The source is layered, and ESLint rejects an import that crosses a layer the
wrong way:

```
src/
  log/      the logger: warnings and errors, to the browser console
  domain/   the rules of a sketch: grid, colors, tools, history, editing
  io/       browser I/O: the .skpd format, compression, PNG export, downloads,
            the autosave record and the channel between tabs
  state/    the Zustand store, which applies domain edits
  ui/       canvas/, toolbar/, gridSize/, files/, newSketch/, autosave/ and
            common/
  app/      the shell that lays them out, and catches crashes
```

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) covers the design in depth: the
document model, rendering and input, the save format, dialogs, styling and
the testing strategy.

## Acknowledgements

[React](https://react.dev/) · [Zustand](https://zustand.docs.pmnd.rs/) ·
[Tailwind CSS](https://tailwindcss.com/) · [Vite](https://vite.dev/) ·
[Vitest](https://vitest.dev/) · [Playwright](https://playwright.dev/) ·
[React Icons](https://react-icons.github.io/react-icons/)
