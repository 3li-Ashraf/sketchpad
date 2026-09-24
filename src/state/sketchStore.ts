/**
 * @file The Zustand store: the document being edited, the editor settings
 * around it, and the actions that change them. Editing rules live in
 * `domain/sketchDocument`; the store only applies them, and performs no I/O.
 */

import { create } from "zustand";

import { parseHexColor } from "../domain/color";
import {
    DEFAULT_GRID_SIZE,
    NO_SYMMETRY,
    type Sketch,
    type Symmetry,
} from "../domain/grid";
import { reportInvalidInput } from "../domain/invalidInput";
import {
    beginStroke,
    clearCanvas,
    committedDocument,
    createDocument,
    endStroke,
    fillFrom,
    hasWorkToLose,
    openDocument,
    paintCells,
    redo,
    resizeDocument,
    resumeDocument,
    rotateCanvas,
    type SketchDocument,
    startNewDocument,
    undo,
} from "../domain/sketchDocument";
import {
    DEFAULT_PEN_COLOR,
    DEFAULT_TOOL,
    type DrawingTool,
} from "../domain/tools";
import type { Workspace } from "../domain/workspace";

interface SketchState {
    document: SketchDocument;
    tool: DrawingTool;
    /** Uppercase `#RRGGBB`, like every color in the app. */
    penColor: string;
    symmetry: Symmetry;
    showGridLines: boolean;
    /**
     * Whether resizing, opening a file, or starting a new sketch over a
     * drawing asks first. "Don't ask again" turns one off; the workspace
     * leaves these out of the autosave, so that lasts until the page is
     * reloaded.
     */
    askBeforeResize: boolean;
    askBeforeReplace: boolean;
    askBeforeNewSketch: boolean;
}

export interface SketchActions {
    setTool: (tool: DrawingTool) => void;
    setPenColor: (color: string) => void;
    toggleSymmetry: (axis: keyof Symmetry) => void;
    toggleGridLines: () => void;
    stopAskingBeforeResize: () => void;
    stopAskingBeforeReplace: () => void;
    stopAskingBeforeNewSketch: () => void;
    setGridSize: (gridSize: number) => void;
    loadSketch: (sketch: Sketch) => void;
    /** Puts back a workspace saved by an earlier visit, history and all. */
    restoreWorkspace: (workspace: Workspace) => void;
    /** Erases the drawing and its history, keeping the size and settings. */
    startNewSketch: () => void;
    beginStroke: () => void;
    paintCells: (indices: readonly number[]) => void;
    endStroke: () => void;
    fillFrom: (index: number) => void;
    clearCanvas: () => void;
    /** Turns the drawing a quarter turn clockwise, as one undo step. */
    rotateCanvas: () => void;
    undo: () => void;
    redo: () => void;
}

export interface SketchStore extends SketchState {
    /** Created once and never replaced, so selecting it never re-renders. */
    actions: SketchActions;
}

type Edit = (doc: SketchDocument, state: SketchStore) => SketchDocument;

export const useSketchStore = create<SketchStore>()((set) => {
    // An edit that changes nothing returns the same document, and handing the
    // same state back to `set` skips notifying subscribers at all.
    const edit = (apply: Edit) =>
        set((state) => {
            const next = apply(state.document, state);

            return next === state.document ? state : { document: next };
        });

    return {
        document: createDocument(DEFAULT_GRID_SIZE),
        tool: DEFAULT_TOOL,
        penColor: DEFAULT_PEN_COLOR,
        symmetry: NO_SYMMETRY,
        showGridLines: true,
        askBeforeResize: true,
        askBeforeReplace: true,
        askBeforeNewSketch: true,

        actions: {
            setTool: (tool) => set({ tool }),
            // The native color input reports lowercase, which is accepted;
            // anything that is not a color at all is refused.
            setPenColor: (color) => {
                const penColor = parseHexColor(color);
                if (penColor) set({ penColor });
                else reportInvalidInput("setPenColor", "not a color", color);
            },
            toggleSymmetry: (axis) =>
                set(({ symmetry }) => ({
                    symmetry: { ...symmetry, [axis]: !symmetry[axis] },
                })),
            toggleGridLines: () =>
                set(({ showGridLines }) => ({ showGridLines: !showGridLines })),
            stopAskingBeforeResize: () => set({ askBeforeResize: false }),
            stopAskingBeforeReplace: () => set({ askBeforeReplace: false }),
            stopAskingBeforeNewSketch: () => set({ askBeforeNewSketch: false }),

            setGridSize: (gridSize) =>
                edit((doc) => resizeDocument(doc, gridSize)),
            loadSketch: (sketch) => edit((doc) => openDocument(sketch) ?? doc),
            restoreWorkspace: ({ document, settings }) =>
                set({ document: resumeDocument(document), ...settings }),
            startNewSketch: () => edit(startNewDocument),
            beginStroke: () => edit(beginStroke),
            paintCells: (indices) =>
                edit((doc, { tool, penColor, symmetry }) =>
                    paintCells(doc, indices, {
                        tool,
                        color: penColor,
                        symmetry,
                    })
                ),
            endStroke: () => edit(endStroke),
            fillFrom: (index) =>
                edit((doc, { penColor }) => fillFrom(doc, index, penColor)),
            clearCanvas: () => edit(clearCanvas),
            rotateCanvas: () => edit(rotateCanvas),
            undo: () => edit(undo),
            redo: () => edit(redo),
        },
    };
});

export const useSketchActions = (): SketchActions =>
    useSketchStore((state) => state.actions);

// Selectors, safe to pass to `useSketchStore`: each returns a primitive or a
// part of the state, so an unchanged state selects an equal value.

export const selectCanUndo = (state: SketchStore): boolean =>
    state.document.undoStack.length > 0;

export const selectCanRedo = (state: SketchStore): boolean =>
    state.document.redoStack.length > 0;

export const selectHasWorkToLose = (state: SketchStore): boolean =>
    hasWorkToLose(state.document);

// Derived values, built afresh on every call, so read them from
// `useSketchStore.getState()`. As a selector, a new object each time would
// never compare equal, and the component would render without end.

/**
 * Everything kept between visits, as last committed: a stroke still being
 * drawn is left out. See `domain/workspace`.
 */
export const workspaceOf = ({
    document,
    tool,
    penColor,
    symmetry,
    showGridLines,
}: SketchStore): Workspace => ({
    document: committedDocument(document),
    settings: { tool, penColor, symmetry, showGridLines },
});

/** The artwork alone, without history or editor settings. */
export const sketchOf = ({ document }: SketchStore): Sketch => ({
    gridSize: document.gridSize,
    colors: document.colors,
});
