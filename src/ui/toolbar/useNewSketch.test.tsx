/**
 * @file New sketch through the settings panel: starting over, and the question
 * asked before it erases a drawing.
 */

import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { createBlankGrid } from "../../domain/grid";
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
import { Toolbar } from "./Toolbar";
import { NEW_SKETCH_DIALOG_TITLE, NEW_SKETCH_WARNING } from "./useNewSketch";

const renderToolbar = () => render(<Toolbar isOpen />);

describe("New sketch", () => {
    it("asks nothing when there is nothing to lose", async () => {
        renderToolbar();
        const before = store().document;

        await userEvent.click(button("New sketch"));

        expectNoDialog();
        expect(store().document).toBe(before);
    });

    describe("over a drawing", () => {
        it("asks first, erasing nothing until it is answered", async () => {
            renderToolbar();
            paintStroke(0);

            await userEvent.click(button("New sketch"));

            const dialog = await findDialog();
            expect(dialog).toHaveAccessibleName(NEW_SKETCH_DIALOG_TITLE);
            expect(dialog).toHaveAccessibleDescription(NEW_SKETCH_WARNING);
            expect(isCanvasBlank()).toBe(false);
        });

        it("keeps the drawing when cancelled", async () => {
            renderToolbar();
            paintStroke(0);

            await userEvent.click(button("New sketch"));
            await userEvent.click(button("Cancel"));

            expectNoDialog();
            expect(isCanvasBlank()).toBe(false);
            expect(selectCanUndo(store())).toBe(true);
        });

        it("starts over once confirmed, at the same size and with the same tools", async () => {
            actions().setGridSize(8);
            paintStroke(0);
            actions().setTool("eraser");
            renderToolbar();

            await userEvent.click(button("New sketch"));
            await userEvent.click(button("Start new sketch"));

            expectNoDialog();
            expect(canvasColors()).toEqual(createBlankGrid(8));
            expect(button("Undo")).toBeDisabled();
            expect(store().tool).toBe("eraser");
        });

        it("erases a cleared drawing that Undo could still bring back", async () => {
            renderToolbar();
            paintStroke(0);
            await userEvent.click(button("Clear canvas"));

            await userEvent.click(button("New sketch"));
            await userEvent.click(button("Start new sketch"));

            expect(selectCanUndo(store())).toBe(false);
        });

        it("stops asking once confirmed with Don't ask again ticked", async () => {
            renderToolbar();
            paintStroke(0);
            await userEvent.click(button("New sketch"));
            await userEvent.click(dontAskAgain());
            await userEvent.click(button("Start new sketch"));

            paintStroke(1);
            await userEvent.click(button("New sketch"));

            expectNoDialog();
            expect(isCanvasBlank()).toBe(true);
        });

        it("asks independently of the resize and replace questions", async () => {
            actions().stopAskingBeforeResize();
            actions().stopAskingBeforeReplace();
            renderToolbar();
            paintStroke(0);

            await userEvent.click(button("New sketch"));

            expect(await findDialog()).toHaveAccessibleName(
                NEW_SKETCH_DIALOG_TITLE
            );
        });
    });
});
