/**
 * @file Each cell's color, with one store subscription for the whole canvas.
 *
 * A subscription per cell would run a selector for every cell on every change
 * to the store, 4096 of them at 64×64, including changes that are not colors
 * at all. Instead one listener compares the colors when they change and wakes
 * only the cells whose color did.
 */

import { useCallback, useSyncExternalStore } from "react";

import { type SketchStore, useSketchStore } from "../../state/sketchStore";

type Listener = () => void;

// By cell index; more than one only if two canvases are mounted at once.
const listenersAt = new Map<number, Listener[]>();
let colors: readonly string[] = [];
let unsubscribe: (() => void) | null = null;

const colorsOf = (state: SketchStore): readonly string[] =>
    state.document.colors;

/**
 * Compared over the length both grids share. A resize keeps the elements of
 * the cells whose index survives, and each of those must still show its new
 * color; past that length, a cell is either new, and reads the store as it
 * mounts, or about to unmount.
 */
const wakeChangedCells = (state: SketchStore): void => {
    const previous = colors;
    colors = colorsOf(state);
    if (colors === previous) return;

    const length = Math.min(colors.length, previous.length);
    for (let index = 0; index < length; index++) {
        if (colors[index] === previous[index]) continue;

        const listeners = listenersAt.get(index);
        if (listeners) for (const listener of listeners) listener();
    }
};

/** Subscribes to the store while any cell is mounted, and only then. */
const subscribeToCell = (index: number, listener: Listener): (() => void) => {
    if (!unsubscribe) {
        colors = colorsOf(useSketchStore.getState());
        unsubscribe = useSketchStore.subscribe(wakeChangedCells);
    }

    const listeners = listenersAt.get(index);
    if (listeners) listeners.push(listener);
    else listenersAt.set(index, [listener]);

    return () => {
        const remaining = listenersAt.get(index)!;
        remaining.splice(remaining.indexOf(listener), 1);
        if (remaining.length > 0) return;

        listenersAt.delete(index);
        if (listenersAt.size === 0) {
            unsubscribe!();
            unsubscribe = null;
        }
    };
};

/** The color of one cell, re-rendering only when that color changes. */
export const useCellColor = (index: number): string => {
    const subscribe = useCallback(
        (listener: Listener) => subscribeToCell(index, listener),
        [index]
    );
    // Read from the store itself, so a render never sees an older color
    // than the store holds.
    const getColor = useCallback(
        () => colorsOf(useSketchStore.getState())[index],
        [index]
    );

    return useSyncExternalStore(subscribe, getColor);
};
