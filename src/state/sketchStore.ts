/**
 * @file The Zustand store, and the one place the domain rules, the editor
 * settings and the UI meet. Its actions own every write to `colors`, which is
 * what keeps `domain/` free of state and the components free of drawing rules.
 * It holds no browser I/O: saving, loading and exporting live in `io/`.
 */

import { create } from "zustand";
import { normalizeHexColor } from "../domain/color";
import {
    BLANK_CELL_COLOR,
    clampGridSize,
    collectFillRegion,
    createBlankGrid,
    DEFAULT_GRID_SIZE,
    forEachMirroredCell,
    type Sketch,
} from "../domain/grid";
import {
    appendEntry,
    diffColors,
    reapplyEntry,
    revertEntry,
    type CellChange,
    type HistoryEntry,
} from "../domain/history";
import {
    DEFAULT_PEN_COLOR,
    DEFAULT_TOOL,
    isStrokeTool,
    paintsPerCell,
    strokeColor,
    type DrawingTool,
} from "../domain/tools";

interface SketchState extends Sketch {
    penColor: string;
    tool: DrawingTool;
    mirrorX: boolean;
    mirrorY: boolean;
    showGridLines: boolean;
    undoStack: HistoryEntry[];
    redoStack: HistoryEntry[];
    /**
     * The colors as they were when the in-progress stroke began, or null while
     * idle. Diffing against this on pointer-up is what makes a whole drag one
     * undo step. `colors` is replaced rather than mutated, so holding on to the
     * old array costs nothing.
     */
    strokeBaseline: string[] | null;
}

interface SketchActions {
    setPenColor: (color: string) => void;
    setTool: (tool: DrawingTool) => void;
    setGridSize: (gridSize: number) => void;
    toggleMirrorX: () => void;
    toggleMirrorY: () => void;
    toggleGridLines: () => void;
    /**
     * A stroke runs as `beginStroke`, then any number of `paintCells`, then
     * `endStroke`; that pairing is what collapses a drag into one undo step.
     * `paintCells` outside it is ignored, so a stray pointer move cannot paint.
     */
    beginStroke: () => void;
    paintCells: (indices: readonly number[]) => void;
    endStroke: () => void;
    /**
     * Every action below writes history of its own, so each is refused while a
     * stroke is open — see the note above `fillFrom`. `setGridSize` and
     * `loadSketch` are the exceptions: both abandon the stroke outright by
     * clearing the baseline along with the stacks.
     */
    fillFrom: (index: number) => void;
    clearGrid: () => void;
    undo: () => void;
    redo: () => void;
    loadSketch: (sketch: Sketch) => void;
}

export type SketchStore = SketchState & SketchActions;

/** A blank grid of the given size, with nothing left to undo or redo. */
const blankGridState = (gridSize: number) => ({
    gridSize,
    colors: createBlankGrid(gridSize),
    undoStack: [],
    redoStack: [],
    strokeBaseline: null,
});

