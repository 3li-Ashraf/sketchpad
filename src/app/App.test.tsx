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
import { workspaceOf } from "../state/sketchStore";
import {
    deleteAutosaveDatabase,
    readStoredRecord,
} from "../test/autosaveDatabase";
import { canvasColors, paintStroke, store } from "../test/storeHelpers";
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
    it("renders the title, toolbar and canvas", () => {
        render(<App />);

        expect(
            screen.getByRole("heading", { name: "Sketchpad" })
        ).toBeInTheDocument();
        expect(toolbar()).toBeInTheDocument();
        expect(canvas()).toBeInTheDocument();
    });

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

    it("autosaves what is drawn", async () => {
        await deleteAutosaveDatabase();
        render(<App />);
        paintStroke(0);

        window.dispatchEvent(new Event("pagehide"));

        await waitFor(async () =>
            expect(await readAutosave()).toEqual(workspaceOf(store()))
        );
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

    it("closes when a pointer goes down outside it", async () => {
        render(<App />);

        await userEvent.click(toggle());
        fireEvent.pointerDown(canvas());

        expect(toolbar()).toHaveClass("hidden");
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
            expect.any(Function)
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

    it("leaves other modified keys to the browser", () => {
        render(<App />);
        paintStroke(0);

        const isLeft = fireEvent.keyDown(window, { key: "a", ctrlKey: true });

        expect(isLeft).toBe(true);
        expect(canvasColors()[0]).toBe(DEFAULT_PEN_COLOR);
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
