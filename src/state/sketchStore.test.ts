/**
 * @file The store's own job: its defaults, its settings, the brush it hands the
 * document edits, and skipping updates that change nothing. The editing rules
 * themselves are covered in `domain/sketchDocument.test`.
 */

import { describe, expect, it, vi } from "vitest";

import {
    BLANK_CELL_COLOR,
    createBlankGrid,
    DEFAULT_GRID_SIZE,
    NO_SYMMETRY,
} from "../domain/grid";
import { DEFAULT_PEN_COLOR, DEFAULT_TOOL } from "../domain/tools";
import { expectInvalidInput } from "../test/logCapture";
import {
    actions,
    canvasColors,
    paintStroke,
    resetSketchStore,
    store,
} from "../test/storeHelpers";
import {
    selectCanRedo,
    selectCanUndo,
    selectHasWorkToLose,
    sketchOf,
    useSketchStore,
    workspaceOf,
} from "./sketchStore";

const PEN = "#123456";

describe("initial state", () => {
    it("is a blank default grid with the default tool and nothing to undo", () => {
        expect(store().document.gridSize).toBe(DEFAULT_GRID_SIZE);
        expect(canvasColors()).toEqual(createBlankGrid(DEFAULT_GRID_SIZE));
        expect(store().tool).toBe(DEFAULT_TOOL);
        expect(store().penColor).toBe(DEFAULT_PEN_COLOR);
        expect(store().symmetry).toEqual(NO_SYMMETRY);
        expect(store().showGridLines).toBe(true);
        expect(store().askBeforeResize).toBe(true);
        expect(store().askBeforeReplace).toBe(true);
        expect(store().askBeforeNewSketch).toBe(true);
        expect(selectCanUndo(store())).toBe(false);
        expect(selectCanRedo(store())).toBe(false);
    });
});

describe("settings", () => {
    it("uppercases the pen color the native input reports", () => {
        actions().setPenColor("#3ea6ff");

        expect(store().penColor).toBe("#3EA6FF");
    });

    it.each(["red", "#fff", "", "#3EA6FF80"])(
        "keeps the pen color when given %j, and reports it",
        (color) => {
            actions().setPenColor(color);

            expect(store().penColor).toBe(DEFAULT_PEN_COLOR);
            expectInvalidInput("setPenColor");
        }
    );

    it("switches the tool", () => {
        actions().setTool("eraser");

        expect(store().tool).toBe("eraser");
    });

    it("toggles each symmetry on its own", () => {
        actions().toggleSymmetry("topBottom");
        expect(store().symmetry).toEqual({ topBottom: true, leftRight: false });

        actions().toggleSymmetry("leftRight");
        actions().toggleSymmetry("topBottom");
        expect(store().symmetry).toEqual({ topBottom: false, leftRight: true });
    });

    it("toggles grid lines", () => {
        actions().toggleGridLines();

        expect(store().showGridLines).toBe(false);
    });

    it("stops asking each question independently, for the visit", () => {
        actions().stopAskingBeforeResize();
        expect(store().askBeforeResize).toBe(false);
        expect(store().askBeforeReplace).toBe(true);
        expect(store().askBeforeNewSketch).toBe(true);

        actions().stopAskingBeforeReplace();
        expect(store().askBeforeNewSketch).toBe(true);

        actions().stopAskingBeforeNewSketch();
        actions().setGridSize(8);
        actions().loadSketch({ gridSize: 4, colors: createBlankGrid(4) });
        actions().startNewSketch();

        expect(store().askBeforeResize).toBe(false);
        expect(store().askBeforeReplace).toBe(false);
        expect(store().askBeforeNewSketch).toBe(false);
    });
});

