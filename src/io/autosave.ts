/**
 * @file The autosave: the workspace kept in the browser's IndexedDB between
 * visits, on this device only, as the record `autosaveRecord` defines. Every
 * tab shares the one record; `autosaveChannel` is how they tell each other
 * they have written it.
 *
 * IndexedDB rather than `localStorage`: a full undo history can outgrow the
 * few megabytes `localStorage` allows, and IndexedDB stores structured values
 * without a trip through JSON. Each call opens the database and closes it
 * again, so no connection is held that could block another tab from
 * upgrading it.
 */

import type { Workspace } from "../domain/workspace";
import { createLogger } from "../log/logger";
import { decodeAutosave, encodeAutosave } from "./autosaveRecord";

const log = createLogger("autosave");

const DATABASE_NAME = "sketchpad";
const DATABASE_VERSION = 1;
const STORE_NAME = "autosave";
const KEY = "workspace";

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

/**
 * Makes one change to the store, and resolves once it is committed to disk,
 * or rejects, saying what did not happen.
 */
const commit = (
    change: (store: IDBObjectStore) => void,
    failure: string
): Promise<void> =>
    withDatabase(
        (database) =>
            new Promise<void>((resolve, reject) => {
                const transaction = database.transaction(
                    STORE_NAME,
                    "readwrite"
                );
                change(transaction.objectStore(STORE_NAME));
                transaction.oncomplete = () => resolve();
                transaction.onerror = transaction.onabort = () =>
                    reject(new Error(failure, { cause: transaction.error }));
            })
    );

/** Replaces the saved workspace; resolves once it is committed to disk. */
export const writeAutosave = (workspace: Workspace): Promise<void> => {
    const record = encodeAutosave(workspace);

    return commit(
        (store) => store.put(record, KEY),
        "Autosave was not written"
    );
};

/**
 * Empties the store, so the device keeps nothing of the workspace, and
 * resolves once that is committed to disk.
 */
export const clearAutosave = (): Promise<void> =>
    commit((store) => store.clear(), "Autosave was not cleared");
