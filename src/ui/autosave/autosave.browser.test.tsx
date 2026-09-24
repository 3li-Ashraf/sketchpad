/**
 * @file Autosave against a real browser's IndexedDB and BroadcastChannel,
 * where jsdom has an in-memory stand-in and Node's channel.
 */

import { render } from "@testing-library/react";
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    onTestFinished,
} from "vitest";

import { BLANK_CELL_COLOR } from "../../domain/grid";
import { readAutosave, writeAutosave } from "../../io/autosave";
import { openAutosaveChannel } from "../../io/autosaveChannel";
import { workspaceOf } from "../../state/sketchStore";
import {
    deleteAutosaveDatabase,
    readStoredRecord,
} from "../../test/autosaveDatabase";
import { actions, paintStroke, store } from "../../test/storeHelpers";
import { AUTOSAVE_DELAY, clearSavedWorkspace } from "./autosaveSession";
import { restoreAutosave } from "./restoreAutosave";
import { useAutosave } from "./useAutosave";

describe("autosave in a real browser", () => {
    beforeEach(deleteAutosaveDatabase);
    afterEach(deleteAutosaveDatabase);

    const Autosaving = () => {
        useAutosave();
        return null;
    };

    it("brings the whole workspace back after the page is left", async () => {
        render(<Autosaving />);
        actions().setGridSize(8);
        actions().setTool("colorfulPen");
        paintStroke(0, 1, 2);
        actions().undo();
        paintStroke(40);
        const before = workspaceOf(store());

        // Sooner than the usual delay: leaving the page saves at once.
        window.dispatchEvent(new Event("pagehide"));
        await expect
            .poll(readAutosave, {
                timeout: AUTOSAVE_DELAY / 2,
            })
            .toEqual(before);

        actions().setGridSize(16);
        await restoreAutosave();

        expect(workspaceOf(store())).toEqual(before);
    });

    it("takes up what another tab saves, through the browser's own channel", async () => {
        // Drawn and saved before this tab mounts, so it has nothing of its
        // own waiting, which would win instead.
        actions().setGridSize(4);
        paintStroke(5);
        const saved = workspaceOf(store());
        await writeAutosave(saved);
        actions().setGridSize(8);
        render(<Autosaving />);
        const otherTab = openAutosaveChannel(() => {});
        onTestFinished(otherTab.close);

        otherTab.announce("saved");

        await expect.poll(() => workspaceOf(store())).toEqual(saved);
    });

    it("empties real IndexedDB the moment a new sketch starts", async () => {
        render(<Autosaving />);
        paintStroke(0);
        window.dispatchEvent(new Event("pagehide"));
        await expect.poll(readStoredRecord).toBeDefined();

        actions().startNewSketch();
        clearSavedWorkspace();

        await expect
            .poll(readStoredRecord, { timeout: AUTOSAVE_DELAY / 2 })
            .toBeUndefined();
    });

    it("starts over when another tab clears, through the browser's own channel", async () => {
        render(<Autosaving />);
        paintStroke(0);
        window.dispatchEvent(new Event("pagehide"));
        await expect.poll(readStoredRecord).toBeDefined();
        const otherTab = openAutosaveChannel(() => {});
        onTestFinished(otherTab.close);

        otherTab.announce("cleared");

        await expect.poll(() => store().document.undoStack).toEqual([]);
        expect(store().document.colors[0]).toBe(BLANK_CELL_COLOR);
    });
});
