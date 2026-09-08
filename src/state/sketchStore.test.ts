/**
 * @file Covers `state/sketchStore`: the stroke protocol, mirroring, fill, the
 * history stacks and loading. The store is a module singleton, so `src/test/setup`
 * resets it between tests and `storeHelpers` drives it the way the UI would.
 */

import { describe, expect, it } from "vitest";
import {
    BLANK_CELL_COLOR,
    createBlankGrid,
    DEFAULT_GRID_SIZE,
    MAX_GRID_SIZE,
    MIN_GRID_SIZE,
} from "../domain/grid";
import { MAX_HISTORY_ENTRIES } from "../domain/history";
import { DEFAULT_PEN_COLOR, DEFAULT_TOOL } from "../domain/tools";
import { paintStroke, store, switchToGridSize } from "../test/storeHelpers";
import { selectCanRedo, selectCanUndo, selectSketch } from "./sketchStore";

const PEN_COLOR = "#123456";

const isBlank = () => store().colors.every((color) => color === BLANK_CELL_COLOR);

describe("initial state", () => {
    it("starts on a blank default grid with the default tool and no history", () => {
        expect(store().gridSize).toBe(DEFAULT_GRID_SIZE);
        expect(store().colors).toHaveLength(DEFAULT_GRID_SIZE * DEFAULT_GRID_SIZE);
        expect(isBlank()).toBe(true);
        expect(store().penColor).toBe(DEFAULT_PEN_COLOR);
        expect(store().tool).toBe(DEFAULT_TOOL);
        expect(store().mirrorX).toBe(false);
        expect(store().mirrorY).toBe(false);
        expect(store().showGridLines).toBe(true);
        expect(selectCanUndo(store())).toBe(false);
        expect(selectCanRedo(store())).toBe(false);
    });
});

describe("settings", () => {
    it("normalizes the pen color to uppercase", () => {
        store().setPenColor("#3ea6ff");

        expect(store().penColor).toBe("#3EA6FF");
    });

    it("switches the active tool", () => {
        store().setTool("eraser");

        expect(store().tool).toBe("eraser");
    });

    it("toggles mirroring and grid lines independently", () => {
        store().toggleMirrorX();

        expect(store().mirrorX).toBe(true);
        expect(store().mirrorY).toBe(false);
        expect(store().showGridLines).toBe(true);

        store().toggleMirrorY();
        store().toggleGridLines();

        expect(store().mirrorY).toBe(true);
        expect(store().showGridLines).toBe(false);
    });
});

describe("setGridSize", () => {
    it("resizes to a blank canvas and drops the history", () => {
        paintStroke(0);
        store().setGridSize(8);

        expect(store().gridSize).toBe(8);
        expect(store().colors).toHaveLength(64);
        expect(isBlank()).toBe(true);
        expect(selectCanUndo(store())).toBe(false);
    });

    it("clamps to the supported range", () => {
        store().setGridSize(999);
        expect(store().gridSize).toBe(MAX_GRID_SIZE);

        store().setGridSize(-4);
        expect(store().gridSize).toBe(MIN_GRID_SIZE);
    });

    it("keeps the drawing when the size does not actually change", () => {
        paintStroke(0);
        const colors = store().colors;

        store().setGridSize(DEFAULT_GRID_SIZE);

        expect(store().colors).toBe(colors);
        expect(selectCanUndo(store())).toBe(true);
    });
});

