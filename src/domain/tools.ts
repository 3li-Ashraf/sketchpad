/** @file What each drawing tool does with a drag, and what color it lays down. */

import { randomHexColor } from "./color";
import { BLANK_CELL_COLOR } from "./grid";

export const DRAWING_TOOLS = ["pen", "colorfulPen", "eraser", "fill"] as const;

export type DrawingTool = (typeof DRAWING_TOOLS)[number];

/** Whether a value read back from storage names one of the tools. */
export const isDrawingTool = (value: unknown): value is DrawingTool =>
    (DRAWING_TOOLS as readonly unknown[]).includes(value);

export const DEFAULT_TOOL: DrawingTool = "pen";
export const DEFAULT_PEN_COLOR = "#000000";

/**
 * Whether the tool paints while the pointer is held down; fill acts once, on
 * press. A new single-shot tool must be excluded here, or it silently becomes
 * a drag tool.
 */
export const isStrokeTool = (tool: DrawingTool): boolean => tool !== "fill";

/**
 * Whether the tool picks a fresh color for every cell. It must agree with
 * `strokeColor`, or `paintCells` resolves one color and smears it across the
 * whole drag; `tools.test` checks the pairing for every tool.
 */
export const paintsPerCell = (tool: DrawingTool): boolean =>
    tool === "colorfulPen";

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