export const useSketchStore = create<SketchStore>((set, get) => ({
    ...blankGridState(DEFAULT_GRID_SIZE),
    penColor: DEFAULT_PEN_COLOR,
    tool: DEFAULT_TOOL,
    mirrorX: false,
    mirrorY: false,
    showGridLines: true,

    // Normalized here because the native color input reports lowercase. This is
    // the only path into the store that can carry another case; colors from a
    // loaded file are already uppercase, from `rgbToHex`.
    setPenColor: (color) => set({ penColor: normalizeHexColor(color) }),

    setTool: (tool) => set({ tool }),

    // Resizing starts a new drawing, so the history is dropped with it: an entry
    // recorded at one size cannot be applied at another. A resize to the size
    // already in use is skipped, which keeps the drawing.
    setGridSize: (gridSize) => {
        const size = clampGridSize(gridSize);
        if (size === get().gridSize) return;

        set(blankGridState(size));
    },

    toggleMirrorX: () => set((state) => ({ mirrorX: !state.mirrorX })),

    toggleMirrorY: () => set((state) => ({ mirrorY: !state.mirrorY })),

    toggleGridLines: () =>
        set((state) => ({ showGridLines: !state.showGridLines })),

    beginStroke: () => set({ strokeBaseline: get().colors }),

    paintCells: (indices) => {
        const {
            colors,
            gridSize,
            tool,
            penColor,
            mirrorX,
            mirrorY,
            strokeBaseline,
        } = get();

        if (strokeBaseline === null || !isStrokeTool(tool) || indices.length === 0) {
            return;
        }

        // Only the colorful pen needs a color per cell; every other tool resolves
        // one color for the whole call, so `paint` is re-read per cell only in
        // that case. The empty string it starts on there is a sentinel that is
        // overwritten before the first cell is painted.
        const perCell = paintsPerCell(tool);
        let paint = perCell ? "" : strokeColor(tool, penColor);

        // Copied on the first cell that actually changes, so dragging within one
        // cell, or repainting the color already there, allocates nothing and
        // leaves the array identity alone for the components subscribed to it.
        let next: string[] | null = null;

        // Hoisted out of the loop so a whole call allocates one closure, rather
        // than one per traced cell. It reads `paint` and `next` from the scope
        // around it for the same reason.
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
            if (index < 0 || index >= colors.length) continue;

            if (perCell) paint = strokeColor(tool, penColor);
            forEachMirroredCell(index, gridSize, mirrorX, mirrorY, paintCell);
        }

        if (next !== null) set({ colors: next });
    },

    endStroke: () => {
        const { colors, undoStack, strokeBaseline } = get();
        if (strokeBaseline === null) return;

        const changes = diffColors(strokeBaseline, colors);

        set(
            changes.length === 0
                ? { strokeBaseline: null }
                : {
                      strokeBaseline: null,
                      undoStack: appendEntry(undoStack, changes),
                      redoStack: [],
                  }
        );
    },

    /**
     * Mirroring deliberately does not apply here: fill floods exactly the region
     * that was clicked.
     *
     * Refused mid-stroke, as `clearGrid`, `undo` and `redo` are. An action that
     * writes its own entry while a baseline is live corrupts the history two
     * ways at once: its `before` colors are read from a grid the committed
     * history never contained, and `endStroke` then diffs across it and records
     * the same cells a second time. A second finger on the toolbar while the
     * first is drawing is enough to reach this, so it is a real gesture rather
     * than a theoretical one.
     */
    fillFrom: (index) => {
        const { colors, gridSize, penColor, undoStack, strokeBaseline } = get();
        if (
            strokeBaseline !== null ||
            index < 0 ||
            index >= colors.length ||
            colors[index] === penColor
        ) {
            return;
        }

        // No "did anything change" guard is needed: the region always holds at
        // least the cell that was clicked, whose color is known to differ.
        const next = colors.slice();
        const changes: CellChange[] = [];

        for (const target of collectFillRegion(colors, gridSize, index)) {
            changes.push({ index: target, before: next[target], after: penColor });
            next[target] = penColor;
        }

        set({
            colors: next,
            undoStack: appendEntry(undoStack, changes),
            redoStack: [],
        });
    },

    clearGrid: () => {
        const { colors, gridSize, undoStack, strokeBaseline } = get();
        if (strokeBaseline !== null) return;

        const changes: CellChange[] = [];

        for (let index = 0; index < colors.length; index++) {
            if (colors[index] !== BLANK_CELL_COLOR) {
                changes.push({
                    index,
                    before: colors[index],
                    after: BLANK_CELL_COLOR,
                });
            }
        }

        if (changes.length === 0) return;

        set({
            colors: createBlankGrid(gridSize),
            undoStack: appendEntry(undoStack, changes),
            redoStack: [],
        });
    },

    // Both are ignored mid-stroke, for the reason spelled out above `fillFrom`:
    // rewinding underneath a live baseline would leave `endStroke` committing a
    // diff that spans the undone step.
    undo: () => {
        const { colors, undoStack, redoStack, strokeBaseline } = get();
        const entry = undoStack.at(-1);
        if (strokeBaseline !== null || !entry) return;

        set({
            colors: revertEntry(colors, entry),
            undoStack: undoStack.slice(0, -1),
            redoStack: [...redoStack, entry],
        });
    },

    redo: () => {
        const { colors, undoStack, redoStack, strokeBaseline } = get();
        const entry = redoStack.at(-1);
        if (strokeBaseline !== null || !entry) return;

        set({
            colors: reapplyEntry(colors, entry),
            undoStack: [...undoStack, entry],
            redoStack: redoStack.slice(0, -1),
        });
    },

    // The incoming colors are copied rather than aliased, so a caller that keeps
    // hold of its array cannot go on editing what the store is rendering.
    loadSketch: ({ gridSize, colors }) =>
        set({
            gridSize,
            colors: [...colors],
            undoStack: [],
            redoStack: [],
            strokeBaseline: null,
        }),
}));

export const selectCanUndo = (state: SketchStore): boolean =>
    state.undoStack.length > 0;

export const selectCanRedo = (state: SketchStore): boolean =>
    state.redoStack.length > 0;

/** The drawing on its own, without the editor state that surrounds it. */
export const selectSketch = ({ gridSize, colors }: SketchStore): Sketch => ({
    gridSize,
    colors,
});
