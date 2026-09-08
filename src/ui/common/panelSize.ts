/**
 * @file The sizes the canvas and the toolbar have to agree on. Everything else
 * about the layout is utility classes on the components themselves.
 *
 * These are Tailwind class strings rather than numbers because that is what the
 * components need; Tailwind v4 scans this file like any other source file, so
 * the arbitrary values below are generated from here.
 */

/**
 * The canvas and the toolbar stand side by side from the `md` breakpoint up and
 * have to be the same height at each one, so that run of sizes is declared once
 * rather than repeated. Below `md` they differ, because the toolbar is a popover
 * rather than a column.
 */
export const EDITOR_PANEL_HEIGHT = "md:h-[570px] lg:h-[680px] xl:h-[780px]";

/**
 * The canvas frame is square at every breakpoint, which is what keeps its cells
 * square. From `md` up the widths repeat the numbers in `EDITOR_PANEL_HEIGHT`
 * above, so the two are kept adjacent: a height changed there has to be changed
 * here as well, and only a side-by-side reading makes that obvious.
 */
export const CANVAS_FRAME_WIDTH =
    "w-[360px] sm:w-[580px] md:w-[570px] lg:w-[680px] xl:w-[780px]";

/** The heights `EDITOR_PANEL_HEIGHT` does not cover, below the `md` breakpoint. */
export const CANVAS_FRAME_HEIGHT = "h-[360px] sm:h-[580px]";

/** Inset between the frame and the drawing surface, so the border is not flush. */
export const CANVAS_FRAME_PADDING = "p-[10px] sm:p-[15px] lg:p-[20px] xl:p-[30px]";

/**
 * The toolbar's own height below `md`, where it is a popover and no longer has
 * to match the canvas.
 */
export const TOOLBAR_PANEL_HEIGHT = "h-[580px]";
