/**
 * @file One visit to Sketchpad from start to finish, through the whole app in
 * a real browser. Every feature is reached the way a person reaches it, by
 * pointer, keyboard, file picker and reload, and every result is checked
 * where they would see it: in the cells on screen, in the files the browser
 * writes, and in what the device keeps.
 *
 * One test rather than many: each step starts from where the last one left
 * the app, which is the point of it.
 */

import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/press-start-2p/latin-400.css";
import "../styles/index.css";

import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";

import {
    deleteAutosaveDatabase,
    readStoredRecord,
} from "../test/autosaveDatabase";
import { button, findDialog } from "../test/queries";
import { resetSketchStore } from "../test/storeHelpers";
import { restoreAutosave } from "../ui/autosave/restoreAutosave";
import { App } from "./App";

const WHITE = "rgb(255, 255, 255)";
const BLACK = "rgb(0, 0, 0)";
const BLUE = "rgb(62, 166, 255)";

const surface = () => screen.getByRole("img", { name: /^Canvas/ });

/** Every cell's color as the page shows it, row by row. */
const shown = () =>
    Array.from(
        surface().querySelectorAll<HTMLElement>(":scope > * > *"),
        (cell) => cell.style.backgroundColor
    );

const gridSize = () => Math.round(Math.sqrt(shown().length));

const shownAt = (row: number, column: number) =>
    shown()[row * gridSize() + column];

/** The center of a cell, relative to the surface's top-left corner. */
const cellCenter = (row: number, column: number) => {
    const size = gridSize();
    const { width, height } = surface().getBoundingClientRect();

    return {
        x: ((column + 0.5) * width) / size,
        y: ((row + 0.5) * height) / size,
    };
};

const clickCell = (row: number, column: number) =>
    userEvent.click(surface(), { position: cellCenter(row, column) });

const pressKey = async (key: string, times = 1) => {
    for (let press = 0; press < times; press++) {
        await userEvent.keyboard(`{${key}}`);
    }
};

const slider = () => screen.getByRole("slider", { name: "Grid size" });

const bytesOf = (base64: string) =>
    Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

/** The color at the center of each cell of an exported image. */
const cellsOfImage = async (png: Uint8Array<ArrayBuffer>, size: number) => {
    const image = await createImageBitmap(new Blob([png]));
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const cell = image.width / size;

    return Array.from({ length: size * size }, (_, index) => {
        const x = (index % size) * cell + cell / 2;
        const y = Math.floor(index / size) * cell + cell / 2;
        const [red, green, blue] = context.getImageData(x, y, 1, 1).data;

        return `rgb(${red}, ${green}, ${blue})`;
    });
};

beforeEach(async () => {
    await deleteAutosaveDatabase();
    await commands.recordDownloads();
    await page.viewport(1280, 900);
});

afterEach(async () => {
    await deleteAutosaveDatabase();
    await page.viewport(414, 896);
});

