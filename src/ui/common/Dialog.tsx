/**
 * @file The modal dialog every warning and failure is shown in, in its two
 * forms: a confirmation, which asks before something that cannot be undone, and
 * a notice, which reports something that went wrong and offers the next step.
 */

import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ConfirmDialogProps {
    title: string;
    message: string;
    /** Says what confirming does, such as "Replace drawing", rather than "OK". */
    confirmLabel: string;
    /** Receives whether "Don't ask again" was ticked. */
    onConfirm: (dontAskAgain: boolean) => void;
    /** Cancel, or Escape. */
    onCancel: () => void;
}

export interface NoticeDialogProps {
    title: string;
    message: string;
    /** The button that does nothing, such as "Close". */
    dismissLabel: string;
    /** The next step, such as "Try again" or "Choose another file". */
    actionLabel: string;
    onAction: () => void;
    /** The dismiss button, or Escape. */
    onDismiss: () => void;
}

interface ModalDialogProps {
    title: string;
    message: string;
    /** Escape, or the browser closing the dialog on its own. */
    onDismiss: () => void;
    children: React.ReactNode;
}

// The toolbar's bordered control, stretched to fit a label instead of an icon.
// Every dialog button looks the same and is painted only under the pointer.
// Tailwind's `hover:` variant applies only on devices that can hover, so a tap
// on a touch screen does not leave the button it landed on painted.
const DIALOG_BUTTON =
    "toolbar-control w-auto h-auto px-4 py-2 text-sm font-medium hover:bg-accent hover:text-surface";

/**
 * Open for exactly as long as it is mounted, so whether a dialog is up is
 * decided by whoever renders it and the element can never disagree with React.
 *
 * `showModal` rather than a styled overlay, because the browser then does the
 * hard parts: the dialog is drawn in the top layer above everything, the rest of
 * the page is made inert so the canvas cannot be painted behind it, focus stays
 * inside, and Escape arrives as a `cancel` event.
 *
 * Portalled to the body so it is never inside the toolbar, which is
 * `display: none` while collapsed on a narrow screen. A dialog in there that
 * opened after the panel closed — a save failing a moment after a tap outside
 * it — would be modal but invisible, leaving an inert page with nothing to
 * dismiss. `App` counts a press inside a dialog as a press inside the toolbar
 * for the same reason.
 */
const ModalDialog: React.FC<ModalDialogProps> = ({
    title,
    message,
    onDismiss,
    children,
}) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const messageId = useId();

    // A layout effect, so the dialog is open before the first paint instead of
    // flashing closed for a frame, and is closed again before React takes it out
    // of the document on the way out.
    useLayoutEffect(() => {
        const dialog = dialogRef.current!;

        dialog.showModal();
        // `showModal` focuses the first control on its own — the checkbox in a
        // confirmation, the first button in a notice. Focus moves to the dialog
        // itself instead, so no control starts focused and Enter presses
        // nothing until one is chosen, while Tab still reaches every control
        // and Escape still cancels. The move happens before the browser paints,
        // so the first control is never drawn focused.
        dialog.focus();

        return () => dialog.close();
    }, []);

    return createPortal(
        <dialog
            ref={dialogRef}
            role="alertdialog"
            aria-labelledby={titleId}
            aria-describedby={messageId}
            // Focusable, so it can hold focus itself, but kept out of the tab
            // order, so Tab goes straight to the controls.
            tabIndex={-1}
            // Escape. Prevented so the element stays open until React unmounts
            // it, rather than closing itself a render ahead of the state that
            // says so.
            onCancel={(event) => {
                event.preventDefault();
                onDismiss();
            }}
            // The browser can close the dialog without asking all the same:
            // Escape grants no user activation, and without one to spend,
            // `cancel` is not cancelable. Unheard, that would leave a closed
            // dialog mounted — invisible, and never shown again, since it opens
            // only on mount. `close` is queued rather than fired at once, so the
            // one this component's own cleanup causes can arrive after a
            // StrictMode remount has opened the dialog again, which is why an
            // open dialog ignores it.
            onClose={(event) => {
                if (!event.currentTarget.open) onDismiss();
            }}
            className="modal-dialog"
        >
            {/* Both lines may carry a file name, which can be one long word. */}
            <h2
                id={titleId}
                className="font-pixeled text-sm leading-6 [overflow-wrap:anywhere]"
            >
                {title}
            </h2>
            <p
                id={messageId}
                className="mt-4 text-sm leading-6 [overflow-wrap:anywhere]"
            >
                {message}
            </p>
            {children}
        </dialog>,
        document.body
    );
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    title,
    message,
    confirmLabel,
    onConfirm,
    onCancel,
}) => {
    const [dontAskAgain, setDontAskAgain] = useState(false);

    return (
        <ModalDialog title={title} message={message} onDismiss={onCancel}>
            <label className="mt-5 flex w-fit items-center gap-2 text-sm cursor-pointer">
                <input
                    type="checkbox"
                    checked={dontAskAgain}
                    onChange={(event) => setDontAskAgain(event.target.checked)}
                    className="size-4 accent-accent cursor-pointer"
                />
                Don't ask again
            </label>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button type="button" onClick={onCancel} className={DIALOG_BUTTON}>
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={() => onConfirm(dontAskAgain)}
                    className={DIALOG_BUTTON}
                >
                    {confirmLabel}
                </button>
            </div>
        </ModalDialog>
    );
};

export const NoticeDialog: React.FC<NoticeDialogProps> = ({
    title,
    message,
    dismissLabel,
    actionLabel,
    onAction,
    onDismiss,
}) => (
    <ModalDialog title={title} message={message} onDismiss={onDismiss}>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button type="button" onClick={onDismiss} className={DIALOG_BUTTON}>
                {dismissLabel}
            </button>
            <button type="button" onClick={onAction} className={DIALOG_BUTTON}>
                {actionLabel}
            </button>
        </div>
    </ModalDialog>
);
