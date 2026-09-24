import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BLANK_CELL_COLOR, createBlankGrid, NO_SYMMETRY } from "../domain/grid";
import { DEFAULT_PEN_COLOR } from "../domain/tools";
import type { Workspace } from "../domain/workspace";
import { readAutosave } from "../io/autosave";
import {
    deleteAutosaveDatabase,
    readStoredRecord,
} from "../test/autosaveDatabase";
import {
    actions,
    canvasColors,
    paintStroke,
    store,
} from "../test/storeHelpers";
import { AUTOSAVE_DELAY } from "../ui/autosave/autosaveSession";
import type { Restored } from "../ui/autosave/restoreAutosave";
import { App } from "./App";

const toggle = () => screen.getByRole("button", { name: "Settings" });

const toolbar = () => screen.getByRole("complementary", { name: "Settings" });

const canvas = () => screen.getByRole("img", { name: /^Canvas/ });

/** Presses the grid size slider over a drawing, which opens the resize dialog. */
const openResizeDialog = () => {
    paintStroke(0);
    fireEvent.pointerDown(screen.getByRole("slider", { name: "Grid size" }), {
        button: 0,
    });
};

describe("shell", () => {
    it("clears the device the moment New sketch is confirmed", async () => {
        await deleteAutosaveDatabase();
        render(<App />);
        paintStroke(0);
        window.dispatchEvent(new Event("pagehide"));
        await waitFor(async () =>
            expect((await readAutosave())?.document.undoStack).toHaveLength(1)
        );

        await userEvent.click(
            screen.getByRole("button", { name: "New sketch" })
        );
        await userEvent.click(
            screen.getByRole("button", { name: "Start new sketch" })
        );

        // No page hidden and no autosave delay waited out: the store is
        // emptied at once, and stays empty until something changes.
        await waitFor(async () =>
            expect(await readStoredRecord()).toBeUndefined()
        );
        await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DELAY));
        expect(await readStoredRecord()).toBeUndefined();
    });
});

describe("collapsible toolbar", () => {
    it("is controlled by the settings button", () => {
        render(<App />);

        expect(toolbar().id).not.toBe("");
        expect(toggle()).toHaveAttribute("aria-controls", toolbar().id);
    });

    it("starts collapsed on small screens", () => {
        render(<App />);

        expect(toggle()).toHaveAttribute("aria-expanded", "false");
        expect(toolbar()).toHaveClass("hidden");
    });

    it("opens when the settings button is pressed", async () => {
        render(<App />);

        await userEvent.click(toggle());

        expect(toggle()).toHaveAttribute("aria-expanded", "true");
        expect(toolbar()).toHaveClass("flex");
    });

    it("closes again on a second press", async () => {
        render(<App />);

        await userEvent.click(toggle());
        await userEvent.click(toggle());

        expect(toggle()).toHaveAttribute("aria-expanded", "false");
    });

    describe("closed by a press on the canvas", () => {
        /** A size for the canvas, which jsdom never lays out, so it can paint. */
        const layOutCanvas = () =>
            vi.spyOn(canvas(), "getBoundingClientRect").mockReturnValue({
                x: 0,
                y: 0,
                top: 0,
                left: 0,
                right: 320,
                bottom: 320,
                width: 320,
                height: 320,
                toJSON: () => ({}),
            });

        const pressCanvas = () => {
            fireEvent.pointerDown(canvas(), {
                pointerId: 1,
                button: 0,
                clientX: 5,
                clientY: 5,
            });
            fireEvent.pointerUp(window, { pointerId: 1 });
        };

        it("only closes, drawing nothing", async () => {
            render(<App />);
            layOutCanvas();
            await userEvent.click(toggle());

            pressCanvas();

            expect(toolbar()).toHaveClass("hidden");
            expect(canvasColors()[0]).toBe(BLANK_CELL_COLOR);
            expect(store().document.undoStack).toEqual([]);
        });

        it("draws as usual at the next press", async () => {
            render(<App />);
            layOutCanvas();
            await userEvent.click(toggle());
            pressCanvas();

            pressCanvas();

            expect(canvasColors()[0]).toBe(DEFAULT_PEN_COLOR);
        });

        it("draws at once where the panel is no popover, having been left open", async () => {
            // Opened on a narrow screen that then widened past `md`, where
            // the toggle is hidden and the panel always shown.
            render(<App />);
            layOutCanvas();
            await userEvent.click(toggle());
            toggle().style.display = "none";

            pressCanvas();

            expect(canvasColors()[0]).toBe(DEFAULT_PEN_COLOR);
        });
    });

    it("stays open when a pointer goes down inside it", async () => {
        render(<App />);

        await userEvent.click(toggle());
        fireEvent.pointerDown(screen.getByRole("button", { name: "Pen" }));

        expect(toolbar()).toHaveClass("flex");
    });

    it("stays open when a pointer goes down inside a dialog it opened", async () => {
        // The dialog is portalled out of the toolbar, so this is the press the
        // outside-press check would otherwise mistake for one outside it.
        render(<App />);

        await userEvent.click(toggle());
        openResizeDialog();
        fireEvent.pointerDown(screen.getByRole("button", { name: "Cancel" }));

        expect(toolbar()).toHaveClass("flex");
    });

    // A leaked listener would only close a panel that is already gone, so
    // nothing in the DOM shows it; the listener itself has to be watched.
    it("stops listening for outside presses when it unmounts", async () => {
        const remove = vi.spyOn(document, "removeEventListener");
        const { unmount } = render(<App />);

        await userEvent.click(toggle());
        remove.mockClear();
        unmount();

        expect(remove).toHaveBeenCalledWith(
            "pointerdown",
            expect.any(Function),
            true
        );
    });
});

