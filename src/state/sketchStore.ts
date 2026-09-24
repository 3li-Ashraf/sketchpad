/**
 * @file The Zustand store: the document being edited, the editor settings
 * around it, and the actions that change them. Editing rules live in
 * `domain/sketchDocument`; the store only applies them, and performs no I/O.
 */

import { create } from "zustand";

import { parseHexColor } from "../domain/color";
import { DEFAULT_GRID_SIZE, type Sketch, type Symmetry } from "../domain/grid";
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
import type { DrawingTool } from "../domain/tools";
import {
    DEFAULT_EDITOR_SETTINGS,
    type EditorSettings,
    type Workspace,
} from "../domain/workspace";

/**
 * The edits that erase a drawing with no undo step, each asked about first
 * while there is something to lose; see `mustAskBefore`.
 */
export type ConfirmedAction = "resize" | "replace" | "newSketch";

interface SketchState {
    document: SketchDocument;
    /**
     * Kept with the document in the workspace, as one object that every
     * change replaces, so a change to any of them is seen by identity.
     */
    settings: EditorSettings;
    /**
     * Whether each confirmed action still asks. "Don't ask again" turns one
     * off; the workspace leaves these out of the autosave, so that lasts
     * until the page is reloaded.
     */
    askBefore: Readonly<Record<ConfirmedAction, boolean>>;
}

export interface SketchActions {
    setTool: (tool: DrawingTool) => void;
    setPenColor: (color: string) => void;
    toggleSymmetry: (axis: keyof Symmetry) => void;
    toggleGridLines: () => void;
    stopAskingBefore: (action: ConfirmedAction) => void;
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

    // Likewise for settings: choosing what is already chosen changes nothing.
    const changeSettings = (
        change: (settings: EditorSettings) => Partial<EditorSettings>
    ) =>
        set((state) => {
            const { settings } = state;
            const changed = change(settings);
            const isSame = (
                Object.keys(changed) as (keyof EditorSettings)[]
            ).every((key) => changed[key] === settings[key]);

            return isSame ? state : { settings: { ...settings, ...changed } };
        });

    return {
        document: createDocument(DEFAULT_GRID_SIZE),
        settings: DEFAULT_EDITOR_SETTINGS,
        askBefore: { resize: true, replace: true, newSketch: true },

        actions: {
            setTool: (tool) => changeSettings(() => ({ tool })),
            // The native color input reports lowercase, which is accepted;
            // anything that is not a color at all is refused.
            setPenColor: (color) => {
                const penColor = parseHexColor(color);
                if (penColor) changeSettings(() => ({ penColor }));
                else reportInvalidInput("setPenColor", "not a color", color);
            },
            toggleSymmetry: (axis) =>
                changeSettings(({ symmetry }) => ({
                    symmetry: { ...symmetry, [axis]: !symmetry[axis] },
                })),
            toggleGridLines: () =>
                changeSettings(({ showGridLines }) => ({
                    showGridLines: !showGridLines,
                })),
            stopAskingBefore: (action) =>
                set(({ askBefore }) => ({
                    askBefore: { ...askBefore, [action]: false },
                })),

            setGridSize: (gridSize) =>
                edit((doc) => resizeDocument(doc, gridSize)),
            loadSketch: (sketch) => edit((doc) => openDocument(sketch) ?? doc),
            restoreWorkspace: ({ document, settings }) =>
                set({ document: resumeDocument(document), settings }),
            startNewSketch: () => edit(startNewDocument),
            beginStroke: () => edit(beginStroke),
            paintCells: (indices) =>
                edit((doc, { settings: { tool, penColor, symmetry } }) =>
                    paintCells(doc, indices, {
                        tool,
                        color: penColor,
                        symmetry,
                    })
                ),
            endStroke: () => edit(endStroke),
            fillFrom: (index) =>
                edit((doc, { settings }) =>
                    fillFrom(doc, index, settings.penColor)
                ),
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

/**
 * Whether an action has to ask before it erases the drawing: it still asks,
 * and there is something to lose. It takes the action as well as the state,
 * so it is read from `getState()`, when the action is about to run.
 */
export const mustAskBefore = (
    state: SketchStore,
    action: ConfirmedAction
): boolean => state.askBefore[action] && hasWorkToLose(state.document);

// Derived values, built afresh on every call, so read them from
// `useSketchStore.getState()`. As a selector, a new object each time would
// never compare equal, and the component would render without end.

/**
 * Everything kept between visits, as last committed: a stroke still being
 * drawn is left out. See `domain/workspace`.
 */
export const workspaceOf = ({
    document,
    settings,
}: SketchStore): Workspace => ({
    document: committedDocument(document),
    settings,
});

/** The artwork alone, without history or editor settings. */
export const sketchOf = ({ document }: SketchStore): Sketch => ({
    gridSize: document.gridSize,
    colors: document.colors,
});
