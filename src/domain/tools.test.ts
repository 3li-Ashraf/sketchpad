/**
 * @file Covers `domain/tools`. The colorful pen is random, so the tests that
 * separate it from the fixed-color tools sample `strokeColor` repeatedly and
 * count distinct results rather than asserting a value.
 */

import { describe, expect, it } from "vitest";
import { BLANK_CELL_COLOR } from "./grid";
import {
    DRAWING_TOOLS,
    isStrokeTool,
    paintsPerCell,
    strokeColor,
} from "./tools";

const PEN_COLOR = "#123456";

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

    it("agrees with strokeColor about which tools are stable per stroke", () => {
        for (const tool of DRAWING_TOOLS) {
            const colors = new Set(
                Array.from({ length: 50 }, () => strokeColor(tool, PEN_COLOR))
            );

            expect(colors.size > 1).toBe(paintsPerCell(tool));
        }
    });
});

describe("strokeColor", () => {
    it("paints the pen color for the pen", () => {
        expect(strokeColor("pen", PEN_COLOR)).toBe(PEN_COLOR);
    });

    it("paints blank for the eraser, ignoring the pen color", () => {
        expect(strokeColor("eraser", PEN_COLOR)).toBe(BLANK_CELL_COLOR);
    });

    it("varies per call for the colorful pen", () => {
        const colors = new Set(
            Array.from({ length: 50 }, () => strokeColor("colorfulPen", PEN_COLOR))
        );

        expect(colors.size).toBeGreaterThan(1);
    });

    it("returns a usable color for every tool", () => {
        for (const tool of DRAWING_TOOLS) {
            expect(strokeColor(tool, PEN_COLOR)).toMatch(/^#[0-9A-F]{6}$/);
        }
    });
});
