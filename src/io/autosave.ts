/**
 * @file The autosave: the workspace kept in the browser's IndexedDB between
 * visits, on this device only, and the only definition of the record it is
 * kept as. Every tab shares the one record, so each tells the others over a
 * `BroadcastChannel` when it has written it.
 *
 * IndexedDB rather than `localStorage`: a full undo history can outgrow the
 * few megabytes `localStorage` allows, and IndexedDB stores structured values
 * without a trip through JSON. Each call opens the database and closes it
 * again, so no connection is held that could block another tab from
 * upgrading it.
 *
 * The record keeps each undo step as three typed arrays rather than an object
 * per cell. A full history is 100 steps of up to 4096 cells, and the browser
 * copies that many objects into storage on the main thread, in 120 to 330 ms
 * at every save; typed arrays copy in a few. A step never changes once
 * recorded, so each is converted once.
 */

import {
    hexToNumber,
    isColorNumber,
    isHexColor,
    numberToHex,
} from "../domain/color";
import { isCellIndex, isValidSketch, type Symmetry } from "../domain/grid";
import {
    type CellChange,
    type HistoryEntry,
    MAX_HISTORY_ENTRIES,
} from "../domain/history";
import { isDrawingTool } from "../domain/tools";
import type { Workspace } from "../domain/workspace";
import { createLogger } from "../log/logger";

const log = createLogger("autosave");

const DATABASE_NAME = "sketchpad";
const DATABASE_VERSION = 1;
const STORE_NAME = "autosave";
const KEY = "workspace";

/** Bumped when the record's shape changes, so an older one is not misread. */
export const AUTOSAVE_VERSION = 1;

/**
 * One undo step: the cells it changed, and their colors before and after as
 * `0xRRGGBB`. Sixteen bits reach every cell of a 64×64 grid.
 */
interface StoredStep {
    cells: Uint16Array;
    before: Uint32Array;
    after: Uint32Array;
}

export interface AutosaveRecord {
    version: typeof AUTOSAVE_VERSION;
    document: {
        gridSize: number;
        colors: readonly string[];
        undoStack: StoredStep[];
        redoStack: StoredStep[];
    };
    settings: Workspace["settings"];
}

// Keyed by the step itself, which is never edited, so a save converts only
// the steps recorded since the last one.
const storedSteps = new WeakMap<HistoryEntry, StoredStep>();

const storeStep = (step: HistoryEntry): StoredStep => {
    let stored = storedSteps.get(step);

    if (!stored) {
        stored = {
            cells: Uint16Array.from(step, (change) => change.index),
            before: Uint32Array.from(step, (change) =>
                hexToNumber(change.before)
            ),
            after: Uint32Array.from(step, (change) =>
                hexToNumber(change.after)
            ),
        };
        storedSteps.set(step, stored);
    }

    return stored;
};

export const encodeAutosave = ({
    document,
    settings,
}: Workspace): AutosaveRecord => ({
    version: AUTOSAVE_VERSION,
    document: {
        gridSize: document.gridSize,
        colors: document.colors,
        undoStack: document.undoStack.map(storeStep),
        redoStack: document.redoStack.map(storeStep),
    },
    settings,
});

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
    typeof value === "object" && value !== null;

// By tag rather than `instanceof`, which is false for an array made in
// another realm, as a test environment's structured clone can make it.
const hasTag = (value: unknown, tag: string): boolean =>
    ArrayBuffer.isView(value) &&
    Object.prototype.toString.call(value) === `[object ${tag}]`;

const isUint16Array = (value: unknown): value is Uint16Array =>
    hasTag(value, "Uint16Array");

const isUint32Array = (value: unknown): value is Uint32Array =>
    hasTag(value, "Uint32Array");

/** Names each number once, since a step holds few colors across many cells. */
const colorNamer = () => {
    const names = new Map<number, string>();

    return (value: number): string => {
        let name = names.get(value);
        if (name === undefined) {
            name = numberToHex(value);
            names.set(value, name);
        }

        return name;
    };
};

const loadStep = (
    value: unknown,
    cellCount: number,
    colorOf: (value: number) => string
): HistoryEntry | null => {
    if (!isRecord(value)) return null;

    const { cells, before, after } = value;
    if (
        !isUint16Array(cells) ||
        !isUint32Array(before) ||
        !isUint32Array(after) ||
        cells.length === 0 ||
        before.length !== cells.length ||
        after.length !== cells.length
    ) {
        return null;
    }

    const step: CellChange[] = [];
    for (let at = 0; at < cells.length; at++) {
        if (
            !isCellIndex(cells[at], cellCount) ||
            !isColorNumber(before[at]) ||
            !isColorNumber(after[at])
        ) {
            return null;
        }

        step.push({
            index: cells[at],
            before: colorOf(before[at]),
            after: colorOf(after[at]),
        });
    }

    // The next save stores the arrays just read rather than convert again.
    storedSteps.set(step, { cells, before, after });

    return step;
};

