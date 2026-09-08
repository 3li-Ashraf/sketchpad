/** @file Driving the store from a test the way the UI would. */

import { createBlankGrid } from "../domain/grid";
import { useSketchStore, type SketchStore } from "../state/sketchStore";

// Captured at module load, before any test runs, so a reset restores exactly
// what the store declares as its initial state and cannot drift from it.
const INITIAL_STATE = useSketchStore.getState();

/** The store is a module singleton, so each test starts from a known state. */
export const resetSketchStore = (): void => {
    useSketchStore.setState(INITIAL_STATE, true);
};

/** Reads the current state without subscribing. */
export const store = (): SketchStore => useSketchStore.getState();

/**
 * Switches to a blank grid of the given size, bypassing `setGridSize` — which
 * would also clear the history a test may have just set up. Deliberately not
 * named like a hook: it is a plain function, and a `use` prefix would put it
 * under the rules-of-hooks lint rule for no reason.
 */
export const switchToGridSize = (gridSize: number): void => {
    useSketchStore.setState({ gridSize, colors: createBlankGrid(gridSize) });
};

/** Paints one committed stroke, the way a pointer drag would. */
export const paintStroke = (...indices: number[]): void => {
    const { beginStroke, paintCells, endStroke } = store();

    beginStroke();
    paintCells(indices);
    endStroke();
};