describe("keyboard shortcuts", () => {
    it("undoes with Ctrl+Z and redoes with Ctrl+Y", async () => {
        render(<App />);
        paintStroke(0);

        await userEvent.keyboard("{Control>}z{/Control}");
        expect(canvasColors()[0]).toBe(BLANK_CELL_COLOR);

        await userEvent.keyboard("{Control>}y{/Control}");
        expect(canvasColors()[0]).toBe(DEFAULT_PEN_COLOR);
    });

    it("also redoes with Ctrl+Shift+Z", async () => {
        render(<App />);
        paintStroke(0);

        await userEvent.keyboard("{Control>}z{/Control}");
        await userEvent.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");

        expect(canvasColors()[0]).toBe(DEFAULT_PEN_COLOR);
    });

    it("supports the Meta key for macOS", async () => {
        render(<App />);
        paintStroke(0);

        await userEvent.keyboard("{Meta>}z{/Meta}");

        expect(canvasColors()[0]).toBe(BLANK_CELL_COLOR);
    });

    it("leaves the canvas alone for an unmodified key", async () => {
        render(<App />);
        paintStroke(0);

        await userEvent.keyboard("z");

        expect(canvasColors()[0]).toBe(DEFAULT_PEN_COLOR);
    });

    it("keeps its shortcuts from the browser, which would undo on its own", () => {
        render(<App />);

        for (const key of ["z", "y", "Z"]) {
            expect(fireEvent.keyDown(window, { key, ctrlKey: true })).toBe(
                false
            );
        }
    });

    // A layout without Latin letters types its own on the Z and Y keys, so
    // those are found by where they sit. `code` names the key, not the letter.
    it.each([
        ["Russian", "я", "н"],
        ["Greek", "ζ", "υ"],
        ["Hebrew", "ז", "ט"],
    ])(
        "undoes and redoes by the keys' places on a %s layout",
        (_, zLetter, yLetter) => {
            render(<App />);
            paintStroke(0);

            fireEvent.keyDown(window, {
                key: zLetter,
                code: "KeyZ",
                ctrlKey: true,
            });
            expect(canvasColors()[0]).toBe(BLANK_CELL_COLOR);

            fireEvent.keyDown(window, {
                key: yLetter,
                code: "KeyY",
                ctrlKey: true,
            });
            expect(canvasColors()[0]).toBe(DEFAULT_PEN_COLOR);
        }
    );

    it("goes by the letter where a layout has Latin letters in other places", () => {
        // German QWERTZ: the key labelled Z is where US QWERTY has its Y.
        render(<App />);
        paintStroke(0);

        fireEvent.keyDown(window, { key: "z", code: "KeyY", ctrlKey: true });

        expect(canvasColors()[0]).toBe(BLANK_CELL_COLOR);
    });

    it("goes by the key's place when it types no letter, as a dead key", () => {
        render(<App />);
        paintStroke(0);

        fireEvent.keyDown(window, { key: "Dead", code: "KeyZ", ctrlKey: true });

        expect(canvasColors()[0]).toBe(BLANK_CELL_COLOR);
    });

    it.each([
        ["Ctrl+A", { key: "a" }],
        ["Ctrl+Shift+A", { key: "A", shiftKey: true }],
    ])("leaves %s to the browser", (_, keys) => {
        render(<App />);
        paintStroke(0);
        actions().undo();

        const isLeft = fireEvent.keyDown(window, { ...keys, ctrlKey: true });

        expect(isLeft).toBe(true);
        expect(canvasColors()[0]).toBe(BLANK_CELL_COLOR);
    });

    it("undoes nothing while a dialog is open", async () => {
        render(<App />);
        openResizeDialog();

        await userEvent.keyboard("{Control>}z{/Control}");

        expect(canvasColors()[0]).toBe(DEFAULT_PEN_COLOR);
    });

    it("stops listening once the app unmounts", async () => {
        const { unmount } = render(<App />);
        paintStroke(0);

        unmount();
        await userEvent.keyboard("{Control>}z{/Control}");

        expect(canvasColors()[0]).toBe(DEFAULT_PEN_COLOR);
    });
});

describe("autosave", () => {
    it("asks over the app when a drawing saved earlier turns up after drawing began", async () => {
        let answer!: (workspace: Workspace | null) => void;
        const restored: Restored = {
            isKnown: false,
            answer: new Promise((resolve) => (answer = resolve)),
        };
        render(<App restored={restored} />);
        paintStroke(0);

        await act(async () => {
            answer({
                document: {
                    gridSize: 2,
                    colors: ["#123456", ...createBlankGrid(2).slice(1)],
                    undoStack: [],
                    redoStack: [],
                },
                settings: {
                    tool: "pen",
                    penColor: DEFAULT_PEN_COLOR,
                    symmetry: NO_SYMMETRY,
                    showGridLines: true,
                },
            });
            await restored.answer;
        });

        expect(
            screen.getByRole("alertdialog", {
                name: "Restore your saved drawing?",
            })
        ).toBeInTheDocument();
    });
});
