/**
 * @file Covers `ui/common/Dialog`: that each form opens as a modal for exactly as
 * long as it is mounted, outside the component that renders it, is named by its
 * title and described by its message, takes focus itself rather than giving it
 * to a control, styles both buttons alike, and reports every way out of it.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog, NoticeDialog } from "./Dialog";

const dialog = () => screen.getByRole("alertdialog");

const button = (name: string) => screen.getByRole("button", { name });

/**
 * The dialog holds focus itself, so no control starts focused and Enter presses
 * nothing, while staying out of the tab order so Tab goes to the controls.
 */
const expectDialogFocused = () => {
    expect(dialog()).toHaveFocus();
    expect(dialog()).toHaveAttribute("tabindex", "-1");
};

/**
 * Both buttons carry exactly the same classes, which is what keeps either from
 * looking like the default; the hover paint is shared too.
 */
const expectButtonsAlike = (first: string, second: string) => {
    expect(button(first).className).toBe(button(second).className);
    expect(button(first)).toHaveClass("hover:bg-accent");
    expect(button(first)).not.toHaveClass("bg-accent");
};

/**
 * Escape. jsdom does not turn the key into a `cancel` event, so the event is
 * dispatched directly, and returned so its default can be inspected.
 */
const pressEscape = (): Event => {
    const event = new Event("cancel", { cancelable: true });
    fireEvent(dialog(), event);

    return event;
};

const renderConfirm = () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    const rendered = render(
        <ConfirmDialog
            title="Replace drawing?"
            message="This erases your drawing."
            confirmLabel="Replace drawing"
            onConfirm={onConfirm}
            onCancel={onCancel}
        />
    );

    return { ...rendered, onConfirm, onCancel };
};

const renderNotice = () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();

    const rendered = render(
        <NoticeDialog
            title="Not a Sketchpad file"
            message="notes.txt isn't a sketch."
            dismissLabel="Close"
            actionLabel="Choose another file"
            onAction={onAction}
            onDismiss={onDismiss}
        />
    );

    return { ...rendered, onAction, onDismiss };
};

describe("confirmation", () => {
    it("opens as a modal, named by its title and described by its message", () => {
        const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
        renderConfirm();

        expect(showModal).toHaveBeenCalledOnce();
        expect(
            screen.getByRole("alertdialog", { name: "Replace drawing?" })
        ).toHaveAccessibleDescription("This erases your drawing.");
    });

    it("is portalled out of the component that renders it", () => {
        const { container } = renderConfirm();

        expect(container).not.toContainElement(dialog());
        expect(document.body).toContainElement(dialog());
    });

    it("takes focus itself, leaving the checkbox and both buttons unfocused", () => {
        renderConfirm();

        expectDialogFocused();
    });

    it("styles Cancel and the confirm button alike", () => {
        renderConfirm();

        expectButtonsAlike("Cancel", "Replace drawing");
    });

    it("reports Cancel", async () => {
        const { onConfirm, onCancel } = renderConfirm();

        await userEvent.click(button("Cancel"));

        expect(onCancel).toHaveBeenCalledOnce();
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it("reports Escape as Cancel, and stays open until it is unmounted", () => {
        const { onCancel } = renderConfirm();

        const escape = pressEscape();

        expect(onCancel).toHaveBeenCalledOnce();
        expect(escape.defaultPrevented).toBe(true);
        expect(dialog()).toHaveAttribute("open");
    });

    it("reports the browser closing it on its own as Cancel", () => {
        // A `cancel` that could not be prevented, as when Escape arrives with no
        // user activation to spend: the dialog is already closed by the time
        // `close` is delivered.
        const { onCancel } = renderConfirm();
        const element = dialog() as HTMLDialogElement;

        element.close();
        fireEvent(element, new Event("close"));

        expect(onCancel).toHaveBeenCalledOnce();
    });

    it("ignores a close event delivered while it is open", () => {
        // What a StrictMode remount leaves behind: the event queued by the
        // first cleanup's `close`, arriving after the dialog has reopened.
        const { onCancel } = renderConfirm();

        fireEvent(dialog(), new Event("close"));

        expect(onCancel).not.toHaveBeenCalled();
    });

    it("confirms without Don't ask again unless it is ticked", async () => {
        const { onConfirm } = renderConfirm();

        expect(
            screen.getByRole("checkbox", { name: "Don't ask again" })
        ).not.toBeChecked();

        await userEvent.click(button("Replace drawing"));

        expect(onConfirm).toHaveBeenCalledExactlyOnceWith(false);
    });

    it("passes Don't ask again along when it is ticked", async () => {
        const { onConfirm } = renderConfirm();

        await userEvent.click(screen.getByRole("checkbox", { name: "Don't ask again" }));
        await userEvent.click(button("Replace drawing"));

        expect(onConfirm).toHaveBeenCalledExactlyOnceWith(true);
    });

    it("closes when it is unmounted", () => {
        const close = vi.spyOn(HTMLDialogElement.prototype, "close");
        const { unmount } = renderConfirm();

        unmount();

        expect(close).toHaveBeenCalledOnce();
    });
});

describe("notice", () => {
    it("opens as a modal with its own button labels, and nothing to tick", () => {
        const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
        renderNotice();

        expect(showModal).toHaveBeenCalledOnce();
        expect(
            screen.getByRole("alertdialog", { name: "Not a Sketchpad file" })
        ).toHaveAccessibleDescription("notes.txt isn't a sketch.");
        expect(button("Close")).toBeInTheDocument();
        expect(button("Choose another file")).toBeInTheDocument();
        expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    });

    it("takes focus itself, leaving both buttons unfocused", () => {
        renderNotice();

        expectDialogFocused();
    });

    it("styles both buttons alike", () => {
        renderNotice();

        expectButtonsAlike("Close", "Choose another file");
    });

    it("reports the dismiss button", async () => {
        const { onAction, onDismiss } = renderNotice();

        await userEvent.click(button("Close"));

        expect(onDismiss).toHaveBeenCalledOnce();
        expect(onAction).not.toHaveBeenCalled();
    });

    it("reports the next step", async () => {
        const { onAction, onDismiss } = renderNotice();

        await userEvent.click(button("Choose another file"));

        expect(onAction).toHaveBeenCalledOnce();
        expect(onDismiss).not.toHaveBeenCalled();
    });

    it("reports Escape as a dismissal", () => {
        const { onDismiss } = renderNotice();

        expect(pressEscape().defaultPrevented).toBe(true);
        expect(onDismiss).toHaveBeenCalledOnce();
    });
});
