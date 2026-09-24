/**
 * @file The document checked against a reference model: a second, naive
 * implementation of the same rules. It keeps whole snapshots for undo where
 * the document keeps diffs, paints every reflection by brute force, and finds
 * a fill's region breadth-first. fast-check runs random sequences of edits
 * through both and compares them after every step, so a sequence that makes
 * them disagree, however unlikely a user would be to find it, is found and
 * shrunk to its shortest form.
 *
 * Every document an edit is given is frozen first, so an edit that changed
 * its input rather than return a new document would throw.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { takeLogs } from "../test/logCapture";
import { fc } from "../test/property";
import { BLANK_CELL_COLOR, type Sketch, type Symmetry } from "./grid";
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
import { DRAWING_TOOLS } from "./tools";

type Command =
    | { kind: "beginStroke" }
    | { kind: "paintCells"; indices: number[]; brush: Brush }
    | { kind: "endStroke" }
    /** Begin, paint and end at once, so that sequences commit often. */
    | { kind: "stroke"; indices: number[]; brush: Brush }
    | { kind: "fillFrom"; index: number; color: string }
    | { kind: "clearCanvas" }
    | { kind: "rotateCanvas" }
    | { kind: "undo" }
    | { kind: "redo" }
    | { kind: "resizeDocument"; size: number }
    | { kind: "startNewDocument" }
    /** Set aside and picked up again, as the autosave does. */
    | { kind: "reopen" }
    | { kind: "openDocument"; sketch: Sketch };

// ---------------------------------------------------------------------------
// The model

interface Model {
    gridSize: number;
    colors: string[];
    /** The colors before each undoable step, the next undo's last. */
    past: string[][];
    /** The colors before each undone step was undone, the next redo's last. */
    future: string[][];
    baseline: string[] | null;
}

/** What the model expects of one edit. */
interface Outcome {
    /** The edit changes nothing, so the document must come back as it was. */
    isNoOp: boolean;
    /** Where each value refused along the way is reported from. */
    refusedBy: string[];
}

const changed: Outcome = { isNoOp: false, refusedBy: [] };
const noOp = (...refusedBy: string[]): Outcome => ({ isNoOp: true, refusedBy });

const isColor = (value: string) => /^#[0-9A-F]{6}$/.test(value);

const isCell = (model: Model, index: number) =>
    Number.isInteger(index) &&
    index >= 0 &&
    index < model.gridSize * model.gridSize;

const blank = (gridSize: number) =>
    new Array<string>(gridSize * gridSize).fill(BLANK_CELL_COLOR);

const sameColors = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((color, index) => color === b[index]);

const hasPaint = (model: Model) =>
    model.colors.some((color) => color !== BLANK_CELL_COLOR);

const hasWork = (model: Model) =>
    model.past.length > 0 || model.future.length > 0 || hasPaint(model);

const reset = (model: Model, gridSize: number, colors = blank(gridSize)) => {
    Object.assign(model, {
        gridSize,
        colors,
        past: [],
        future: [],
        baseline: null,
    });
};

/** Records a step: the colors before it go on the past, the future goes. */
const record = (model: Model, before: string[]) => {
    model.past = [...model.past, before].slice(-MAX_HISTORY_ENTRIES);
    model.future = [];
};

const commit = (model: Model, colors: string[]): Outcome => {
    record(model, model.colors);
    model.colors = colors;

    return changed;
};

/** The cell and every reflection of it, duplicates and all. */
const reflections = (model: Model, index: number, symmetry: Symmetry) => {
    const size = model.gridSize;
    const row = Math.floor(index / size);
    const column = index % size;
    const rows = symmetry.topBottom ? [row, size - 1 - row] : [row];
    const columns = symmetry.leftRight ? [column, size - 1 - column] : [column];

    return rows.flatMap((r) => columns.map((c) => r * size + c));
};

const flood = (model: Model, start: number) => {
    const size = model.gridSize;
    const target = model.colors[start];
    const region = new Set([start]);

    for (const index of region) {
        const row = Math.floor(index / size);
        const column = index % size;
        const neighbors: [number, number][] = [
            [row - 1, column],
            [row + 1, column],
            [row, column - 1],
            [row, column + 1],
        ];

        for (const [r, c] of neighbors) {
            const neighbor = r * size + c;
            if (r < 0 || r >= size || c < 0 || c >= size) continue;
            if (model.colors[neighbor] === target) region.add(neighbor);
        }
    }

    return region;
};

