import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BLANK_CELL_COLOR } from "../../domain/grid";
import { DEFAULT_PEN_COLOR } from "../../domain/tools";
import { readAutosave, writeAutosave } from "../../io/autosave";
import { selectWorkspace } from "../../state/sketchStore";
import {
    deleteAutosaveDatabase,
    writeStoredRecord,
} from "../../test/autosaveDatabase";
import { expectLogged } from "../../test/logCapture";
import { actions, paintStroke, store } from "../../test/storeHelpers";
import {
    AUTOSAVE_DELAY,
    RESTORE_TIMEOUT,
    restoreAutosave,
    useAutosave,
} from "./autosave";

// The real storage, over the in-memory IndexedDB, with its calls counted.
vi.mock("../../io/autosave", { spy: true });

beforeEach(deleteAutosaveDatabase);

const saved = () => readAutosave();

describe("restoreAutosave", () => {
    it("puts back the drawing, its history and the settings", async () => {
        actions().setGridSize(4);
        actions().setTool("eraser");
        actions().toggleSymmetry("leftRight");
        actions().setPenColor("#123456");
        paintStroke(0);
        const before = selectWorkspace(store());
        await writeAutosave(before);
        actions().setGridSize(8);
        actions().setTool("pen");

        await restoreAutosave();

        expect(selectWorkspace(store())).toEqual(before);
        expect(store().document.strokeBaseline).toBeNull();
    });

    it("keeps the restored history working", async () => {
        actions().setGridSize(4);
        actions().setPenColor("#123456");
        paintStroke(0);
        await writeAutosave(selectWorkspace(store()));
        actions().setGridSize(8);

        await restoreAutosave();
        actions().undo();

        expect(store().document.colors[0]).toBe("#FFFFFF");
    });

    it("opens blank when nothing was saved", async () => {
        const before = store().document;

        await restoreAutosave();

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

        await restoreAutosave();

        expectLogged("warn", "autosave", "autosave could not be read");
    });

    it("gives up when storage does not answer in time", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        vi.spyOn(indexedDB, "open").mockReturnValue({} as IDBOpenDBRequest);

        const restoring = restoreAutosave();
        await vi.advanceTimersByTimeAsync(RESTORE_TIMEOUT);
        await restoring;
        vi.useRealTimers();

        expectLogged("warn", "autosave", "autosave could not be read", {
            error: expect.objectContaining<{ message: unknown }>({
                message: expect.stringContaining(`${RESTORE_TIMEOUT} ms`),
            }),
        });
    });
});

describe("useAutosave", () => {
    const Autosaving = () => {
        useAutosave();
        return null;
    };

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const writes = () => vi.mocked(writeAutosave).mock.calls.length;

    it("saves the workspace a moment after a change", async () => {
        render(<Autosaving />);
        paintStroke(0);

        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY - 1);
        expect(writes()).toBe(0);
        await vi.advanceTimersByTimeAsync(1);

        expect(writes()).toBe(1);
        await vi.mocked(writeAutosave).mock.results[0].value;
        expect(await saved()).toEqual(selectWorkspace(store()));
    });

    it("writes once for a burst of changes", async () => {
        render(<Autosaving />);
        paintStroke(0);
        paintStroke(1);
        actions().toggleGridLines();

        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        expect(writes()).toBe(1);
    });

    it("waits for a stroke to be committed", async () => {
        render(<Autosaving />);
        actions().beginStroke();
        actions().paintCells([0, 1]);

        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        expect(writes()).toBe(0);

        actions().endStroke();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        expect(writes()).toBe(1);
    });

    it("holds a save that falls due during a stroke until the stroke ends", async () => {
        render(<Autosaving />);
        paintStroke(0);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY - 1);
        actions().beginStroke();
        actions().paintCells([1]);

        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        expect(writes()).toBe(0);

        actions().endStroke();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        expect(writes()).toBe(1);
        await vi.mocked(writeAutosave).mock.results[0].value;
        expect(await saved()).toEqual(selectWorkspace(store()));
    });

    it("saves the drawing as last committed when the page is left mid-stroke", async () => {
        render(<Autosaving />);
        paintStroke(0);
        actions().beginStroke();
        actions().paintCells([1]);

        window.dispatchEvent(new Event("pagehide"));
        await vi.mocked(writeAutosave).mock.results[0].value;

        const restored = await saved();
        expect(restored?.document.colors.slice(0, 2)).toEqual([
            DEFAULT_PEN_COLOR,
            BLANK_CELL_COLOR,
        ]);
        expect(restored?.document.undoStack).toHaveLength(1);
    });

    it("saves a setting changed during a stroke once the stroke ends", async () => {
        render(<Autosaving />);
        actions().beginStroke();
        actions().setTool("eraser");
        actions().endStroke();

        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        await vi.mocked(writeAutosave).mock.results[0]?.value;

        expect((await saved())?.settings.tool).toBe("eraser");
    });

    it("writes nothing when nothing it keeps has changed", async () => {
        render(<Autosaving />);
        actions().undo();
        actions().setGridSize(store().document.gridSize);
        // A change the workspace leaves out on purpose.
        actions().stopAskingBeforeResize();

        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        expect(writes()).toBe(0);
    });

    it("saves at once when the page is hidden", () => {
        render(<Autosaving />);
        paintStroke(0);

        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        document.dispatchEvent(new Event("visibilitychange"));

        expect(writes()).toBe(1);
    });

    it("waits while the page is merely shown again", () => {
        render(<Autosaving />);
        paintStroke(0);

        document.dispatchEvent(new Event("visibilitychange"));

        expect(writes()).toBe(0);
    });

    it("saves at once when the page is unloaded", () => {
        render(<Autosaving />);
        paintStroke(0);

        window.dispatchEvent(new Event("pagehide"));

        expect(writes()).toBe(1);
    });

    it("saves pending work when it stops", () => {
        const { unmount } = render(<Autosaving />);
        paintStroke(0);

        unmount();

        expect(writes()).toBe(1);
    });

    it("warns once for a run of failed saves, and again after a success", async () => {
        render(<Autosaving />);
        const write = vi.mocked(writeAutosave);
        write.mockRejectedValue(new Error("storage full"));

        paintStroke(0);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        paintStroke(1);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        expectLogged("warn", "autosave", "autosave failed");

        write.mockResolvedValueOnce();
        paintStroke(2);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        paintStroke(3);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        expectLogged("warn", "autosave", "autosave failed");
    });
});
