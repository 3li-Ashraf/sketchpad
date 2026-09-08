/**
 * @file What each drawing tool means: how it responds to a drag and what color
 * it lays down. Pure: no DOM, no React, no store.
 */

import { randomHexColor } from "./color";
import { BLANK_CELL_COLOR } from "./grid";

export const DRAWING_TOOLS = ["pen", "colorfulPen", "eraser", "fill"] as const;

export type DrawingTool = (typeof DRAWING_TOOLS)[number];

export const DEFAULT_TOOL: DrawingTool = "pen";
export const DEFAULT_PEN_COLOR = "#000000";

/**
 * Whether the tool paints continuously while the pointer is held down. Fill is
 * the one that does not: it acts once, on press.
 *
 * Two layers act on this. `usePaintGestures` checks it before taking pointer
 * capture, so a non-stroke tool opens no stroke and no pointer move can paint;
 * `paintCells` checks it again and refuses. A new single-shot tool that this
 * predicate does not exclude would silently become a drag tool.
 */
export const isStrokeTool = (tool: DrawingTool): boolean => tool !== "fill";

/**
 * Whether the tool picks a fresh color for every cell it touches, which means
 * its color cannot be resolved once for a whole call. Every other tool takes the
 * cheaper uniform path in `paintCells`.
 *
 * This has to agree with `strokeColor`: a tool that returns a different color
 * for the same arguments but is missing here would have one cached color smeared
 * across a whole drag. `tools.test` pins the pairing by sampling `strokeColor`
 * for every member of `DRAWING_TOOLS`.
 */
export const paintsPerCell = (tool: DrawingTool): boolean => tool === "colorfulPen";

export const strokeColor = (tool: DrawingTool, penColor: string): string => {
    switch (tool) {
        case "eraser":
            return BLANK_CELL_COLOR;
        case "colorfulPen":
            return randomHexColor();
        case "pen":
        case "fill":
            return penColor;
    }
};
