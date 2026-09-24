/**
 * @file The canvas under real layout and real pointer input. The jsdom suite
 * stubs the surface's size and dispatches synthetic events; here the
 * stylesheet lays the grid out and Playwright moves the mouse.
 */

import "../../styles/index.css";

import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { commands, server, userEvent } from "vitest/browser";

import { BLANK_CELL_COLOR } from "../../domain/grid";
import { DEFAULT_PEN_COLOR } from "../../domain/tools";
import { actions, canvasColors, store } from "../../test/storeHelpers";
import { Canvas } from "./Canvas";

const GRID_SIZE = 8;

const surface = () => screen.getByRole("img", { name: /^Canvas/ });

/** The center of a cell, relative to the surface's top-left corner. */
const cellCenter = (row: number, column: number) => {
    const { width, height } = surface().getBoundingClientRect();

    return {
        x: ((column + 0.5) * width) / GRID_SIZE,
        y: ((row + 0.5) * height) / GRID_SIZE,
    };
};

beforeEach(() => {
    actions().setGridSize(GRID_SIZE);
});

describe("Canvas in a real browser", () => {
    it("lays the grid out as square cells", () => {
        render(<Canvas />);

        const cells = [...surface().querySelectorAll(":scope > * > *")];
        const { width, height } = cells[0].getBoundingClientRect();

        expect(cells).toHaveLength(GRID_SIZE * GRID_SIZE);
        expect(width).toBeGreaterThan(10);
        expect(Math.abs(width - height)).toBeLessThan(1);
    });

    // Chromium only: the other engines offer no way to drive a finger.
    it.runIf(server.browser === "chromium")(
        "draws a whole stroke with a finger, which the browser does not take for a pan",
        async () => {
            render(<Canvas />);

            await commands.touchDrag(
                '[role="img"]',
                cellCenter(3, 0),
                cellCenter(3, GRID_SIZE - 1)
            );

            const row = canvasColors().slice(3 * GRID_SIZE, 4 * GRID_SIZE);
            expect(row).toEqual(
                new Array<string>(GRID_SIZE).fill(DEFAULT_PEN_COLOR)
            );
            expect(store().document.undoStack).toHaveLength(1);
        }
    );

    it("outlines every cell with grid lines, through the rows around them", () => {
        render(<Canvas />);
        const outlineOf = (index: number) =>
            getComputedStyle(
                surface().querySelectorAll(":scope > * > *")[index]
            ).outlineStyle;

        expect([outlineOf(0), outlineOf(GRID_SIZE ** 2 - 1)]).toEqual([
            "solid",
            "solid",
        ]);

        act(() => actions().toggleGridLines());

        expect(outlineOf(0)).toBe("none");
    });

    it("opts out of the browser's touch gestures, which would swallow a drag", () => {
        render(<Canvas />);

        expect(getComputedStyle(surface().parentElement!).touchAction).toBe(
            "none"
        );
    });

    it("paints the cell a click lands on", async () => {
        render(<Canvas />);

        await userEvent.click(surface(), { position: cellCenter(2, 5) });

        expect(canvasColors()[2 * GRID_SIZE + 5]).toBe(DEFAULT_PEN_COLOR);
    });

    it("connects a fast drag into one unbroken stroke and one undo step", async () => {
        render(<Canvas />);

        // One move from end to end: every cell between is traced, not sampled.
        await userEvent.dragAndDrop(surface(), surface(), {
            sourcePosition: cellCenter(0, 0),
            targetPosition: cellCenter(0, GRID_SIZE - 1),
        });

        expect(canvasColors().slice(0, GRID_SIZE)).toEqual(
            new Array<string>(GRID_SIZE).fill(DEFAULT_PEN_COLOR)
        );
        expect(canvasColors()[GRID_SIZE]).toBe(BLANK_CELL_COLOR);
        expect(store().document.undoStack).toHaveLength(1);
        expect(store().document.strokeBaseline).toBeNull();
    });
});