const paint = (
    model: Model,
    indices: number[],
    { tool, color, symmetry }: Brush,
    nextRandomColor: () => string
): Outcome => {
    if (model.baseline === null || tool === "fill" || indices.length === 0) {
        return noOp();
    }
    // The eraser's color is its own, and the colorful pen picks its own.
    if (tool === "pen" && !isColor(color)) return noOp("paintCells");

    const next = [...model.colors];
    let isAnyRefused = false;

    for (const index of indices) {
        if (!isCell(model, index)) {
            isAnyRefused = true;
            continue;
        }

        const cellColor =
            tool === "eraser"
                ? BLANK_CELL_COLOR
                : tool === "colorfulPen"
                  ? nextRandomColor()
                  : color;
        for (const cell of reflections(model, index, symmetry)) {
            next[cell] = cellColor;
        }
    }

    const isNoOp = sameColors(next, model.colors);
    model.colors = next;

    return { isNoOp, refusedBy: isAnyRefused ? ["paintCells"] : [] };
};

const endModelStroke = (model: Model): Outcome => {
    const { baseline } = model;
    if (baseline === null) return noOp();

    model.baseline = null;
    if (!sameColors(baseline, model.colors)) record(model, baseline);

    return changed;
};

const step = (
    model: Model,
    command: Command,
    nextRandomColor: () => string
): Outcome => {
    const isOpen = model.baseline !== null;

    switch (command.kind) {
        case "beginStroke":
            if (isOpen) return noOp();
            model.baseline = model.colors;
            return changed;

        case "paintCells":
            return paint(
                model,
                command.indices,
                command.brush,
                nextRandomColor
            );

        case "endStroke":
            return endModelStroke(model);

        case "stroke": {
            if (!isOpen) model.baseline = model.colors;
            const { refusedBy } = paint(
                model,
                command.indices,
                command.brush,
                nextRandomColor
            );
            endModelStroke(model);
            return { isNoOp: false, refusedBy };
        }

        case "fillFrom": {
            const { index, color } = command;
            if (isOpen) return noOp();
            if (!isCell(model, index) || !isColor(color)) {
                return noOp("fillFrom");
            }
            if (model.colors[index] === color) return noOp();

            const region = flood(model, index);
            return commit(
                model,
                model.colors.map((old, cell) =>
                    region.has(cell) ? color : old
                )
            );
        }

        case "clearCanvas":
            if (isOpen || !hasPaint(model)) return noOp();
            return commit(model, blank(model.gridSize));

        case "rotateCanvas": {
            if (isOpen) return noOp();
            const size = model.gridSize;
            // The cell that lands at (row, column) came from (last - column, row).
            const rotated = model.colors.map((_, index) => {
                const row = Math.floor(index / size);
                const column = index % size;
                return model.colors[(size - 1 - column) * size + row];
            });
            if (sameColors(rotated, model.colors)) return noOp();
            return commit(model, rotated);
        }

        case "undo": {
            const previous = model.past.at(-1);
            if (isOpen || !previous) return noOp();
            model.future = [...model.future, model.colors];
            model.past = model.past.slice(0, -1);
            model.colors = previous;
            return changed;
        }

        case "redo": {
            const next = model.future.at(-1);
            if (isOpen || !next) return noOp();
            model.past = [...model.past, model.colors];
            model.future = model.future.slice(0, -1);
            model.colors = next;
            return changed;
        }

        case "resizeDocument": {
            if (!Number.isFinite(command.size)) return noOp("resizeDocument");
            const size = Math.min(64, Math.max(1, Math.round(command.size)));
            if (size === model.gridSize) return noOp();
            reset(model, size);
            return changed;
        }

        case "startNewDocument":
            if (!hasWork(model)) return noOp();
            reset(model, model.gridSize);
            return changed;

        case "reopen":
            model.colors = model.baseline ?? model.colors;
            model.baseline = null;
            return changed;

        case "openDocument": {
            const { gridSize, colors } = command.sketch;
            const isValid =
                Number.isInteger(gridSize) &&
                gridSize >= 1 &&
                gridSize <= 64 &&
                colors.length === gridSize * gridSize &&
                colors.every(isColor);
            if (!isValid) return noOp("openDocument");
            reset(model, gridSize, [...colors]);
            return changed;
        }
    }
};

// ---------------------------------------------------------------------------
// The document

const apply = (doc: SketchDocument, command: Command): SketchDocument => {
    switch (command.kind) {
        case "beginStroke":
            return beginStroke(doc);
        case "paintCells":
            return paintCells(doc, command.indices, command.brush);
        case "endStroke":
            return endStroke(doc);
        case "stroke":
            return endStroke(
                paintCells(beginStroke(doc), command.indices, command.brush)
            );
        case "fillFrom":
            return fillFrom(doc, command.index, command.color);
        case "clearCanvas":
            return clearCanvas(doc);
        case "rotateCanvas":
            return rotateCanvas(doc);
        case "undo":
            return undo(doc);
        case "redo":
            return redo(doc);
        case "resizeDocument":
            return resizeDocument(doc, command.size);
        case "startNewDocument":
            return startNewDocument(doc);
        case "reopen":
            return resumeDocument(committedDocument(doc));
        case "openDocument":
            return openDocument(command.sketch) ?? doc;
    }
};

