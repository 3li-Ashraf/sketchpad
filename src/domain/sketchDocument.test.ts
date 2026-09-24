import { describe, expect, it, vi } from "vitest";

import { expectInvalidInput } from "../test/logCapture";
import {
    BLANK_CELL_COLOR,
    createBlankGrid,
    DEFAULT_GRID_SIZE,
    MAX_GRID_SIZE,
    MIN_GRID_SIZE,
    NO_SYMMETRY,
    type Symmetry,
} from "./grid";
import { MAX_HISTORY_ENTRIES } from "./history";
import {
    beginStroke,
    type Brush,
    clearCanvas,
    committedDocument,
    createDocument,
    endStroke,
    fillFrom,
    hasWorkToLose,
    isStrokeOpen,
    openDocument,
    paintCells,
    redo,
    resizeDocument,
    resumeDocument,
    rotateCanvas,
    type SketchDocument,
    startNewDocument,
    undo,
} from "./sketchDocument";
import type { DrawingTool } from "./tools";

const PEN = "#123456";
const OTHER = "#ABCDEF";

const brush = (
    tool: DrawingTool = "pen",
    color = PEN,
    symmetry: Symmetry = NO_SYMMETRY
): Brush => ({ tool, color, symmetry });

/** Begin, paint, end: one committed stroke. */
const stroke = (
    doc: SketchDocument,
    indices: number[],
    using: Brush = brush()
): SketchDocument => endStroke(paintCells(beginStroke(doc), indices, using));

const colorsAt = (doc: SketchDocument, ...indices: number[]) =>
    indices.map((index) => doc.colors[index]);

const isBlank = (doc: SketchDocument) =>
    doc.colors.every((color) => color === BLANK_CELL_COLOR);

describe("creating a document", () => {
    it("starts blank, with no history and no stroke open", () => {
        const doc = createDocument(4);

        expect(doc.gridSize).toBe(4);
        expect(doc.colors).toEqual(createBlankGrid(4));
        expect(doc.undoStack).toEqual([]);
        expect(doc.redoStack).toEqual([]);
        expect(doc.strokeBaseline).toBeNull();
    });

    it("opens a sketch on its own copy of the colors, with no history", () => {
        const colors = createBlankGrid(2);
        colors[0] = PEN;

        const doc = openDocument({ gridSize: 2, colors })!;
        colors[1] = OTHER;

        expect(doc.colors).toEqual([
            PEN,
            BLANK_CELL_COLOR,
            BLANK_CELL_COLOR,
            BLANK_CELL_COLOR,
        ]);
        expect(doc.undoStack).toEqual([]);
    });
});

describe("refusing input an edit cannot use", () => {
    const open = () => beginStroke(createDocument(4));

    it.each([
        ["too few colors", { gridSize: 4, colors: createBlankGrid(2) }],
        ["an unsupported size", { gridSize: 0, colors: [] }],
        ["a color that is not one", { gridSize: 1, colors: ["red"] }],
    ])(
        "opens no document for a sketch with %s, and reports it",
        (_, sketch) => {
            expect(openDocument(sketch)).toBeNull();
            expectInvalidInput("openDocument");
        }
    );

    it.each([Number.NaN, Infinity, -Infinity])(
        "keeps the document for a size of %d, and reports it",
        (size) => {
            const doc = createDocument(4);

            expect(resizeDocument(doc, size)).toBe(doc);
            expectInvalidInput("resizeDocument");
        }
    );

    it("returns the document untouched when every index is refused", () => {
        const doc = open();

        expect(paintCells(doc, [-1, 16, 99], brush())).toBe(doc);
        expectInvalidInput("paintCells");
    });

    it("paints the whole cells of a call and reports the rest, once", () => {
        const doc = endStroke(
            paintCells(open(), [1.5, Number.NaN, 2, -1], brush())
        );
        expectInvalidInput("paintCells");

        expect(Object.keys(doc.colors)).toHaveLength(16);
        expect(doc.undoStack).toEqual([
            [{ index: 2, before: BLANK_CELL_COLOR, after: PEN }],
        ]);
    });

    it.each(["red", "#fff", "#3ea6ff", ""])(
        "paints nothing in a brush color of %j, and reports it",
        (color) => {
            const doc = open();

            expect(paintCells(doc, [0], brush("pen", color))).toBe(doc);
            expectInvalidInput("paintCells");
        }
    );

    it("still erases when the brush color is not one, since erasing ignores it", () => {
        const painted = beginStroke(stroke(createDocument(4), [0]));

        const doc = paintCells(painted, [0], brush("eraser", "red"));

        expect(doc.colors[0]).toBe(BLANK_CELL_COLOR);
    });

    it.each([
        ["an index that is not whole", 1.5, PEN],
        ["an index past the grid", 99, PEN],
        ["an index before the grid", -1, PEN],
        ["a color that is not one", 0, "red"],
    ])("fills nothing for %s, and reports it", (_, index, color) => {
        const doc = createDocument(3);

        expect(fillFrom(doc, index, color)).toBe(doc);
        expectInvalidInput("fillFrom");
    });
});

