/**
 * @file The grid size control: resizing freely over a blank grid, and asking
 * before anything moves once a resize would erase a drawing.
 */

import {
    createEvent,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MAX_GRID_SIZE, MIN_GRID_SIZE } from "../../domain/grid";
import { selectCanUndo } from "../../state/sketchStore";
import {
    button,
    dontAskAgain,
    expectNoDialog,
    findDialog,
} from "../../test/queries";
import {
    actions,
    canvasColors,
    isCanvasBlank,
    paintStroke,
    store,
} from "../../test/storeHelpers";
import { GridSizeControl } from "./GridSizeControl";
import { RESIZE_DIALOG_TITLE, RESIZE_WARNING } from "./useGridResize";

const renderControl = () => render(<GridSizeControl />);

describe("grid size", () => {
    const slider = () => screen.getByRole("slider", { name: "Grid size" });

    /** Steps of a drag, each reported by the browser as an `input` event. */
    const drag = (...sizes: number[]) => {
        for (const size of sizes) {
            fireEvent.input(slider(), { target: { value: String(size) } });
        }
    };

    /**
     * A primary-button press, returned so its default can be inspected. It is
     * fired at the input and bubbles to the track around it, which is where a
     * real press lands while the input ignores the pointer.
     */
    const press = () => {
        const event = createEvent.pointerDown(slider(), { button: 0 });
        fireEvent(slider(), event);

        return event;
    };

    const pressKey = (key: string) => {
        const event = createEvent.keyDown(slider(), { key });
        fireEvent(slider(), event);

        return event;
    };

    it("exposes the supported range and the current size", () => {
        renderControl();

        expect(slider()).toHaveAttribute("min", String(MIN_GRID_SIZE));
        expect(slider()).toHaveAttribute("max", String(MAX_GRID_SIZE));
        expect(slider()).toHaveValue(String(store().document.gridSize));
    });

    it("shows the current grid size as a square", () => {
        renderControl();

        expect(screen.getByText("32 × 32")).toBeInTheDocument();
    });

    it("resizes the canvas and updates the label", () => {
        renderControl();

        fireEvent.change(slider(), { target: { value: "8" } });

        expect(store().document.gridSize).toBe(8);
        expect(screen.getByText("8 × 8")).toBeInTheDocument();
    });

    it("leaves a blank grid's slider to the pointer, and resizes it live", () => {
        renderControl();

        expect(slider()).not.toHaveClass("pointer-events-none");
        expect(press().defaultPrevented).toBe(false);

        drag(20, 8);

        expect(store().document.gridSize).toBe(8);
        expect(screen.getByText("8 × 8")).toBeInTheDocument();
        expectNoDialog();
    });

    it("leaves a blank grid's keys to the browser", () => {
        renderControl();

        expect(pressKey("ArrowRight").defaultPrevented).toBe(false);
        expectNoDialog();
    });

    describe("over a drawing", () => {
        it("takes the slider out of the pointer's reach", async () => {
            renderControl();
            paintStroke(0);

            await waitFor(() =>
                expect(slider()).toHaveClass("pointer-events-none")
            );
        });

        it("asks as soon as the slider is pressed, before anything moves", async () => {
            renderControl();
            paintStroke(0);
            const before = canvasColors();

            const event = press();

            const dialog = await findDialog();
            expect(dialog).toHaveAccessibleName(RESIZE_DIALOG_TITLE);
            expect(dialog).toHaveAccessibleDescription(RESIZE_WARNING);
            expect(button("Unlock")).toBeInTheDocument();
            expect(event.defaultPrevented).toBe(true);
            expect(slider()).toHaveValue("32");
            expect(canvasColors()).toBe(before);
        });

        it("puts focus on the slider, where closing the dialog hands it back", () => {
            renderControl();
            paintStroke(0);
            const focus = vi.spyOn(slider(), "focus");

            press();

            expect(focus).toHaveBeenCalledOnce();
        });

        it("ignores a press with any button but the primary one", () => {
            renderControl();
            paintStroke(0);

            fireEvent.pointerDown(slider(), { button: 2 });

            expectNoDialog();
        });

        it("drops a step that reaches it while locked", () => {
            // A drag begun on a blank grid can go on under the pointer while
            // a second finger paints.
            renderControl();
            paintStroke(0);

            drag(8);

            expect(store().document.gridSize).toBe(32);
            expect(slider()).toHaveValue("32");
        });

        it("keeps the drawing and stays locked when cancelled", async () => {
            renderControl();
            paintStroke(0);
            const before = canvasColors();

            press();
            await userEvent.click(button("Cancel"));

            expect(canvasColors()).toBe(before);
            expectNoDialog();

            press();

            expect(await findDialog()).toHaveAccessibleName(
                RESIZE_DIALOG_TITLE
            );
        });

        it("only unlocks, leaving the drawing, its history and the size alone", async () => {
            renderControl();
            paintStroke(0);
            const before = canvasColors();

            press();
            await userEvent.click(button("Unlock"));

            expect(canvasColors()).toBe(before);
            expect(store().document.gridSize).toBe(32);
            expect(selectCanUndo(store())).toBe(true);
            expectNoDialog();
            await waitFor(() =>
                expect(slider()).not.toHaveClass("pointer-events-none")
            );
        });

        it("erases the drawing only once the unlocked slider actually moves", async () => {
            renderControl();
            paintStroke(0);

            press();
            await userEvent.click(button("Unlock"));

            expect(press().defaultPrevented).toBe(false);
            drag(8);

            expect(store().document.gridSize).toBe(8);
            expect(isCanvasBlank()).toBe(true);
            expect(selectCanUndo(store())).toBe(false);
            expectNoDialog();
        });

        it.each([
            "ArrowRight",
            "ArrowUp",
            "PageUp",
            "End",
            "ArrowLeft",
            "ArrowDown",
            "PageDown",
            "Home",
        ])(
            "asks before %s steps it, and leaves the next press of it to the browser once unlocked",
            async (key) => {
                renderControl();
                paintStroke(0);
                const before = canvasColors();

                expect(pressKey(key).defaultPrevented).toBe(true);
                expect(await findDialog()).toHaveAccessibleName(
                    RESIZE_DIALOG_TITLE
                );

                await userEvent.click(button("Unlock"));

                expect(store().document.gridSize).toBe(32);
                expect(canvasColors()).toBe(before);
                expect(pressKey(key).defaultPrevented).toBe(false);
            }
        );

        it("leaves a key that would not step it to the browser", () => {
            renderControl();
            paintStroke(0);

            expect(pressKey("Tab").defaultPrevented).toBe(false);
            expectNoDialog();
        });

        it.each([
            [MIN_GRID_SIZE, "ArrowLeft"],
            [MIN_GRID_SIZE, "Home"],
            [MAX_GRID_SIZE, "ArrowRight"],
            [MAX_GRID_SIZE, "End"],
        ])(
            "asks nothing at size %i for %s, which cannot move it any further",
            async (size, key) => {
                renderControl();
                actions().setGridSize(size);
                paintStroke(0);
                // A key is judged against the size the slider shows, so this
                // waits for the slider to catch up with the store first.
                await waitFor(() => expect(slider()).toHaveValue(String(size)));

                expect(pressKey(key).defaultPrevented).toBe(false);
                expectNoDialog();
            }
        );

        it("locks again once the drawing changes after unlocking", async () => {
            renderControl();
            paintStroke(0);

            press();
            await userEvent.click(button("Unlock"));
            paintStroke(1);
            press();

            expect(await findDialog()).toHaveAccessibleName(
                RESIZE_DIALOG_TITLE
            );
        });

        it("asks when the grid was cleared but the clear can still be undone", async () => {
            renderControl();
            paintStroke(0);
            actions().clearCanvas();

            press();

            expect(await findDialog()).toHaveAccessibleName(
                RESIZE_DIALOG_TITLE
            );
        });

        it("stops asking for the visit once unlocked with Don't ask again ticked", async () => {
            renderControl();
            paintStroke(0);

            press();
            await userEvent.click(dontAskAgain());
            await userEvent.click(button("Unlock"));
            // A new stroke lapses the unlock, so only the checkbox can be what
            // keeps the slider free after it.
            paintStroke(1);

            expect(press().defaultPrevented).toBe(false);
            drag(16);

            expect(store().document.gridSize).toBe(16);
            expectNoDialog();
        });

        it("keeps asking when Don't ask again is ticked but the question is cancelled", async () => {
            renderControl();
            paintStroke(0);

            press();
            await userEvent.click(dontAskAgain());
            await userEvent.click(button("Cancel"));
            press();

            expect(await findDialog()).toHaveAccessibleName(
                RESIZE_DIALOG_TITLE
            );
        });
    });
});