describe("edits", () => {
    it("paint with the current tool, pen color and symmetry", () => {
        actions().setGridSize(4);
        actions().setPenColor(PEN);
        actions().toggleSymmetry("leftRight");

        paintStroke(5);

        expect([5, 6].map((index) => canvasColors()[index])).toEqual([
            PEN,
            PEN,
        ]);
        expect(selectCanUndo(store())).toBe(true);
    });

    it("fill with the pen color, ignoring symmetry", () => {
        actions().setGridSize(3);
        paintStroke(1, 4, 7);
        actions().setPenColor(PEN);
        actions().toggleSymmetry("leftRight");

        actions().fillFrom(0);

        expect([0, 2].map((index) => canvasColors()[index])).toEqual([
            PEN,
            BLANK_CELL_COLOR,
        ]);
    });

    it("clear, undo and redo the canvas", () => {
        paintStroke(0);
        actions().clearCanvas();
        expect(canvasColors()[0]).toBe(BLANK_CELL_COLOR);

        actions().undo();
        expect(canvasColors()[0]).toBe(DEFAULT_PEN_COLOR);

        actions().redo();
        expect(canvasColors()[0]).toBe(BLANK_CELL_COLOR);
        expect(selectCanRedo(store())).toBe(false);
    });

    it("start a new sketch at the same size, keeping the settings", () => {
        actions().setGridSize(8);
        paintStroke(0);
        actions().setTool("eraser");
        actions().toggleSymmetry("leftRight");

        actions().startNewSketch();

        expect(canvasColors()).toEqual(createBlankGrid(8));
        expect(selectCanUndo(store())).toBe(false);
        expect(store().tool).toBe("eraser");
        expect(store().symmetry.leftRight).toBe(true);
    });

    it("rotate the drawing a quarter turn clockwise", () => {
        actions().setGridSize(2);
        paintStroke(0);

        actions().rotateCanvas();

        expect(canvasColors()).toEqual([
            BLANK_CELL_COLOR,
            DEFAULT_PEN_COLOR,
            BLANK_CELL_COLOR,
            BLANK_CELL_COLOR,
        ]);
    });

    it("load a sketch in place of the document", () => {
        paintStroke(0);
        const colors = createBlankGrid(2);
        colors[3] = PEN;

        actions().loadSketch({ gridSize: 2, colors });

        expect(sketchOf(store())).toEqual({ gridSize: 2, colors });
        expect(selectCanUndo(store())).toBe(false);
    });

    it.each([
        ["undo with nothing to undo", () => actions().undo()],
        ["paint outside a stroke", () => actions().paintCells([0])],
        [
            "resize to the current size",
            () => actions().setGridSize(DEFAULT_GRID_SIZE),
        ],
        ["clear a blank canvas", () => actions().clearCanvas()],
        ["rotate a blank canvas", () => actions().rotateCanvas()],
        ["start over with nothing to lose", () => actions().startNewSketch()],
    ])("notify no one when they change nothing: %s", (_, edit) => {
        const listener = vi.fn();
        const unsubscribe = useSketchStore.subscribe(listener);

        edit();
        unsubscribe();

        expect(listener).not.toHaveBeenCalled();
    });

    it.each([
        [
            "a size that is not a number",
            "resizeDocument",
            () => actions().setGridSize(Number.NaN),
        ],
        [
            "a pen color that is not a color",
            "setPenColor",
            () => actions().setPenColor("red"),
        ],
        [
            "a sketch that does not hold together",
            "openDocument",
            () =>
                actions().loadSketch({
                    gridSize: 4,
                    colors: createBlankGrid(2),
                }),
        ],
    ])(
        "refuse %s without notifying anyone, and report it",
        (_, where, edit) => {
            const listener = vi.fn();
            const unsubscribe = useSketchStore.subscribe(listener);

            edit();
            unsubscribe();

            expect(listener).not.toHaveBeenCalled();
            expectInvalidInput(where);
        }
    );
});

describe("restoring a workspace", () => {
    const saved = () => {
        actions().setGridSize(4);
        paintStroke(0);
        actions().setTool("eraser");
        actions().toggleGridLines();
        const workspace = workspaceOf(store());
        resetSketchStore();

        return workspace;
    };

    it("puts back the drawing, its history and the settings", () => {
        const workspace = saved();

        actions().restoreWorkspace(workspace);

        expect(workspaceOf(store())).toEqual(workspace);
        expect(selectCanUndo(store())).toBe(true);
    });

    it("abandons a stroke in progress", () => {
        const workspace = saved();
        actions().beginStroke();
        actions().paintCells([5]);

        actions().restoreWorkspace(workspace);

        expect(store().document.strokeBaseline).toBeNull();
        expect(canvasColors()[5]).toBe(BLANK_CELL_COLOR);
    });

    it("leaves the questions the workspace does not keep alone", () => {
        const workspace = saved();
        actions().stopAskingBeforeResize();

        actions().restoreWorkspace(workspace);

        expect(store().askBeforeResize).toBe(false);
        expect(store().askBeforeReplace).toBe(true);
    });
});

describe("selectors and derived values", () => {
    it("report work to lose once there is any", () => {
        expect(selectHasWorkToLose(store())).toBe(false);

        paintStroke(0);

        expect(selectHasWorkToLose(store())).toBe(true);
    });

    it("give the artwork without the editor state around it", () => {
        paintStroke(0);

        expect(sketchOf(store())).toEqual({
            gridSize: DEFAULT_GRID_SIZE,
            colors: canvasColors(),
        });
    });

    it("give the workspace as last committed, without a stroke in progress", () => {
        actions().setTool("colorfulPen");
        actions().toggleSymmetry("topBottom");
        paintStroke(0);
        const committed = workspaceOf(store());

        actions().beginStroke();
        actions().paintCells([1]);

        expect(workspaceOf(store())).toEqual(committed);
        expect(committed.document.colors).toBe(store().document.strokeBaseline);
        expect(committed.settings).toEqual({
            tool: "colorfulPen",
            penColor: DEFAULT_PEN_COLOR,
            symmetry: { topBottom: true, leftRight: false },
            showGridLines: true,
        });
    });

    it("keep the same actions object across updates", () => {
        const before = store().actions;

        paintStroke(0);
        actions().toggleGridLines();

        expect(store().actions).toBe(before);
    });
});