/**
 * Freezes the parts an edit reads: the document, its colors and baseline, its
 * stacks, and the newest step on each. Every step is newest when recorded,
 * and undo and redo only move steps between the stacks, so over a sequence
 * each step is frozen before any edit could reach it.
 */
const freeze = (doc: SketchDocument): SketchDocument => {
    for (const stack of [doc.undoStack, doc.redoStack]) {
        const newest = stack.at(-1);
        newest?.forEach((change) => Object.freeze(change));
        Object.freeze(newest);
        Object.freeze(stack);
    }
    Object.freeze(doc.colors);
    Object.freeze(doc.strokeBaseline);

    return Object.freeze(doc);
};

/** A recorded step holds together: real cells, once each, really changed. */
const expectWellFormedStep = (doc: SketchDocument, stack: "undo" | "redo") => {
    const entry = (stack === "undo" ? doc.undoStack : doc.redoStack).at(-1);
    if (!entry) return;

    const cells = entry.map((change) => change.index);
    expect(entry.length).toBeGreaterThan(0);
    expect(new Set(cells).size).toBe(cells.length);
    for (const { index, before, after } of entry) {
        expect(index >= 0 && index < doc.colors.length).toBe(true);
        expect(isColor(before) && isColor(after) && before !== after).toBe(
            true
        );
    }
};

const expectAgreement = (doc: SketchDocument, model: Model) => {
    expect(doc.gridSize).toBe(model.gridSize);
    // Compared by hand first, so that the deep diff runs only on a failure.
    if (!sameColors(doc.colors, model.colors)) {
        expect(doc.colors).toEqual(model.colors);
    }
    expect(isStrokeOpen(doc)).toBe(model.baseline !== null);
    const committed = committedDocument(doc).colors;
    const modelCommitted = model.baseline ?? model.colors;
    if (!sameColors(committed, modelCommitted)) {
        expect(committed).toEqual(modelCommitted);
    }
    expect(doc.undoStack).toHaveLength(model.past.length);
    expect(doc.redoStack).toHaveLength(model.future.length);
    expect(hasWorkToLose(doc)).toBe(hasWork(model));
    expectWellFormedStep(doc, "undo");
    expectWellFormedStep(doc, "redo");
};

/**
 * `Math.random`, as a seeded sequence, whose every value the model must
 * account for: the colorful pen draws one color per cell index it paints.
 */
const seededRandom = (seed: number) => {
    let state = seed >>> 0;
    const drawn: number[] = [];

    vi.spyOn(Math, "random").mockImplementation(() => {
        state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
        const value = state / 2 ** 32;
        drawn.push(value);
        return value;
    });

    return {
        nextColor: () => {
            const value = drawn.shift();
            if (value === undefined) {
                throw new Error(
                    "The model painted more colors than were drawn"
                );
            }
            return `#${Math.floor(value * 0x1000000)
                .toString(16)
                .padStart(6, "0")
                .toUpperCase()}`;
        },
        expectAllUsed: () => expect(drawn).toEqual([]),
    };
};

const runAgainstModel = (
    gridSize: number,
    commands: Command[],
    seed: number
) => {
    takeLogs();
    const random = seededRandom(seed);
    const model: Model = {
        gridSize,
        colors: blank(gridSize),
        past: [],
        future: [],
        baseline: null,
    };
    let doc = createDocument(gridSize);
    expectAgreement(doc, model);

    for (const command of commands) {
        const next = apply(freeze(doc), command);
        const { isNoOp, refusedBy } = step(model, command, random.nextColor);

        if (isNoOp) expect(next).toBe(doc);
        expect(takeLogs().map(({ data }) => data?.where)).toEqual(refusedBy);
        random.expectAllUsed();
        expectAgreement(next, model);
        doc = next;
    }
};

// ---------------------------------------------------------------------------
// The commands

const PALETTE = [BLANK_CELL_COLOR, "#000000", "#123456", "#ABCDEF"];

const anyColor = fc.oneof(
    { arbitrary: fc.constantFrom(...PALETTE), weight: 20 },
    { arbitrary: fc.constantFrom("#abcdef", "red", ""), weight: 1 }
);

/** Mostly cells of the small grids, now and then one of a larger or none. */
const anyIndex = fc.oneof(
    { arbitrary: fc.integer({ min: 0, max: 8 }), weight: 20 },
    { arbitrary: fc.integer({ min: 9, max: 36 }), weight: 4 },
    { arbitrary: fc.constantFrom(-1, 1.5, Number.NaN), weight: 1 }
);

