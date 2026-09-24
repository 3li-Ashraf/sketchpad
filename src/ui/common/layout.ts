/**
 * @file The sizes the canvas and the settings panel must agree on, as Tailwind
 * class strings; Tailwind scans this file, so the arbitrary values are
 * generated from here.
 */

/**
 * Side by side from `md` up, the canvas and the panel share these heights.
 * Below `md` the panel is a popover and sizes itself.
 */
export const EDITOR_PANEL_HEIGHT = "md:h-[570px] lg:h-[680px] xl:h-[780px]";

/**
 * Square at every breakpoint, which keeps the cells square: from `md` up these
 * widths repeat `EDITOR_PANEL_HEIGHT`, so change the two together. The
 * smallest size shrinks with a phone narrower than 360 px plus margins, in
 * both directions at once.
 */
export const CANVAS_FRAME_WIDTH =
    "w-[min(360px,calc(100vw-32px))] sm:w-[580px] md:w-[570px] lg:w-[680px] xl:w-[780px]";

/** The heights `EDITOR_PANEL_HEIGHT` does not cover, below the `md` breakpoint. */
export const CANVAS_FRAME_HEIGHT =
    "h-[min(360px,calc(100vw-32px))] sm:h-[580px]";

/** Inset between the frame and the drawing surface, so the border is not flush. */
export const CANVAS_FRAME_PADDING =
    "p-[10px] sm:p-[15px] lg:p-[20px] xl:p-[30px]";

/** The panel's height below `md`, where it is a popover. */
export const TOOLBAR_PANEL_HEIGHT = "h-[580px]";
