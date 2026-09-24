/** @file Driving the store from a test the way the UI would. */

import { BLANK_CELL_COLOR } from "../domain/grid";
import {
    type SketchActions,
    type SketchStore,
    useSketchStore,
} from "../state/sketchStore";

// Captured at module load, before any test runs, so a reset restores exactly
// the store's declared initial state.
const INITIAL_STATE = useSketchStore.getState();

/** The store is a module singleton, so every test starts from a known state. */
export const resetSketchStore = (): void => {
    useSketchStore.setState(INITIAL_STATE, true);
};

/** The current state, read without subscribing. */
export const store = (): SketchStore => useSketchStore.getState();

export const actions = (): SketchActions => store().actions;

/** The colors on the canvas right now. */
export const canvasColors = (): readonly string[] => store().document.colors;

export const isCanvasBlank = (): boolean =>
    canvasColors().every((color) => color === BLANK_CELL_COLOR);

/** Paints one committed stroke, the way a pointer drag would. */
export const paintStroke = (...indices: number[]): void => {
    const { beginStroke, paintCells, endStroke } = actions();

    beginStroke();
    paintCells(indices);
    endStroke();
};