describe("resizeDocument", () => {
    it("starts a blank document at the new size, dropping history", () => {
        const doc = resizeDocument(stroke(createDocument(4), [0]), 8);

        expect(doc).toEqual(createDocument(8));
    });

    it("keeps the document when the size does not change", () => {
        const doc = stroke(createDocument(4), [0]);

        expect(resizeDocument(doc, 4)).toBe(doc);
        expect(resizeDocument(doc, 4.2)).toBe(doc);
    });

    it("clamps to the supported range", () => {
        const doc = createDocument(DEFAULT_GRID_SIZE);

        expect(resizeDocument(doc, 999).gridSize).toBe(MAX_GRID_SIZE);
        expect(resizeDocument(doc, -4).gridSize).toBe(MIN_GRID_SIZE);
    });
});

describe("startNewDocument", () => {
    it("starts blank at the same size with no history, so undo has nothing", () => {
        const doc = startNewDocument(stroke(createDocument(4), [0]));

        expect(doc).toEqual(createDocument(4));
        expect(undo(doc)).toBe(doc);
    });

    it("erases a cleared drawing that undo could still bring back", () => {
        const cleared = clearCanvas(stroke(createDocument(4), [0]));

        expect(startNewDocument(cleared).undoStack).toEqual([]);
    });

    it("abandons a stroke in progress", () => {
        const drawing = paintCells(
            beginStroke(createDocument(4)),
            [0],
            brush()
        );

        expect(startNewDocument(drawing)).toEqual(createDocument(4));
    });

    it("keeps a document with nothing to lose", () => {
        const doc = createDocument(4);

        expect(startNewDocument(doc)).toBe(doc);
    });
});

