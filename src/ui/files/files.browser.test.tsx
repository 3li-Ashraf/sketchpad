/**
 * @file Saving, exporting, dropping and autosaving in real browsers: the file
 * a download actually writes to disk, a real drop, and real IndexedDB. jsdom
 * can only record that a download was asked for.
 */

import "../../styles/index.css";

import { render } from "@testing-library/react";
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    onTestFinished,
} from "vitest";
import { commands, userEvent } from "vitest/browser";

import { createBlankGrid } from "../../domain/grid";
import {
    openAutosaveChannel,
    readAutosave,
    writeAutosave,
} from "../../io/autosave";
import { decodeSketch, encodeSketch } from "../../io/sketchFile";
import { sketchOf, workspaceOf } from "../../state/sketchStore";
import { deleteAutosaveDatabase } from "../../test/autosaveDatabase";
import { button } from "../../test/queries";
import { actions, paintStroke, store } from "../../test/storeHelpers";
import { Toolbar } from "../toolbar/Toolbar";
import { AUTOSAVE_DELAY, restoreAutosave, useAutosave } from "./autosave";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const bytesOf = (base64: string) =>
    Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

beforeEach(async () => {
    await commands.recordDownloads();
});

describe("downloads in a real browser", () => {
    it("saves a sketch file that opens as the drawing", async () => {
        actions().setGridSize(8);
        paintStroke(0, 9, 18);
        render(<Toolbar isOpen />);

        await userEvent.click(button("Save sketch"));
        const { fileName, base64 } = await commands.takeDownload();

        expect(fileName).toBe("sketch.skpd");
        expect(await decodeSketch(bytesOf(base64))).toEqual({
            ok: true,
            sketch: sketchOf(store()),
        });
    });

    it("exports a PNG file", async () => {
        actions().setGridSize(4);
        paintStroke(5);
        render(<Toolbar isOpen />);

        await userEvent.click(button("Export PNG"));
        const { fileName, base64 } = await commands.takeDownload();
        const bytes = bytesOf(base64);
        const image = await createImageBitmap(new Blob([bytes]));

        expect(fileName).toBe("sketch.png");
        expect([...bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
        expect([image.width, image.height]).toEqual([200, 200]);
    });
});

describe("dropping a file in a real browser", () => {
    it("opens a sketch dropped on the page, and keeps the page", async () => {
        render(<Toolbar isOpen />);
        const colors = createBlankGrid(4);
        colors[5] = "#3EA6FF";
        const data = new DataTransfer();
        data.items.add(
            new File([await encodeSketch({ gridSize: 4, colors })], "cat.skpd")
        );

        const drop = new DragEvent("drop", {
            dataTransfer: data,
            bubbles: true,
            cancelable: true,
        });
        window.dispatchEvent(drop);

        expect(drop.defaultPrevented).toBe(true);
        await expect.poll(() => store().document.gridSize).toBe(4);
        expect(store().document.colors).toEqual(colors);
    });
});

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

        otherTab.announce();

        await expect.poll(() => workspaceOf(store())).toEqual(saved);
    });
});