const anyIndices = fc.array(anyIndex, { maxLength: 6 });

const anyBrush: fc.Arbitrary<Brush> = fc.record({
    tool: fc.constantFrom(...DRAWING_TOOLS),
    color: anyColor,
    symmetry: fc.record({ topBottom: fc.boolean(), leftRight: fc.boolean() }),
});

const anySketch: fc.Arbitrary<Sketch> = fc.oneof(
    {
        arbitrary: fc.integer({ min: 1, max: 4 }).chain((gridSize) =>
            fc.record({
                gridSize: fc.constant(gridSize),
                colors: fc.array(fc.constantFrom(...PALETTE), {
                    minLength: gridSize * gridSize,
                    maxLength: gridSize * gridSize,
                }),
            })
        ),
        weight: 5,
    },
    {
        arbitrary: fc.constantFrom(
            { gridSize: 2, colors: ["#000000"] },
            { gridSize: 1, colors: ["#abcdef"] },
            { gridSize: 0, colors: [] }
        ),
        weight: 1,
    }
);

const anySize = fc.oneof(
    { arbitrary: fc.integer({ min: 1, max: 6 }), weight: 6 },
    {
        arbitrary: fc.constantFrom(0, -3, 2.5, 3.4, Number.NaN, Infinity),
        weight: 1,
    }
);

const anyCommand: fc.Arbitrary<Command> = fc.oneof(
    { arbitrary: fc.constant({ kind: "beginStroke" as const }), weight: 4 },
    {
        arbitrary: fc.record({
            kind: fc.constant("paintCells" as const),
            indices: anyIndices,
            brush: anyBrush,
        }),
        weight: 6,
    },
    { arbitrary: fc.constant({ kind: "endStroke" as const }), weight: 4 },
    {
        arbitrary: fc.record({
            kind: fc.constant("stroke" as const),
            indices: anyIndices,
            brush: anyBrush,
        }),
        weight: 6,
    },
    {
        arbitrary: fc.record({
            kind: fc.constant("fillFrom" as const),
            index: anyIndex,
            color: anyColor,
        }),
        weight: 4,
    },
    { arbitrary: fc.constant({ kind: "clearCanvas" as const }), weight: 1 },
    { arbitrary: fc.constant({ kind: "rotateCanvas" as const }), weight: 2 },
    { arbitrary: fc.constant({ kind: "undo" as const }), weight: 5 },
    { arbitrary: fc.constant({ kind: "redo" as const }), weight: 4 },
    {
        arbitrary: fc.record({
            kind: fc.constant("resizeDocument" as const),
            size: anySize,
        }),
        weight: 1,
    },
    {
        arbitrary: fc.constant({ kind: "startNewDocument" as const }),
        weight: 1,
    },
    { arbitrary: fc.constant({ kind: "reopen" as const }), weight: 2 },
    {
        arbitrary: fc.record({
            kind: fc.constant("openDocument" as const),
            sketch: anySketch,
        }),
        weight: 1,
    }
);

describe("the document, against a reference model", () => {
    // A failing sequence is shrunk by running shorter ones, which log too;
    // the failure is what to report, not their logs.
    afterEach(() => {
        takeLogs();
    });

    it("agrees on any sequence of edits", { timeout: 15_000 }, () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 6 }),
                fc.array(anyCommand, { maxLength: 40 }),
                fc.integer(),
                runAgainstModel
            ),
            { numRuns: 400 }
        );
    });

    // Past the cap on history, both ways: more steps recorded than it keeps,
    // then more undone and redone than it holds. The long runs are built
    // rather than generated, so that a failure shrinks in seconds: only their
    // length and the short random stretch between them are shrunk.
    it("agrees past the cap on history", { timeout: 15_000 }, () => {
        const fills = (count: number): Command[] =>
            Array.from({ length: count }, (_, at) => ({
                kind: "fillFrom",
                index: 0,
                color: at % 2 === 0 ? "#000000" : "#123456",
            }));
        const repeat = (kind: "undo" | "redo"): Command[] =>
            Array.from({ length: MAX_HISTORY_ENTRIES + 5 }, () => ({ kind }));

        fc.assert(
            fc.property(
                fc.integer({
                    min: MAX_HISTORY_ENTRIES,
                    max: MAX_HISTORY_ENTRIES + 60,
                }),
                fc.array(anyCommand, { maxLength: 20 }),
                fc.integer(),
                (recorded, between, seed) =>
                    runAgainstModel(
                        2,
                        [
                            ...fills(recorded),
                            ...between,
                            ...repeat("undo"),
                            ...repeat("redo"),
                        ],
                        seed
                    )
            ),
            { numRuns: 30 }
        );
    });
});