describe("strokes", () => {
    it("paints the stroke's cells in the brush color", () => {
        const doc = stroke(createDocument(4), [0, 1, 2]);

        expect(colorsAt(doc, 0, 1, 2, 3)).toEqual([
            PEN,
            PEN,
            PEN,
            BLANK_CELL_COLOR,
        ]);
    });

    it("commits a whole stroke as one undo step of the cells it changed", () => {
        const doc = stroke(createDocument(4), [0, 1, 2]);

        expect(doc.undoStack).toEqual([
            [
                { index: 0, before: BLANK_CELL_COLOR, after: PEN },
                { index: 1, before: BLANK_CELL_COLOR, after: PEN },
                { index: 2, before: BLANK_CELL_COLOR, after: PEN },
            ],
        ]);
        expect(doc.strokeBaseline).toBeNull();
    });

    it("keeps painting into the open stroke if one is begun again", () => {
        const open = paintCells(beginStroke(createDocument(4)), [0], brush());
        const doc = endStroke(paintCells(beginStroke(open), [1], brush()));

        expect(doc.undoStack).toHaveLength(1);
        expect(doc.undoStack[0]).toHaveLength(2);
    });

    it("records only the cells whose color actually changed", () => {
        const doc = stroke(stroke(createDocument(4), [1]), [0, 1]);

        expect(doc.undoStack[1]).toEqual([
            { index: 0, before: BLANK_CELL_COLOR, after: PEN },
        ]);
    });

    it("records nothing for a stroke that changes no cell", () => {
        const doc = stroke(createDocument(4), [0, 1], brush("eraser"));

        expect(doc.undoStack).toEqual([]);
    });

    it("records nothing for a stroke that ends on the colors it began with", () => {
        const painted = stroke(createDocument(4), [0]);

        let doc = beginStroke(painted);
        doc = paintCells(doc, [0], brush("eraser"));
        doc = paintCells(doc, [0], brush("pen"));
        doc = endStroke(doc);

        expect(doc.colors[0]).toBe(PEN);
        expect(doc.undoStack).toBe(painted.undoStack);
    });

    it("erases to blank", () => {
        const doc = stroke(
            stroke(createDocument(4), [0]),
            [0],
            brush("eraser")
        );

        expect(doc.colors[0]).toBe(BLANK_CELL_COLOR);
    });

    it("gives the colorful pen a fresh color for every cell", () => {
        const random = vi.spyOn(Math, "random");
        random.mockReturnValueOnce(0).mockReturnValueOnce(0.5);

        const doc = stroke(createDocument(4), [0, 1], brush("colorfulPen"));

        expect(colorsAt(doc, 0, 1)).toEqual(["#000000", "#800000"]);
    });

    it("keeps the cap on history, dropping the oldest steps", () => {
        let doc = createDocument(MAX_GRID_SIZE);
        for (let index = 0; index <= MAX_HISTORY_ENTRIES; index++) {
            doc = stroke(doc, [index]);
        }

        expect(doc.undoStack).toHaveLength(MAX_HISTORY_ENTRIES);
        expect(doc.undoStack[0][0].index).toBe(1);
    });

    describe("returning the document unchanged", () => {
        const open = beginStroke(stroke(createDocument(4), [0]));

        it.each([
            ["painting outside a stroke", stroke(createDocument(4), [0]), [1]],
            ["painting no cells", open, []],
            ["repainting a color already there", open, [0]],
        ])("when %s", (_, doc, indices) => {
            expect(paintCells(doc, indices, brush())).toBe(doc);
        });

        it("when painting with a tool that does not stroke", () => {
            expect(paintCells(open, [1], brush("fill"))).toBe(open);
        });

        it("when ending a stroke that was never begun", () => {
            const doc = createDocument(4);

            expect(endStroke(doc)).toBe(doc);
        });

        it("when beginning a stroke that is already open", () => {
            expect(beginStroke(open)).toBe(open);
        });
    });
});

describe("symmetry", () => {
    const paintWith = (symmetry: Symmetry, index: number, gridSize = 4) =>
        stroke(createDocument(gridSize), [index], brush("pen", PEN, symmetry));

    it("mirrors between top and bottom", () => {
        const doc = paintWith({ topBottom: true, leftRight: false }, 5);

        expect(colorsAt(doc, 5, 9, 6)).toEqual([PEN, PEN, BLANK_CELL_COLOR]);
    });

    it("mirrors between left and right", () => {
        const doc = paintWith({ topBottom: false, leftRight: true }, 5);

        expect(colorsAt(doc, 5, 6, 9)).toEqual([PEN, PEN, BLANK_CELL_COLOR]);
    });

    it("paints all four reflections with both, as one step", () => {
        const doc = paintWith({ topBottom: true, leftRight: true }, 5);

        expect(colorsAt(doc, 5, 6, 9, 10)).toEqual([PEN, PEN, PEN, PEN]);
        expect(doc.undoStack[0]).toHaveLength(4);
    });

    it("records a cell on both axes once", () => {
        const doc = paintWith({ topBottom: true, leftRight: true }, 4, 3);

        expect(doc.undoStack[0]).toHaveLength(1);
    });
});

