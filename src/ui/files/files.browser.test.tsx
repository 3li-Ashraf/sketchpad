/**
 * @file Saving, exporting and dropping in real browsers: the file a download
 * actually writes to disk, and a real drop. jsdom can only record that a
 * download was asked for.
 */

import "../../styles/index.css";

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { commands, userEvent } from "vitest/browser";

import { createBlankGrid } from "../../domain/grid";
import { decodeSketch, encodeSketch } from "../../io/sketchFile";
import { sketchOf } from "../../state/sketchStore";
import { button } from "../../test/queries";
import { actions, paintStroke, store } from "../../test/storeHelpers";
import { Toolbar } from "../toolbar/Toolbar";

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
