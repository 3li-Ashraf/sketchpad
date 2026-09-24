/**
 * @file The settings panel: that each control reaches the store and shows the
 * state it controls. Grid size and file operations have suites of their own.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { BLANK_CELL_COLOR } from "../../domain/grid";
import { DEFAULT_PEN_COLOR } from "../../domain/tools";
import { button } from "../../test/queries";
import {
    actions,
    canvasColors,
    isCanvasBlank,
    paintStroke,
    store,
} from "../../test/storeHelpers";
import { Toolbar } from "./Toolbar";

const renderToolbar = (isOpen = true) => render(<Toolbar isOpen={isOpen} />);

const panel = () => screen.getByRole("complementary", { name: "Settings" });

describe("visibility", () => {
    it("is hidden on small screens until it is opened", () => {
        renderToolbar(false);

        expect(panel()).toHaveClass("hidden");
    });

    it("is shown once opened", () => {
        renderToolbar(true);

        expect(panel()).toHaveClass("flex");
    });
});

describe("layout", () => {
    // The order is a design decision, explained where the panel lays it out;
    // this keeps any change to it deliberate. Tab visits the controls in the
    // same order.
    it("lays its controls out two to a row, in the chosen order", () => {
        renderToolbar();

        const controls = [
            ...panel().querySelectorAll("button, input[type=color]"),
        ].map((control) => control.getAttribute("aria-label"));

        // prettier-ignore
        expect(controls).toEqual([
            "Pen", "Eraser",
            "Fill", "Color",
            "Colorful pen", "Grid lines",
            "Clear canvas", "New sketch",
            "Top–bottom symmetry", "Left–right symmetry",
            "Rotate 90° clockwise", "Export PNG",
            "Undo", "Redo",
            "Save sketch", "Open sketch",
        ]);
    });
});

describe("tool selection", () => {
    it.each([
        ["Pen", "pen"],
        ["Colorful pen", "colorfulPen"],
        ["Eraser", "eraser"],
        ["Fill", "fill"],
    ])("selects the %s tool", async (label, tool) => {
        renderToolbar();

        await userEvent.click(button(label));

        expect(store().tool).toBe(tool);
        expect(button(label)).toHaveAttribute("aria-pressed", "true");
    });

    it("marks only the active tool as pressed", async () => {
        renderToolbar();

        await userEvent.click(button("Eraser"));

        expect(button("Pen")).toHaveAttribute("aria-pressed", "false");
        expect(button("Fill")).toHaveAttribute("aria-pressed", "false");
    });
});

describe("toggles", () => {
    it("toggles grid lines", async () => {
        renderToolbar();

        expect(button("Grid lines")).toHaveAttribute("aria-pressed", "true");

        await userEvent.click(button("Grid lines"));

        expect(store().showGridLines).toBe(false);
        expect(button("Grid lines")).toHaveAttribute("aria-pressed", "false");
    });

    it("toggles each symmetry independently", async () => {
        renderToolbar();

        await userEvent.click(button("Top–bottom symmetry"));

        expect(store().symmetry).toEqual({ topBottom: true, leftRight: false });
        expect(button("Top–bottom symmetry")).toHaveAttribute(
            "aria-pressed",
            "true"
        );
        expect(button("Left–right symmetry")).toHaveAttribute(
            "aria-pressed",
            "false"
        );

        await userEvent.click(button("Left–right symmetry"));

        expect(store().symmetry).toEqual({ topBottom: true, leftRight: true });
    });
});

describe("color", () => {
    it("writes the picked color into the store, normalized", () => {
        renderToolbar();

        fireEvent.change(
            screen.getByLabelText("Color", { selector: "input" }),
            {
                target: { value: "#3ea6ff" },
            }
        );

        expect(store().penColor).toBe("#3EA6FF");
    });
});

describe("history buttons", () => {
    it("disables undo and redo when there is nothing to step through", () => {
        renderToolbar();

        expect(button("Undo")).toBeDisabled();
        expect(button("Redo")).toBeDisabled();
    });

    it("enables undo after a stroke and steps back and forward through it", async () => {
        renderToolbar();
        paintStroke(0);

        await waitFor(() => expect(button("Undo")).toBeEnabled());
        await userEvent.click(button("Undo"));

        expect(canvasColors()[0]).toBe(BLANK_CELL_COLOR);

        await waitFor(() => expect(button("Redo")).toBeEnabled());
        await userEvent.click(button("Redo"));

        expect(canvasColors()[0]).toBe(DEFAULT_PEN_COLOR);
    });
});

describe("whole-canvas edits", () => {
    it("rotate the drawing a quarter turn clockwise, which Undo turns back", async () => {
        actions().setGridSize(2);
        paintStroke(0);
        renderToolbar();

        await userEvent.click(button("Rotate 90° clockwise"));

        expect(canvasColors()).toEqual([
            BLANK_CELL_COLOR,
            DEFAULT_PEN_COLOR,
            BLANK_CELL_COLOR,
            BLANK_CELL_COLOR,
        ]);

        await userEvent.click(button("Undo"));

        expect(canvasColors()[0]).toBe(DEFAULT_PEN_COLOR);
    });

    it("clear the canvas", async () => {
        renderToolbar();
        paintStroke(0, 1, 2);

        await userEvent.click(button("Clear canvas"));

        expect(isCanvasBlank()).toBe(true);
    });
});
