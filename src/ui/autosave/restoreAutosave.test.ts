/**
 * @file Opening against the in-memory IndexedDB: what is put back, and what
 * is handed on to autosave when storage fails or answers late.
 */

import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Workspace } from "../../domain/workspace";
import { readAutosave, writeAutosave } from "../../io/autosave";
import { workspaceOf } from "../../state/sketchStore";
import {
    deleteAutosaveDatabase,
    writeStoredRecord,
} from "../../test/autosaveDatabase";
import { expectLogged } from "../../test/logCapture";
import { actions, paintStroke, store } from "../../test/storeHelpers";
import { RESTORE_TIMEOUT, restoreAutosave } from "./restoreAutosave";

// The real storage, with its calls counted.
vi.mock("../../io/autosave", { spy: true });

beforeEach(async () => {
    // `restoreMocks` clears the calls of a module's spies but keeps what a
    // test told them to return, so each starts again from the real one.
    vi.mocked(readAutosave).mockReset();
    vi.mocked(writeAutosave).mockReset();

    await deleteAutosaveDatabase();
});

/** The last read of the device that autosave began. */
const lastRead = () =>
    vi.mocked(readAutosave).mock.results.at(-1)!
        .value as Promise<Workspace | null>;

describe("restoreAutosave", () => {
    it("puts back the drawing, its history and the settings", async () => {
        actions().setGridSize(4);
        actions().setTool("eraser");
        actions().toggleSymmetry("leftRight");
        actions().setPenColor("#123456");
        paintStroke(0);
        const before = workspaceOf(store());
        await writeAutosave(before);
        actions().setGridSize(8);
        actions().setTool("pen");

        expect(await restoreAutosave()).toEqual({
            isKnown: true,
            answer: null,
        });

        expect(workspaceOf(store())).toEqual(before);
        expect(store().document.strokeBaseline).toBeNull();
    });

    it("keeps the restored history working", async () => {
        actions().setGridSize(4);
        actions().setPenColor("#123456");
        paintStroke(0);
        await writeAutosave(workspaceOf(store()));
        actions().setGridSize(8);

        await restoreAutosave();
        actions().undo();

        expect(store().document.colors[0]).toBe("#FFFFFF");
    });

    it("opens blank when nothing was saved, knowing there is nothing", async () => {
        const before = store().document;

        expect(await restoreAutosave()).toEqual({
            isKnown: true,
            answer: null,
        });

        expect(store().document).toBe(before);
    });

    it("ignores, and warns about, a record this version cannot use", async () => {
        await writeStoredRecord({ version: 99 });
        const before = store().document;

        await restoreAutosave();

        expect(store().document).toBe(before);
        expectLogged(
            "warn",
            "autosave",
            "autosave ignored: not a workspace this version can use"
        );
    });

    it("opens blank, and warns, when storage cannot be read", async () => {
        vi.stubGlobal("indexedDB", undefined);

        // Not knowing what the device holds, autosave must look first.
        expect(await restoreAutosave()).toEqual({
            isKnown: false,
            answer: null,
        });

        expectLogged("warn", "autosave", "autosave could not be read");
    });

    it("leaves no timer running once storage has answered", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        vi.mocked(readAutosave).mockResolvedValueOnce(null);

        await restoreAutosave();
        const timers = vi.getTimerCount();
        vi.useRealTimers();

        expect(timers).toBe(0);
    });

    it("gives up when storage does not answer in time, handing on the read", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        vi.spyOn(indexedDB, "open").mockReturnValue({} as IDBOpenDBRequest);

        const restoring = restoreAutosave();
        await vi.advanceTimersByTimeAsync(RESTORE_TIMEOUT);
        const restored = await restoring;
        vi.useRealTimers();

        // The very read that was late, which may still answer.
        expect(restored.isKnown).toBe(false);
        expect(restored.answer).toBe(lastRead());
        expectLogged("warn", "autosave", "autosave could not be read", {
            error: expect.objectContaining<{ message: unknown }>({
                message: expect.stringContaining(`${RESTORE_TIMEOUT} ms`),
            }),
        });
    });
});
