/**
 * @file The undo/redo model. A step records only the cells it changed, so memory
 * follows what was actually drawn rather than grid area times session length.
 * Pure: no DOM, no React, no store.
 */

/**
 * Undoable steps kept. This bounds the depth of the stack, not its memory: an
 * entry is as large as the step it records, so a hundred one-cell taps and a
 * hundred full-canvas clears both sit at the cap while costing very different
 * amounts.
 */
export const MAX_HISTORY_ENTRIES = 100;

export interface CellChange {
    index: number;
    before: string;
    after: string;
}

/**
 * One undoable step. `state/sketchStore` records one per committed stroke, per
 * flood fill and per clear, so a step is not always a stroke.
 */
export type HistoryEntry = readonly CellChange[];

/**
 * The cells that differ between two snapshots of the same grid.
 *
 * Grids of different lengths yield no changes rather than a partial diff: the
 * two sides then belong to different grid sizes, and a partial diff would carry
 * indices past the end of the shorter grid. Normal flow never reaches that
 * branch — `setGridSize` and `loadSketch` both clear the stacks — so it is a
 * backstop rather than a case the app relies on.
 */
export const diffColors = (
    before: readonly string[],
    after: readonly string[]
): CellChange[] => {
    if (before.length !== after.length) return [];

    const changes: CellChange[] = [];

    for (let index = 0; index < after.length; index++) {
        if (before[index] !== after[index]) {
            changes.push({ index, before: before[index], after: after[index] });
        }
    }

    return changes;
};

/**
 * Appends a step, dropping the oldest once the cap is reached.
 *
 * The capped branch trims first and then spreads, rather than the more readable
 * `[...past, entry].slice(-MAX_HISTORY_ENTRIES)`, so the oversized intermediate
 * that form would build and immediately discard is never created.
 */
export const appendEntry = (
    past: readonly HistoryEntry[],
    entry: HistoryEntry
): HistoryEntry[] =>
    past.length < MAX_HISTORY_ENTRIES
        ? [...past, entry]
        : [...past.slice(past.length - MAX_HISTORY_ENTRIES + 1), entry];

const applyEntry = (
    colors: readonly string[],
    entry: HistoryEntry,
    side: "before" | "after"
): string[] => {
    const next = colors.slice();

    for (const change of entry) {
        next[change.index] = change[side];
    }

    return next;
};

/** Steps backwards over an entry, restoring the colors its cells had before. */
export const revertEntry = (
    colors: readonly string[],
    entry: HistoryEntry
): string[] => applyEntry(colors, entry, "before");

/** Steps forwards over an entry, re-applying the colors it painted. */
export const reapplyEntry = (
    colors: readonly string[],
    entry: HistoryEntry
): string[] => applyEntry(colors, entry, "after");
