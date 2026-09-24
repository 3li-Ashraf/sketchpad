/**
 * @file What only a real `<dialog>` does: the top layer, an inert page behind
 * it, focus and Tab, a real Escape key, and buttons that look alike. jsdom
 * stubs `showModal` down to an attribute, so none of this is visible there.
 */

import "../../styles/index.css";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { button } from "../../test/queries";
import { ConfirmDialog } from "./Dialog";

const renderOverPage = () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
        <>
            <button type="button">Behind</button>
            <ConfirmDialog
                title="Replace drawing?"
                message="This erases your drawing."
                confirmLabel="Replace drawing"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />
        </>
    );

    return { onConfirm, onCancel, dialog: screen.getByRole("alertdialog") };
};

describe("ConfirmDialog in a real browser", () => {
    it("opens as a modal in the top layer", () => {
        const { dialog } = renderOverPage();

        expect(dialog.matches(":modal")).toBe(true);
    });

    it("takes focus itself, so Enter presses nothing", () => {
        const { dialog } = renderOverPage();

        expect(document.activeElement).toBe(dialog);
    });

    it("makes the page behind it inert", () => {
        const { dialog } = renderOverPage();

        button("Behind").focus();

        expect(document.activeElement).toBe(dialog);
    });

    it("moves focus to its first control on Tab", async () => {
        renderOverPage();

        await userEvent.tab();

        expect(document.activeElement).toBe(
            screen.getByRole("checkbox", { name: "Don't ask again" })
        );
    });

    it("reports Escape as Cancel exactly once", async () => {
        const { onCancel, onConfirm } = renderOverPage();

        await userEvent.keyboard("{Escape}");

        expect(onCancel).toHaveBeenCalledOnce();
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it("paints neither button as the default", () => {
        renderOverPage();

        const paint = (name: string) => {
            const style = getComputedStyle(button(name));

            return [style.backgroundColor, style.color, style.borderColor];
        };

        expect(paint("Cancel")).toEqual(paint("Replace drawing"));
    });
});