describe("strokes", () => {
    it("paints the cells of a stroke with the pen color", () => {
        store().setPenColor(PEN_COLOR);
        paintStroke(0, 1, 2);

        expect(store().colors.slice(0, 3)).toEqual([PEN_COLOR, PEN_COLOR, PEN_COLOR]);
    });

    it("records one undo step per stroke, not per cell", () => {
        paintStroke(0, 1, 2);

        expect(store().undoStack).toHaveLength(1);
        expect(store().undoStack[0]).toHaveLength(3);
    });

    it("ignores paint calls outside a stroke", () => {
        store().paintCells([0]);

        expect(store().colors[0]).toBe(BLANK_CELL_COLOR);
        expect(selectCanUndo(store())).toBe(false);
    });

    it("ignores an empty stroke", () => {
        paintStroke();

        expect(isBlank()).toBe(true);
        expect(selectCanUndo(store())).toBe(false);
    });

    it("ignores cell indices outside the grid", () => {
        switchToGridSize(2);
        paintStroke(-1, 99, 0);

        expect(store().colors).toEqual([
            DEFAULT_PEN_COLOR,
            BLANK_CELL_COLOR,
            BLANK_CELL_COLOR,
            BLANK_CELL_COLOR,
        ]);
    });

    it("erases to blank", () => {
        store().setPenColor(PEN_COLOR);
        paintStroke(0);

        store().setTool("eraser");
        paintStroke(0);

        expect(store().colors[0]).toBe(BLANK_CELL_COLOR);
    });

    it("gives the colorful pen a different color per cell", () => {
        switchToGridSize(16);
        store().setTool("colorfulPen");
        paintStroke(...Array.from({ length: 64 }, (_, index) => index));

        expect(new Set(store().colors.slice(0, 64)).size).toBeGreaterThan(1);
    });

    it("does not paint with the fill tool", () => {
        store().setTool("fill");
        paintStroke(0);

        expect(store().colors[0]).toBe(BLANK_CELL_COLOR);
    });

    it("records nothing when a stroke changes no cell", () => {
        store().setPenColor(BLANK_CELL_COLOR);
        paintStroke(0, 1);

        expect(selectCanUndo(store())).toBe(false);
    });

    it("records nothing when a stroke ends on the colors it started with", () => {
        store().setPenColor(PEN_COLOR);
        paintStroke(0);

        store().beginStroke();
        store().setTool("eraser");
        store().paintCells([0]);
        store().setTool("pen");
        store().paintCells([0]);
        store().endStroke();

        expect(store().colors[0]).toBe(PEN_COLOR);
        expect(store().undoStack).toHaveLength(1);
    });

    it("keeps the same colors array when a stroke repaints what is already there", () => {
        // Array identity is the contract the memoized cells rely on, so `toBe`
        // here is load-bearing: `toEqual` would still pass if the store started
        // copying the grid on every pointer move.
        store().setPenColor(PEN_COLOR);
        paintStroke(0);

        const colors = store().colors;
        store().beginStroke();
        store().paintCells([0]);

        expect(store().colors).toBe(colors);
    });

    it("skips cells that already carry the stroke color", () => {
        switchToGridSize(4);
        store().setPenColor(PEN_COLOR);
        paintStroke(1);

        paintStroke(0, 1);

        expect(store().undoStack[1]).toHaveLength(1);
        expect(store().undoStack[1][0].index).toBe(0);
    });

    it("caps the history at the retained number of strokes", () => {
        switchToGridSize(64);

        for (let index = 0; index <= MAX_HISTORY_ENTRIES; index++) {
            paintStroke(index);
        }

        expect(store().undoStack).toHaveLength(MAX_HISTORY_ENTRIES);
    });

    it("ends a stroke that was never begun without recording anything", () => {
        store().endStroke();

        expect(selectCanUndo(store())).toBe(false);
        expect(store().strokeBaseline).toBeNull();
    });
});

