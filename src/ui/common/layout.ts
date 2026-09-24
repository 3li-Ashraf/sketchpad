/**
 * @file The sizes the canvas and the settings panel must agree on, as Tailwind
 * class strings; Tailwind scans this file, so the arbitrary values are
 * generated from here. They are spelled out whole, since a class built at run
 * time from parts would never be generated.
 */

/**
 * On `main`: from `md` up the canvas and the panel beside it are one size,
 * `--editor-size`. That is the breakpoint's size (`--editor-max`), unless the
 * window is too short for it: then it is the height `main` has between the
 * header and the footer, less a margin, so the whole canvas stays in view on a
 * laptop screen. Below 540 px the panel could not hold its controls, so the
 * page scrolls instead, `main` never shorter than that plus the margin.
 *
 * `main` is a size container, so `100cqh` is its height. The expression is
 * resolved where `--editor-size` is used, inside it, not on `main` itself.
 */
export const EDITOR_AREA =
    "md:min-h-[556px] md:[container-type:size] md:[--editor-max:570px] lg:[--editor-max:680px] xl:[--editor-max:780px] md:[--editor-size:clamp(540px,calc(100cqh-16px),var(--editor-max))]";

/** The panel's height, and the canvas's, from `md` up: the shared size. */
export const EDITOR_PANEL_HEIGHT = "md:h-[var(--editor-size)]";

/**
 * Square at every breakpoint, which keeps the cells square: from `md` up the
 * width is the shared size too. The smallest shrinks with a phone narrower
 * than 360 px plus margins, in both directions at once.
 */
export const CANVAS_FRAME_WIDTH =
    "w-[min(360px,calc(100vw-32px))] sm:w-[580px] md:w-[var(--editor-size)]";

/** The heights `EDITOR_PANEL_HEIGHT` does not cover, below the `md` breakpoint. */
export const CANVAS_FRAME_HEIGHT =
    "h-[min(360px,calc(100vw-32px))] sm:h-[580px]";

/** Inset between the frame and the drawing surface, so the border is not flush. */
export const CANVAS_FRAME_PADDING =
    "p-[10px] sm:p-[15px] lg:p-[20px] xl:p-[30px]";

/** The panel's height below `md`, where it is a popover. */
export const TOOLBAR_PANEL_HEIGHT = "h-[580px]";

/**
 * The gap between the panel's rows of controls. At the breakpoint's full size
 * it is the breakpoint's own; in a panel made shorter to fit the window, it
 * closes by a tenth of a pixel for every pixel lost, and never below 8 px,
 * which is what lets the smallest panel hold all eight rows.
 */
export const TOOLBAR_ROW_GAP =
    "gap-y-3 md:[--row-gap:12px] lg:[--row-gap:20px] xl:[--row-gap:32px] md:gap-y-[clamp(8px,calc(var(--row-gap)-(var(--editor-max)-var(--editor-size))*0.1),var(--row-gap))]";
