/**
 * @file The autosave database reached directly, as another version of the app
 * would reach it. The names are spelled out rather than imported: users' work
 * is saved under them, so renaming one in `io/autosave` would strand it, and
 * these helpers would stop finding it.
 */

const DATABASE_NAME = "sketchpad";
const STORE_NAME = "autosave";
const KEY = "workspace";

const settle = <T>(request: IDBRequest<T>): Promise<T> =>
    new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error());
    });

const openStore = async (mode: IDBTransactionMode) => {
    const opening = indexedDB.open(DATABASE_NAME, 1);
    opening.onupgradeneeded = () =>
        opening.result.createObjectStore(STORE_NAME);
    const database = await settle(opening);

    return {
        store: database.transaction(STORE_NAME, mode).objectStore(STORE_NAME),
        close: () => database.close(),
    };
};

/** Deletes everything saved, so a test starts from a first visit. */
export const deleteAutosaveDatabase = (): Promise<void> =>
    settle(indexedDB.deleteDatabase(DATABASE_NAME)).then(() => undefined);

/** The record as stored, before the app checks any of it. */
export const readStoredRecord = async (): Promise<unknown> => {
    const { store, close } = await openStore("readonly");

    try {
        return await settle<unknown>(store.get(KEY));
    } finally {
        close();
    }
};

/** Stores any value where the app looks for its record. */
export const writeStoredRecord = async (value: unknown): Promise<void> => {
    const { store, close } = await openStore("readwrite");

    try {
        await settle(store.put(value, KEY));
    } finally {
        close();
    }
};