describe("mirroring", () => {
    it("mirrors a stroke across the horizontal axis", () => {
        switchToGridSize(4);
        store().setPenColor(PEN_COLOR);
        store().toggleMirrorX();

        paintStroke(5);

        expect(store().colors[5]).toBe(PEN_COLOR);
        expect(store().colors[9]).toBe(PEN_COLOR);
    });

    it("mirrors a stroke across the vertical axis", () => {
        switchToGridSize(4);
        store().setPenColor(PEN_COLOR);
        store().toggleMirrorY();

        paintStroke(5);

        expect(store().colors[6]).toBe(PEN_COLOR);
    });

    it("paints all four reflections when both axes mirror", () => {
        switchToGridSize(4);
        store().setPenColor(PEN_COLOR);
        store().toggleMirrorX();
        store().toggleMirrorY();

        paintStroke(5);

        expect([5, 6, 9, 10].map((index) => store().colors[index])).toEqual([
            PEN_COLOR,
            PEN_COLOR,
            PEN_COLOR,
            PEN_COLOR,
        ]);
        expect(store().undoStack[0]).toHaveLength(4);
    });

    it("records a cell on an axis of symmetry once", () => {
        switchToGridSize(3);
        store().setPenColor(PEN_COLOR);
        store().toggleMirrorX();
        store().toggleMirrorY();

        paintStroke(4);

        expect(store().undoStack[0]).toHaveLength(1);
    });
});

describe("fill", () => {
    it("floods the contiguous region of matching cells", () => {
        switchToGridSize(3);
        store().setPenColor(PEN_COLOR);
        store().fillFrom(4);

        expect(store().colors.every((color) => color === PEN_COLOR)).toBe(true);
        expect(store().undoStack).toHaveLength(1);
    });

    it("stops at cells of a different color", () => {
        switchToGridSize(3);
        paintStroke(1, 4, 7);

        store().setPenColor(PEN_COLOR);
        store().fillFrom(0);

        expect([0, 3, 6].map((index) => store().colors[index])).toEqual([
            PEN_COLOR,
            PEN_COLOR,
            PEN_COLOR,
        ]);
        expect([2, 5, 8].map((index) => store().colors[index])).toEqual([
            BLANK_CELL_COLOR,
            BLANK_CELL_COLOR,
            BLANK_CELL_COLOR,
        ]);
    });

    it("ignores mirroring, flooding exactly the region that was clicked", () => {
        switchToGridSize(3);
        paintStroke(1, 4, 7);
        store().toggleMirrorY();

        store().setPenColor(PEN_COLOR);
        store().fillFrom(0);

        expect(store().colors[2]).toBe(BLANK_CELL_COLOR);
    });

    it("does nothing when the target already has the fill color", () => {
        switchToGridSize(3);
        store().setPenColor(BLANK_CELL_COLOR);
        store().fillFrom(0);

        expect(selectCanUndo(store())).toBe(false);
    });

    it("ignores an out-of-range index", () => {
        switchToGridSize(3);
        store().fillFrom(99);
        store().fillFrom(-1);

        expect(selectCanUndo(store())).toBe(false);
    });
});

describe("clearGrid", () => {
    it("blanks every cell in one undoable step", () => {
        store().setPenColor(PEN_COLOR);
        paintStroke(0, 1);

        store().clearGrid();

        expect(isBlank()).toBe(true);
        expect(store().undoStack).toHaveLength(2);

        store().undo();

        expect(store().colors.slice(0, 2)).toEqual([PEN_COLOR, PEN_COLOR]);
    });

    it("does nothing on an already blank canvas", () => {
        store().clearGrid();

        expect(selectCanUndo(store())).toBe(false);
    });
});

