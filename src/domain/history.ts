/**
 * @file The undo/redo model. A step records only the cells it changed, so memory
 * follows what was drawn rather than grid area times session length.
 */

/**
 * Undoable steps kept. This bounds depth, not memory: an entry is as large as
 * the step it records.
 */
export const MAX_HISTORY_ENTRIES = 100;

export interface CellChange {
    index: number;
    before: string;
    after: string;
}

/** One undoable step: a committed stroke, a flood fill or a clear. */
export type HistoryEntry = readonly CellChange[];

/**
 * The cells that differ between two snapshots of the same grid. Grids of
 * different lengths yield nothing rather than a partial diff with indices past
 * the shorter one; a resize starts a new document, so this is only a backstop.
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

/** Appends a step, dropping the oldest once the cap is reached. */
export const appendEntry = (
    past: readonly HistoryEntry[],
    entry: HistoryEntry
): HistoryEntry[] => [...past, entry].slice(-MAX_HISTORY_ENTRIES);

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