describe("fillFrom", () => {
    it("floods the 4-connected region of the clicked color as one step", () => {
        const doc = fillFrom(createDocument(3), 4, PEN);

        expect(doc.colors.every((color) => color === PEN)).toBe(true);
        expect(doc.undoStack).toHaveLength(1);
        expect(doc.undoStack[0]).toHaveLength(9);
    });

    it("stops at cells of another color", () => {
        const walled = stroke(
            createDocument(3),
            [1, 4, 7],
            brush("pen", OTHER)
        );

        const doc = fillFrom(walled, 0, PEN);

        expect(colorsAt(doc, 0, 3, 6)).toEqual([PEN, PEN, PEN]);
        expect(colorsAt(doc, 2, 5, 8)).toEqual([
            BLANK_CELL_COLOR,
            BLANK_CELL_COLOR,
            BLANK_CELL_COLOR,
        ]);
    });

    it("clears anything left to redo", () => {
        const undone = undo(stroke(createDocument(3), [0]));

        expect(fillFrom(undone, 4, PEN).redoStack).toEqual([]);
    });

    it("does nothing when the clicked cell already has the color", () => {
        const doc = createDocument(3);

        expect(fillFrom(doc, 0, BLANK_CELL_COLOR)).toBe(doc);
    });
});

describe("clearCanvas", () => {
    it("blanks every cell in one step that undo reverses", () => {
        const painted = stroke(createDocument(4), [0, 1]);

        const cleared = clearCanvas(painted);

        expect(isBlank(cleared)).toBe(true);
        expect(cleared.undoStack).toHaveLength(2);
        expect(undo(cleared).colors).toEqual(painted.colors);
    });

    it("does nothing to a blank canvas", () => {
        const doc = createDocument(4);

        expect(clearCanvas(doc)).toBe(doc);
    });
});

describe("rotateCanvas", () => {
    it("turns the drawing a quarter turn clockwise, as one step undo reverses", () => {
        const painted = stroke(createDocument(3), [0, 1]);

        const turned = rotateCanvas(painted);

        expect(colorsAt(turned, 2, 5)).toEqual([PEN, PEN]);
        expect(colorsAt(turned, 0, 1)).toEqual([
            BLANK_CELL_COLOR,
            BLANK_CELL_COLOR,
        ]);
        expect(turned.undoStack).toHaveLength(2);
        expect(undo(turned).colors).toEqual(painted.colors);
    });

    it("records only the cells whose color moved", () => {
        const turned = rotateCanvas(stroke(createDocument(3), [0, 4]));

        expect(turned.undoStack.at(-1)).toEqual([
            { index: 0, before: PEN, after: BLANK_CELL_COLOR },
            { index: 2, before: BLANK_CELL_COLOR, after: PEN },
        ]);
    });

    it("leaves a drawing that looks the same turned as it is", () => {
        const doc = stroke(createDocument(3), [4]);

        expect(rotateCanvas(doc)).toBe(doc);
    });

    it("clears anything left to redo", () => {
        const undone = undo(stroke(stroke(createDocument(3), [0]), [1]));

        expect(rotateCanvas(undone).redoStack).toEqual([]);
    });
});

describe("undo and redo", () => {
    const twoStrokes = () =>
        stroke(stroke(createDocument(4), [0]), [1], brush("pen", OTHER));

    it("step backwards and forwards through the history", () => {
        const doc = twoStrokes();

        expect(colorsAt(undo(doc), 0, 1)).toEqual([PEN, BLANK_CELL_COLOR]);
        expect(isBlank(undo(undo(doc)))).toBe(true);
        expect(redo(redo(undo(undo(doc))))).toEqual(doc);
    });

    it("restores the color a cell had before, not blank", () => {
        const doc = stroke(
            stroke(createDocument(4), [0]),
            [0],
            brush("pen", OTHER)
        );

        expect(undo(doc).colors[0]).toBe(PEN);
    });

    it("forget the redo history once something new is drawn", () => {
        const undone = undo(twoStrokes());

        expect(undone.redoStack).toHaveLength(1);
        expect(stroke(undone, [2]).redoStack).toEqual([]);
    });

    it("do nothing with nothing to step over", () => {
        const doc = createDocument(4);

        expect(undo(doc)).toBe(doc);
        expect(redo(doc)).toBe(doc);
    });

    it("rewind any sequence of edits to the start, and replay it to the end", () => {
        let doc = createDocument(5);
        let steps = 0;
        const edits = [
            (d: SketchDocument) => stroke(d, [0, 1, 2, 7]),
            (d: SketchDocument) => fillFrom(d, 24, OTHER),
            (d: SketchDocument) => stroke(d, [12, 13], brush("eraser")),
            (d: SketchDocument) =>
                stroke(
                    d,
                    [6],
                    brush("pen", PEN, { topBottom: true, leftRight: true })
                ),
            (d: SketchDocument) => clearCanvas(d),
            (d: SketchDocument) =>
                stroke(d, [3, 8, 13, 18], brush("pen", OTHER)),
        ];
        for (const edit of edits) {
            const next = edit(doc);
            if (next.undoStack.length !== doc.undoStack.length) steps++;
            doc = next;
        }
        const end = doc;

        for (let step = 0; step < steps; step++) doc = undo(doc);
        expect(isBlank(doc)).toBe(true);
        expect(doc.undoStack).toEqual([]);

        for (let step = 0; step < steps; step++) doc = redo(doc);
        expect(doc).toEqual(end);
    });
});

