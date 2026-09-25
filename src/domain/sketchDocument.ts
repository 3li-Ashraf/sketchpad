/**
 * @file The drawing being edited, with its undo history and any stroke in
 * progress, and every edit that can be made to it.
 *
 * Each edit is a pure function from one document to the next, and returns its
 * input unchanged when it changes nothing, so callers can detect a no-op by
 * identity. Two rules hold throughout:
 *
 * - A stroke is `beginStroke`, any number of `paintCells`, then `endStroke`,
 *   and commits as one undo step.
 * - While a stroke is open, `fillFrom`, `clearCanvas`, `rotateCanvas`,
 *   `undo` and `redo` are refused. Each records history of its own, and doing that under a live
 *   baseline records `before` colors no committed state held, then has
 *   `endStroke` record the same cells again. A second finger on the toolbar
 *   is enough to reach it. `resizeDocument`, `openDocument` and
 *   `startNewDocument` instead start a new document, abandoning the stroke.
 */

import { isHexColor } from "./color";
import {
    BLANK_CELL_COLOR,
    clampGridSize,
    collectFillRegion,
    createBlankGrid,
    forEachMirroredCell,
    isBlankGrid,
    isCellIndex,
    isValidSketch,
    rotateClockwise,
    type Sketch,
    type Symmetry,
} from "./grid";
import {
    appendEntry,
    type CellChange,
    diffColors,
    type HistoryEntry,
    reapplyEntry,
    revertEntry,
} from "./history";
import { reportInvalidInput } from "./invalidInput";
import {
    type DrawingTool,
    isStrokeTool,
    paintsPerCell,
    strokeColor,
} from "./tools";

export interface SketchDocument extends Sketch {
    readonly undoStack: readonly HistoryEntry[];
    readonly redoStack: readonly HistoryEntry[];
    /**
     * The colors when the open stroke began, or null while none is open.
     * `endStroke` diffs against it, which is what makes a drag one undo step.
     */
    readonly strokeBaseline: readonly string[] | null;
}

/** A document between strokes: what an edit has committed, and no more. */
export type CommittedDocument = Omit<SketchDocument, "strokeBaseline">;

/** What a stroke paints with. */
export interface Brush {
    tool: DrawingTool;
    color: string;
    symmetry: Symmetry;
}

export const createDocument = (gridSize: number): SketchDocument => ({
    gridSize,
    colors: createBlankGrid(gridSize),
    undoStack: [],
    redoStack: [],
    strokeBaseline: null,
});

/**
 * A document for a loaded sketch, with no history, or null when the sketch
 * does not hold together. The colors are copied so that the caller's array can
 * never alias the one being edited.
 */
export const openDocument = (sketch: Sketch): SketchDocument | null => {
    if (!isValidSketch(sketch)) {
        reportInvalidInput("openDocument", "not a valid sketch", sketch);
        return null;
    }

    return {
        gridSize: sketch.gridSize,
        colors: [...sketch.colors],
        undoStack: [],
        redoStack: [],
        strokeBaseline: null,
    };
};

/**
 * A blank document of the new size. History goes with it, since an entry
 * recorded at one size cannot apply at another. The current size, and a size
 * that is not a finite number, are no-ops; anything else is clamped.
 */
export const resizeDocument = (
    doc: SketchDocument,
    gridSize: number
): SketchDocument => {
    if (!Number.isFinite(gridSize)) {
        reportInvalidInput("resizeDocument", "not a finite size", gridSize);
        return doc;
    }

    const size = clampGridSize(gridSize);

    return size === doc.gridSize ? doc : createDocument(size);
};

/**
 * A fresh start: a blank document of the same size, and no history, so unlike
 * `clearCanvas` it cannot be undone. A document with nothing to lose is kept.
 */
export const startNewDocument = (doc: SketchDocument): SketchDocument =>
    hasWorkToLose(doc) ? createDocument(doc.gridSize) : doc;

/**
 * The document as its last committed edit left it. A stroke in progress is
 * not part of it: those cells are not an undo step yet, so keeping them
 * would keep paint that undo could never take away.
 */
export const committedDocument = ({
    gridSize,
    colors,
    undoStack,
    redoStack,
    strokeBaseline,
}: SketchDocument): CommittedDocument => ({
    gridSize,
    colors: strokeBaseline ?? colors,
    undoStack,
    redoStack,
});

/**
 * Whether two documents have committed the same drawing and history, part by
 * part, by identity: what `committedDocument` would give for each, compared
 * without building it. A stroke's paint is no difference until it commits.
 */
export const isSameCommittedDocument = (
    a: SketchDocument,
    b: SketchDocument
): boolean =>
    a.gridSize === b.gridSize &&
    (a.strokeBaseline ?? a.colors) === (b.strokeBaseline ?? b.colors) &&
    a.undoStack === b.undoStack &&
    a.redoStack === b.redoStack;

/** Picks a committed document up again, with no stroke open. */
export const resumeDocument = (
    committed: CommittedDocument
): SketchDocument => ({ ...committed, strokeBaseline: null });

export const isStrokeOpen = (doc: SketchDocument): boolean =>
    doc.strokeBaseline !== null;

/** Sets new colors as one undo step, which invalidates anything to redo. */
const commit = (
    doc: SketchDocument,
    colors: readonly string[],
    changes: HistoryEntry
): SketchDocument => ({
    ...doc,
    colors,
    undoStack: appendEntry(doc.undoStack, changes),
    redoStack: [],
});

