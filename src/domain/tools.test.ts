import { describe, expect, it, vi } from "vitest";

import { BLANK_CELL_COLOR } from "./grid";
import {
    DRAWING_TOOLS,
    type DrawingTool,
    isDrawingTool,
    isStrokeTool,
    paintsPerCell,
    strokeColor,
} from "./tools";

const PEN_COLOR = "#123456";

/** Two colors for one tool, drawn while `Math.random` returns different values. */
const twoColors = (tool: DrawingTool): [string, string] => {
    vi.spyOn(Math, "random")
        .mockReturnValueOnce(0.25)
        .mockReturnValueOnce(0.75);

    return [strokeColor(tool, PEN_COLOR), strokeColor(tool, PEN_COLOR)];
};

describe("isDrawingTool", () => {
    it.each(DRAWING_TOOLS)("names %s", (tool) => {
        expect(isDrawingTool(tool)).toBe(true);
    });

    it.each([["spray"], ["Pen"], [""], [undefined], [0], [{}]])(
        "refuses %j",
        (value) => {
            expect(isDrawingTool(value)).toBe(false);
        }
    );
});

describe("isStrokeTool", () => {
    it("treats every tool except fill as a drag tool", () => {
        expect(isStrokeTool("pen")).toBe(true);
        expect(isStrokeTool("colorfulPen")).toBe(true);
        expect(isStrokeTool("eraser")).toBe(true);
        expect(isStrokeTool("fill")).toBe(false);
    });
});

describe("paintsPerCell", () => {
    it("is true only for the tool that varies its color per cell", () => {
        expect(paintsPerCell("colorfulPen")).toBe(true);
        expect(paintsPerCell("pen")).toBe(false);
        expect(paintsPerCell("eraser")).toBe(false);
        expect(paintsPerCell("fill")).toBe(false);
    });

    // A tool that varied its color but was missing here would have one cached
    // color smeared across a whole drag.
    it.each(DRAWING_TOOLS)(
        "agrees with strokeColor about whether %s varies",
        (tool) => {
            const [first, second] = twoColors(tool);

            expect(first !== second).toBe(paintsPerCell(tool));
        }
    );
});

describe("strokeColor", () => {
    it("paints the pen color for the pen", () => {
        expect(strokeColor("pen", PEN_COLOR)).toBe(PEN_COLOR);
    });

    it("paints blank for the eraser, ignoring the pen color", () => {
        expect(strokeColor("eraser", PEN_COLOR)).toBe(BLANK_CELL_COLOR);
    });

    it("draws a fresh random color per call for the colorful pen", () => {
        expect(twoColors("colorfulPen")).toEqual(["#400000", "#C00000"]);
    });

    it("returns a usable color for every tool", () => {
        for (const tool of DRAWING_TOOLS) {
            expect(strokeColor(tool, PEN_COLOR)).toMatch(/^#[0-9A-F]{6}$/);
        }
    });
});