describe("actions that write history while a stroke is open", () => {
    // Reachable with two fingers: one drawing on the canvas, the other pressing
    // a toolbar button. Each of these actions records an entry of its own, and
    // doing that under a live baseline corrupts the history twice over — the
    // entry's `before` colors come from a grid no committed state ever held, and
    // `endStroke` then diffs across the same cells and records them again.
    const openStroke = () => {
        store().setPenColor(PEN_COLOR);
        store().beginStroke();
        store().paintCells([0]);
    };

    it("refuses a clear, leaving the stroke to commit on its own", () => {
        switchToGridSize(3);
        openStroke();

        store().clearGrid();

        expect(store().colors[0]).toBe(PEN_COLOR);
        expect(store().undoStack).toHaveLength(0);

        store().endStroke();

        expect(store().undoStack).toHaveLength(1);
        expect(store().undoStack[0]).toEqual([
            { index: 0, before: BLANK_CELL_COLOR, after: PEN_COLOR },
        ]);
    });

    it("refuses a fill, so no cell lands in two entries at once", () => {
        switchToGridSize(2);
        openStroke();

        store().fillFrom(1);
        store().endStroke();

        expect(store().undoStack).toHaveLength(1);
        expect(store().colors[1]).toBe(BLANK_CELL_COLOR);
    });

    it("undoes back to blank in one step after a refused clear", () => {
        // The regression this pins: before the guard, the clear's entry was the
        // only one recorded, and undoing it painted cell 0 a color the committed
        // history never held — leaving the canvas dirtier than it started.
        switchToGridSize(3);
        openStroke();
        store().clearGrid();
        store().endStroke();

        store().undo();

        expect(isBlank()).toBe(true);
        expect(selectCanUndo(store())).toBe(false);
    });

    it("accepts both again once the stroke is committed", () => {
        switchToGridSize(3);
        openStroke();
        store().endStroke();

        store().fillFrom(1);
        store().clearGrid();

        expect(isBlank()).toBe(true);
        expect(store().undoStack).toHaveLength(3);
    });
});

describe("undo and redo", () => {
    it("steps backwards and forwards through strokes", () => {
        store().setPenColor("#111111");
        paintStroke(0);
        store().setPenColor("#222222");
        paintStroke(1);

        store().undo();
        expect(store().colors.slice(0, 2)).toEqual(["#111111", BLANK_CELL_COLOR]);

        store().undo();
        expect(store().colors.slice(0, 2)).toEqual([
            BLANK_CELL_COLOR,
            BLANK_CELL_COLOR,
        ]);

        store().redo();
        store().redo();
        expect(store().colors.slice(0, 2)).toEqual(["#111111", "#222222"]);
    });

    it("restores the color a cell had before the stroke, not blank", () => {
        store().setPenColor("#111111");
        paintStroke(0);
        store().setPenColor("#222222");
        paintStroke(0);

        store().undo();

        expect(store().colors[0]).toBe("#111111");
    });

    it("drops the redo stack once a new stroke is drawn", () => {
        paintStroke(0);
        store().undo();
        expect(selectCanRedo(store())).toBe(true);

        paintStroke(1);

        expect(selectCanRedo(store())).toBe(false);
    });

    it("does nothing when there is no history", () => {
        store().undo();
        store().redo();

        expect(isBlank()).toBe(true);
    });

    it("is ignored while a stroke is in progress", () => {
        paintStroke(0);

        store().beginStroke();
        store().undo();
        store().redo();

        expect(store().colors[0]).toBe(DEFAULT_PEN_COLOR);
        expect(selectCanUndo(store())).toBe(true);
    });
});

describe("loadSketch", () => {
    it("replaces the canvas and clears the history", () => {
        paintStroke(0);
        store().undo();

        const colors = createBlankGrid(4);
        colors[0] = "#3EA6FF";
        store().loadSketch({ gridSize: 4, colors });

        expect(store().gridSize).toBe(4);
        expect(store().colors).toEqual(colors);
        expect(selectCanUndo(store())).toBe(false);
        expect(selectCanRedo(store())).toBe(false);
    });

    it("copies the incoming colors rather than aliasing them", () => {
        const colors = createBlankGrid(4);
        store().loadSketch({ gridSize: 4, colors });

        colors[0] = "#3EA6FF";

        expect(store().colors[0]).toBe(BLANK_CELL_COLOR);
    });
});

describe("selectSketch", () => {
    it("returns the drawing without the editor state around it", () => {
        store().setPenColor(PEN_COLOR);
        store().setTool("eraser");
        paintStroke(0);

        expect(selectSketch(store())).toEqual({
            gridSize: store().gridSize,
            colors: store().colors,
        });
    });
});