export const beginStroke = (doc: SketchDocument): SketchDocument =>
    isStrokeOpen(doc) ? doc : { ...doc, strokeBaseline: doc.colors };

/**
 * Paints the cells at `indices` and their reflections. Ignored outside a
 * stroke, for a tool that does not stroke, for a color that is not valid, and
 * for any index that does not name a cell.
 *
 * This runs on every pointer move of a drag. The colors are copied only once a
 * cell actually changes, so repainting what is already there returns the
 * document untouched, and one closure serves the whole call.
 */
export const paintCells = (
    doc: SketchDocument,
    indices: readonly number[],
    { tool, color, symmetry }: Brush
): SketchDocument => {
    const { colors, gridSize } = doc;
    if (!isStrokeOpen(doc) || !isStrokeTool(tool) || indices.length === 0) {
        return doc;
    }

    // Only the colorful pen picks a color per cell; every other tool resolves
    // one for the whole call. The empty string is overwritten before use.
    const perCell = paintsPerCell(tool);
    let paint = perCell ? "" : strokeColor(tool, color);
    if (!perCell && !isHexColor(paint)) {
        reportInvalidInput("paintCells", "not a #RRGGBB color", paint);
        return doc;
    }

    let next: string[] | null = null;
    // Allocated only if an index is refused, so a valid drag pays nothing.
    let refused: number[] | null = null;

    const paintCell = (target: number) => {
        if (next === null) {
            if (colors[target] === paint) return;
            next = colors.slice();
        } else if (next[target] === paint) {
            return;
        }

        next[target] = paint;
    };

    for (const index of indices) {
        if (!isCellIndex(index, colors.length)) {
            (refused ??= []).push(index);
            continue;
        }

        if (perCell) paint = strokeColor(tool, color);
        forEachMirroredCell(index, gridSize, symmetry, paintCell);
    }

    if (refused) reportInvalidInput("paintCells", "not cells", refused);

    return next === null ? doc : { ...doc, colors: next };
};

export const endStroke = (doc: SketchDocument): SketchDocument => {
    if (doc.strokeBaseline === null) return doc;

    const changes = diffColors(doc.strokeBaseline, doc.colors);
    const closed = { ...doc, strokeBaseline: null };

    return changes.length === 0 ? closed : commit(closed, doc.colors, changes);
};

/**
 * Floods the region of matching color around `index`. Symmetry deliberately
 * does not apply: fill floods exactly the region that was clicked.
 */
export const fillFrom = (
    doc: SketchDocument,
    index: number,
    color: string
): SketchDocument => {
    const { colors, gridSize } = doc;
    if (isStrokeOpen(doc)) return doc;
    if (!isCellIndex(index, colors.length)) {
        reportInvalidInput("fillFrom", "not a cell", index);
        return doc;
    }
    if (!isHexColor(color)) {
        reportInvalidInput("fillFrom", "not a #RRGGBB color", color);
        return doc;
    }
    if (colors[index] === color) return doc;

    const region = collectFillRegion(colors, gridSize, index);

    const next = colors.slice();
    const changes: CellChange[] = region.map((target) => ({
        index: target,
        before: colors[target],
        after: color,
    }));

    for (const target of region) next[target] = color;

    return commit(doc, next, changes);
};

export const clearCanvas = (doc: SketchDocument): SketchDocument => {
    if (isStrokeOpen(doc)) return doc;

    const changes: CellChange[] = [];
    doc.colors.forEach((color, index) => {
        if (color !== BLANK_CELL_COLOR) {
            changes.push({ index, before: color, after: BLANK_CELL_COLOR });
        }
    });

    return changes.length === 0
        ? doc
        : commit(doc, createBlankGrid(doc.gridSize), changes);
};

/**
 * Turns the drawing a quarter turn clockwise, as one undo step of the cells
 * whose color moved. A drawing that looks the same turned is left as it is.
 */
export const rotateCanvas = (doc: SketchDocument): SketchDocument => {
    if (isStrokeOpen(doc)) return doc;

    const rotated = rotateClockwise(doc.colors, doc.gridSize);
    const changes = diffColors(doc.colors, rotated);

    return changes.length === 0 ? doc : commit(doc, rotated, changes);
};

export const undo = (doc: SketchDocument): SketchDocument => {
    const entry = doc.undoStack.at(-1);
    if (isStrokeOpen(doc) || !entry) return doc;

    return {
        ...doc,
        colors: revertEntry(doc.colors, entry),
        undoStack: doc.undoStack.slice(0, -1),
        redoStack: [...doc.redoStack, entry],
    };
};

export const redo = (doc: SketchDocument): SketchDocument => {
    const entry = doc.redoStack.at(-1);
    if (isStrokeOpen(doc) || !entry) return doc;

    return {
        ...doc,
        colors: reapplyEntry(doc.colors, entry),
        undoStack: [...doc.undoStack, entry],
        redoStack: doc.redoStack.slice(0, -1),
    };
};

/**
 * Whether replacing the document would destroy anything: a painted cell, or
 * a step that could still be undone or redone. A cleared grid looks blank
 * while the clear is one undo away, so history counts on its own.
 *
 * Cheap enough to evaluate on every change: history settles it at once, and
 * the scan stops at the first painted cell.
 */
export const hasWorkToLose = (doc: SketchDocument): boolean =>
    doc.undoStack.length > 0 ||
    doc.redoStack.length > 0 ||
    !isBlankGrid(doc.colors);