it(
    "draws, edits, saves, exports, reopens, comes back and starts over",
    {
        timeout: 60_000,
    },
    async () => {
        // A first visit: nothing saved, so a blank canvas at the default size.
        const firstVisit = render(<App restored={await restoreAutosave()} />);
        expect(surface()).toHaveAccessibleName("Canvas, 32 by 32");
        expect(shown().every((color) => color === WHITE)).toBe(true);

        // Over a blank canvas the grid size changes without a question.
        slider().focus();
        await pressKey("ArrowLeft", 24);
        expect(surface()).toHaveAccessibleName("Canvas, 8 by 8");

        // A drag paints every cell it crosses, as one step.
        await userEvent.dragAndDrop(surface(), surface(), {
            sourcePosition: cellCenter(1, 1),
            targetPosition: cellCenter(1, 6),
        });
        expect(shown().slice(8, 16)).toEqual([
            WHITE,
            BLACK,
            BLACK,
            BLACK,
            BLACK,
            BLACK,
            BLACK,
            WHITE,
        ]);

        // Fill floods the blank cells around the stroke in the chosen color.
        await userEvent.fill(screen.getByLabelText("Color"), "#3ea6ff");
        await userEvent.click(button("Fill"));
        await clickCell(0, 0);
        expect([shownAt(0, 0), shownAt(7, 7), shownAt(1, 1)]).toEqual([
            BLUE,
            BLUE,
            BLACK,
        ]);

        // With left–right symmetry, erasing one cell erases its mirror too.
        await userEvent.click(button("Left–right symmetry"));
        await userEvent.click(button("Eraser"));
        await clickCell(5, 1);
        expect([shownAt(5, 1), shownAt(5, 6), shownAt(5, 2)]).toEqual([
            WHITE,
            WHITE,
            BLUE,
        ]);

        // Undo from the keyboard, redo from the toolbar.
        await userEvent.keyboard("{Control>}z{/Control}");
        expect([shownAt(5, 1), shownAt(5, 6)]).toEqual([BLUE, BLUE]);
        await userEvent.click(button("Redo"));
        expect([shownAt(5, 1), shownAt(5, 6)]).toEqual([WHITE, WHITE]);

        // A quarter turn clockwise: row 1 becomes column 6.
        await userEvent.click(button("Rotate 90° clockwise"));
        expect([1, 2, 3, 4, 5, 6].map((row) => shownAt(row, 6))).toEqual(
            new Array<string>(6).fill(BLACK)
        );
        expect([shownAt(1, 2), shownAt(6, 2)]).toEqual([WHITE, WHITE]);
        const drawing = shown();

        // Saving writes a sketch file; exporting, an image of the same cells.
        await userEvent.click(button("Save sketch"));
        const sketchFile = await commands.takeDownload();
        expect(sketchFile.fileName).toBe("sketch.skpd");

        await userEvent.click(button("Export PNG"));
        const image = await commands.takeDownload();
        expect(image.fileName).toBe("sketch.png");
        expect(await cellsOfImage(bytesOf(image.base64), 8)).toEqual(drawing);

        // Over a drawing the grid size asks first; once unlocked, it changes,
        // and the drawing goes with its history.
        slider().focus();
        await pressKey("ArrowRight");
        await userEvent.click(
            within(await findDialog()).getByRole("button", { name: "Unlock" })
        );
        slider().focus();
        await pressKey("ArrowRight", 8);
        expect(surface()).toHaveAccessibleName("Canvas, 16 by 16");
        expect(shown().every((color) => color === WHITE)).toBe(true);
        expect(button("Undo")).toBeDisabled();

        // Opening the saved file brings the drawing back, at its own size.
        await userEvent.upload(
            screen.getByLabelText("Sketch file"),
            new File([bytesOf(sketchFile.base64)], "sketch.skpd")
        );
        await expect.poll(gridSize).toBe(8);
        expect(shown()).toEqual(drawing);

        // Leaving the page saves it; coming back opens on it, settings and all.
        window.dispatchEvent(new Event("pagehide"));
        await expect.poll(readStoredRecord).toBeDefined();
        firstVisit.unmount();
        resetSketchStore();

        render(<App restored={await restoreAutosave()} />);
        expect(shown()).toEqual(drawing);
        expect(button("Eraser")).toHaveAttribute("aria-pressed", "true");
        expect(button("Left–right symmetry")).toHaveAttribute(
            "aria-pressed",
            "true"
        );

        // A new sketch, once confirmed, blanks the canvas at the same size and
        // leaves nothing on the device.
        await userEvent.click(button("New sketch"));
        await userEvent.click(
            within(await findDialog()).getByRole("button", {
                name: "Start new sketch",
            })
        );
        expect(surface()).toHaveAccessibleName("Canvas, 8 by 8");
        expect(shown().every((color) => color === WHITE)).toBe(true);
        await expect.poll(readStoredRecord).toBeUndefined();
    }
);
