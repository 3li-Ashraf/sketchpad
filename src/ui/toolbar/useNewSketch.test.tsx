/**
 * @file New sketch through the settings panel: starting over, and the question
 * asked before it erases a drawing.
 */

import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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
import { clearSavedWorkspace } from "../autosave/autosaveSession";
import { Toolbar } from "./Toolbar";
import { NEW_SKETCH_DIALOG_TITLE, NEW_SKETCH_WARNING } from "./useNewSketch";

// The session is tested in `useAutosave.test`; here only the call is watched.
vi.mock("../autosave/autosaveSession", { spy: true });

const renderToolbar = () => render(<Toolbar isOpen />);

/** Whether the canvas was blank each time the device was asked to clear. */
const blankAtEachClear = () => {
    const seen: boolean[] = [];
    vi.mocked(clearSavedWorkspace).mockImplementation(() => {
        seen.push(isCanvasBlank());
    });

    return seen;
};

describe("New sketch", () => {
    it("clears the device, once the canvas holds the new sketch", async () => {
        renderToolbar();
        const seen = blankAtEachClear();
        paintStroke(0);

        await userEvent.click(button("New sketch"));
        await userEvent.click(button("Start new sketch"));

        // Cleared after starting over, so the session drops the save that
        // starting over scheduled.
        expect(seen).toEqual([true]);
    });

    it("clears the device without asking when there is nothing to lose", async () => {
        renderToolbar();
        const seen = blankAtEachClear();

        await userEvent.click(button("New sketch"));

        expect(seen).toEqual([true]);
    });

    it("leaves the device alone when cancelled", async () => {
        renderToolbar();
        paintStroke(0);

        await userEvent.click(button("New sketch"));
        await userEvent.click(button("Cancel"));

        expect(clearSavedWorkspace).not.toHaveBeenCalled();
    });

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
            expect(store().settings.tool).toBe("eraser");
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

        it("asks again next time when Don't ask again was left unticked", async () => {
            renderToolbar();
            paintStroke(0);
            await userEvent.click(button("New sketch"));
            await userEvent.click(button("Start new sketch"));

            paintStroke(1);
            await userEvent.click(button("New sketch"));

            expect(await findDialog()).toHaveAccessibleName(
                NEW_SKETCH_DIALOG_TITLE
            );
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
