/**
 * @file The autosave against the in-memory IndexedDB: what it writes, reads
 * back and clears, and how it fails. The record itself is `autosaveRecord.test`.
 */

import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    deleteAutosaveDatabase,
    readStoredRecord,
    writeStoredRecord,
} from "../test/autosaveDatabase";
import { expectLogged } from "../test/logCapture";
import { smallWorkspace as workspace } from "../test/sketchFixtures";
import { clearAutosave, readAutosave, writeAutosave } from "./autosave";
import { AUTOSAVE_VERSION, decodeAutosave } from "./autosaveRecord";

beforeEach(deleteAutosaveDatabase);

describe("autosave storage", () => {
    it("holds nothing until something is written", async () => {
        expect(await readAutosave()).toBeNull();
    });

    it("reads back the workspace it wrote", async () => {
        await writeAutosave(workspace());

        expect(await readAutosave()).toEqual(workspace());
    });

    it("keeps only the latest workspace", async () => {
        const later = workspace();
        later.settings = { ...later.settings, tool: "fill" };

        await writeAutosave(workspace());
        await writeAutosave(later);

        expect(await readAutosave()).toEqual(later);
    });

    it("keeps the record where earlier versions look for it", async () => {
        await writeAutosave(workspace());

        expect(decodeAutosave(await readStoredRecord())).toEqual(workspace());
    });

    it("ignores, and warns about, a record this version cannot use", async () => {
        await writeStoredRecord({ version: AUTOSAVE_VERSION + 1 });

        expect(await readAutosave()).toBeNull();
        expectLogged(
            "warn",
            "autosave",
            "autosave ignored: not a workspace this version can use"
        );
    });

    it("rejects, rather than throws, when the browser has no IndexedDB", async () => {
        vi.stubGlobal("indexedDB", undefined);

        await expect(readAutosave()).rejects.toThrow();
        await expect(writeAutosave(workspace())).rejects.toThrow();
    });

    it("rejects when the database cannot be opened", async () => {
        const failed = new DOMException("Denied", "SecurityError");
        vi.spyOn(indexedDB, "open").mockImplementation(() => {
            const request = { error: failed } as unknown as IDBOpenDBRequest;
            queueMicrotask(() => {
                request.onerror?.(new Event("error"));
            });
            return request;
        });

        await expect(readAutosave()).rejects.toMatchObject({
            message: "IndexedDB request failed",
            cause: failed,
        });
    });

    it("clears the store, leaving nothing to read", async () => {
        await writeAutosave(workspace());

        await clearAutosave();

        expect(await readStoredRecord()).toBeUndefined();
        expect(await readAutosave()).toBeNull();
    });

    it("rejects when the browser aborts the clear", async () => {
        vi.spyOn(IDBObjectStore.prototype, "clear").mockImplementation(
            function (this: IDBObjectStore) {
                this.transaction.abort();
                return {} as IDBRequest<undefined>;
            }
        );

        await expect(clearAutosave()).rejects.toThrow(
            "Autosave was not cleared"
        );
    });

    it("rejects when the browser aborts the write", async () => {
        vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
            this: IDBObjectStore
        ) {
            this.transaction.abort();
            return {} as IDBRequest<IDBValidKey>;
        });

        await expect(writeAutosave(workspace())).rejects.toThrow(
            "Autosave was not written"
        );
    });
});
