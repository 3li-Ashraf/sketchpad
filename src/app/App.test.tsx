/**
 * @file Covers `App`: that the shell renders, that the narrow-screen toolbar
 * opens and dismisses, and that the keyboard shortcuts are bound while it is
 * mounted.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BLANK_CELL_COLOR } from "../domain/grid";
import { DEFAULT_PEN_COLOR } from "../domain/tools";
import { paintStroke, store } from "../test/storeHelpers";
import { App } from "./App";

const toggle = () => screen.getByRole("button", { name: "Settings" });

const toolbar = () => screen.getByRole("complementary", { name: "Settings" });

const canvas = () => screen.getByTestId("canvas-surface");

describe("shell", () => {
    it("renders the title, toolbar and canvas", () => {
        render(<App />);

        expect(screen.getByRole("heading", { name: "Sketchpad" })).toBeInTheDocument();
        expect(toolbar()).toBeInTheDocument();
        expect(canvas()).toBeInTheDocument();
    });

    it("credits the author in the footer", () => {
        render(<App />);

        expect(
            screen.getByRole("link", { name: "Ali Ashraf" })
        ).toHaveAttribute("href", "https://github.com/3li-ashraf");
    });
});

describe("collapsible toolbar", () => {
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

    // Closing an already-closed panel is a no-op, so a leaked listener changes
    // nothing observable in the DOM and these two have to watch the listener
    // itself. Both directions are covered because the effect's cleanup runs on a
    // state change and on unmount, and only the first is reached by closing.
    it("stops listening for outside presses once closed", async () => {
        const remove = vi.spyOn(document, "removeEventListener");
        render(<App />);

        await userEvent.click(toggle());
        await userEvent.click(toggle());

        expect(remove).toHaveBeenCalledWith(
            "pointerdown",
            expect.any(Function)
        );
    });

    it("stops listening when it unmounts while still open", async () => {
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
        expect(store().colors[0]).toBe(BLANK_CELL_COLOR);

        await userEvent.keyboard("{Control>}y{/Control}");
        expect(store().colors[0]).toBe(DEFAULT_PEN_COLOR);
    });

    it("also redoes with Ctrl+Shift+Z", async () => {
        render(<App />);
        paintStroke(0);

        await userEvent.keyboard("{Control>}z{/Control}");
        await userEvent.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");

        expect(store().colors[0]).toBe(DEFAULT_PEN_COLOR);
    });

    it("supports the Meta key for macOS", async () => {
        render(<App />);
        paintStroke(0);

        await userEvent.keyboard("{Meta>}z{/Meta}");

        expect(store().colors[0]).toBe(BLANK_CELL_COLOR);
    });

    it("leaves the canvas alone for an unmodified key", async () => {
        render(<App />);
        paintStroke(0);

        await userEvent.keyboard("z");

        expect(store().colors[0]).toBe(DEFAULT_PEN_COLOR);
    });

    it("leaves other modified keys to the browser", async () => {
        render(<App />);
        paintStroke(0);

        await userEvent.keyboard("{Control>}a{/Control}");

        expect(store().colors[0]).toBe(DEFAULT_PEN_COLOR);
    });

    it("stops listening once the app unmounts", async () => {
        const { unmount } = render(<App />);
        paintStroke(0);

        unmount();
        await userEvent.keyboard("{Control>}z{/Control}");

        expect(store().colors[0]).toBe(DEFAULT_PEN_COLOR);
    });
});