const loadHistory = (
    value: unknown,
    cellCount: number,
    colorOf: (value: number) => string
): HistoryEntry[] | null => {
    if (!Array.isArray(value) || value.length > MAX_HISTORY_ENTRIES) {
        return null;
    }

    const steps: HistoryEntry[] = [];
    for (const item of value) {
        const step = loadStep(item, cellCount, colorOf);
        if (!step) return null;

        steps.push(step);
    }

    return steps;
};

const loadSymmetry = (value: unknown): Symmetry | null =>
    isRecord(value) &&
    typeof value.topBottom === "boolean" &&
    typeof value.leftRight === "boolean"
        ? { topBottom: value.topBottom, leftRight: value.leftRight }
        : null;

/**
 * The workspace in a record read back from storage, rebuilt from its checked
 * parts, or null if any part is missing or wrong. A record could have been
 * written by another version, damaged, or put there by other code, so nothing
 * unchecked survives.
 */
export const decodeAutosave = (value: unknown): Workspace | null => {
    if (!isRecord(value) || value.version !== AUTOSAVE_VERSION) return null;
    const { document, settings } = value;
    if (!isRecord(document) || !isRecord(settings)) return null;

    const { gridSize, colors } = document;
    if (typeof gridSize !== "number" || !Array.isArray(colors)) return null;

    const sketch = { gridSize, colors: colors as unknown[] as string[] };
    if (!isValidSketch(sketch)) return null;

    const cellCount = gridSize * gridSize;
    const colorOf = colorNamer();
    const undoStack = loadHistory(document.undoStack, cellCount, colorOf);
    const redoStack = loadHistory(document.redoStack, cellCount, colorOf);
    const symmetry = loadSymmetry(settings.symmetry);
    const { tool, penColor, showGridLines } = settings;

    if (
        !undoStack ||
        !redoStack ||
        !symmetry ||
        !isDrawingTool(tool) ||
        !isHexColor(penColor) ||
        typeof showGridLines !== "boolean"
    ) {
        return null;
    }

    return {
        document: {
            gridSize,
            colors: [...sketch.colors],
            undoStack,
            redoStack,
        },
        settings: { tool, penColor, symmetry, showGridLines },
    };
};

const settle = <T>(request: IDBRequest<T>): Promise<T> =>
    new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
            reject(
                new Error("IndexedDB request failed", { cause: request.error })
            );
    });

const openDatabase = (): Promise<IDBDatabase> => {
    const opening = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    opening.onupgradeneeded = () =>
        opening.result.createObjectStore(STORE_NAME);

    return settle(opening);
};

const withDatabase = async <T>(
    task: (database: IDBDatabase) => Promise<T>
): Promise<T> => {
    const database = await openDatabase();

    try {
        return await task(database);
    } finally {
        database.close();
    }
};

/**
 * The workspace an earlier visit saved, or null when there is none this
 * version can use. Rejects when storage itself fails.
 */
export const readAutosave = async (): Promise<Workspace | null> => {
    const record = await withDatabase((database) =>
        settle<unknown>(
            database
                .transaction(STORE_NAME, "readonly")
                .objectStore(STORE_NAME)
                .get(KEY)
        )
    );
    if (record === undefined) return null;

    const workspace = decodeAutosave(record);
    if (!workspace) {
        log.warn("autosave ignored: not a workspace this version can use");
    }

    return workspace;
};

const CHANNEL_NAME = "sketchpad-autosave";

/** How a tab tells the others it has saved, and hears when they have. */
export interface AutosaveChannel {
    /** Tells every other tab a save has been written. */
    announce: () => void;
    close: () => void;
}

/**
 * Opens this tab's line to the others: `onSavedElsewhere` hears each save
 * another tab announces, never one this channel announced itself. With no
 * `BroadcastChannel`, nothing is heard and announcing does nothing, as with a
 * single tab.
 */
export const openAutosaveChannel = (
    onSavedElsewhere: () => void
): AutosaveChannel => {
    if (typeof BroadcastChannel === "undefined") {
        return { announce: () => {}, close: () => {} };
    }

    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = onSavedElsewhere;

    return {
        announce: () => channel.postMessage("saved"),
        close: () => channel.close(),
    };
};

/** Replaces the saved workspace; resolves once it is committed to disk. */
export const writeAutosave = (workspace: Workspace): Promise<void> => {
    const record = encodeAutosave(workspace);

    return withDatabase(
        (database) =>
            new Promise<void>((resolve, reject) => {
                const transaction = database.transaction(
                    STORE_NAME,
                    "readwrite"
                );
                transaction.objectStore(STORE_NAME).put(record, KEY);
                transaction.oncomplete = () => resolve();
                transaction.onerror = transaction.onabort = () =>
                    reject(
                        new Error("Autosave was not written", {
                            cause: transaction.error,
                        })
                    );
            })
    );
};