describe("while a stroke is open", () => {
    // The gesture a second finger on the toolbar makes: one finger drawing,
    // the other pressing fill, clear, undo or redo.
    const openStroke = () =>
        paintCells(beginStroke(createDocument(3)), [0], brush());

    it.each([
        ["fill", (doc: SketchDocument) => fillFrom(doc, 1, OTHER)],
        ["clear", clearCanvas],
        ["rotate", rotateCanvas],
        ["undo", undo],
        ["redo", redo],
    ])("refuses to %s", (_, edit) => {
        const doc = openStroke();

        expect(edit(doc)).toBe(doc);
    });

    it("commits the stroke on its own once it ends", () => {
        const doc = endStroke(clearCanvas(openStroke()));

        expect(doc.undoStack).toEqual([
            [{ index: 0, before: BLANK_CELL_COLOR, after: PEN }],
        ]);
    });

    it("undoes back to blank in one step after a refused clear", () => {
        // Before the refusal, the clear's entry was the only one recorded and
        // undoing it painted a color the committed history never held.
        const doc = undo(endStroke(clearCanvas(openStroke())));

        expect(isBlank(doc)).toBe(true);
        expect(doc.undoStack).toEqual([]);
    });

    it("is abandoned by a resize", () => {
        const doc = resizeDocument(openStroke(), 8);

        expect(doc.strokeBaseline).toBeNull();
    });
});

describe("the committed document", () => {
    it("is the document itself between strokes", () => {
        const doc = stroke(createDocument(4), [0]);

        expect(committedDocument(doc)).toEqual({
            gridSize: 4,
            colors: doc.colors,
            undoStack: doc.undoStack,
            redoStack: doc.redoStack,
        });
    });

    it("leaves out a stroke still being drawn", () => {
        const painted = stroke(createDocument(4), [0]);
        const drawing = paintCells(beginStroke(painted), [1], brush());

        expect(committedDocument(drawing)).toEqual(committedDocument(painted));
    });

    it("resumes with no stroke open, and edits on from there", () => {
        const committed = committedDocument(stroke(createDocument(4), [0]));

        const doc = resumeDocument(committed);

        expect(isStrokeOpen(doc)).toBe(false);
        expect(undo(doc).colors).toEqual(createBlankGrid(4));
    });
});

describe("hasWorkToLose", () => {
    it("is false for a blank document with no history", () => {
        expect(hasWorkToLose(createDocument(4))).toBe(false);
    });

    it("is true once a cell is painted", () => {
        expect(hasWorkToLose(stroke(createDocument(4), [0]))).toBe(true);
    });

    it("is true for an opened sketch with paint but no history", () => {
        const colors = createBlankGrid(2);
        colors[3] = PEN;

        expect(hasWorkToLose(openDocument({ gridSize: 2, colors })!)).toBe(
            true
        );
    });

    it("is true for a cleared canvas, since the clear can be undone", () => {
        const doc = clearCanvas(stroke(createDocument(4), [0]));

        expect(isBlank(doc)).toBe(true);
        expect(hasWorkToLose(doc)).toBe(true);
    });

    it("is true for a canvas undone back to blank, since it can be redone", () => {
        const doc = undo(stroke(createDocument(4), [0]));

        expect(isBlank(doc)).toBe(true);
        expect(hasWorkToLose(doc)).toBe(true);
    });
});
