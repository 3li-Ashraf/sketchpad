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

// The toolbar's control stretched to fit a label. Both buttons look alike,
// so neither reads as the default, and `hover:` applies only on devices that
// can hover, so a tap does not leave a button painted.
export const TEXT_BUTTON =
    "toolbar-control w-auto h-auto px-4 py-2 text-sm font-medium hover:bg-accent hover:text-surface";

/**
 * Open exactly while mounted, so the element can never disagree with React.
 * `showModal` gives the top layer, an inert page behind, and Escape as a
 * `cancel` event for free.
 *
 * Portalled to the body because the settings panel is `display: none` while
 * collapsed, and a modal inside it would leave an inert page with nothing
 * visible to dismiss.
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

    // A layout effect, so the dialog is open before the first paint rather
    // than flashing closed for a frame.
    useLayoutEffect(() => {
        const dialog = dialogRef.current!;

        dialog.showModal();
        // `showModal` focuses the first control; the dialog takes focus
        // instead, so Enter presses nothing until a control is chosen.
        dialog.focus();

        return () => dialog.close();
    }, []);

    return createPortal(
        <dialog
            ref={dialogRef}
            role="alertdialog"
            aria-labelledby={titleId}
            aria-describedby={messageId}
            // Focusable, but out of the tab order.
            tabIndex={-1}
            // Escape. Prevented so the element stays open until React unmounts
            // it. When it cannot be (Escape with no user activation to spend),
            // the browser closes the dialog and `onClose` reports it instead,
            // so either way it is reported once.
            onCancel={(event) => {
                if (!event.cancelable) return;

                event.preventDefault();
                onDismiss();
            }}
            // A close nobody asked for. `close` is queued, so the one this
            // component's own cleanup causes can arrive after a StrictMode
            // remount has reopened the dialog; an open dialog ignores it.
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
            <label className="mt-5 flex w-fit cursor-pointer items-center gap-2 text-sm">
                <input
                    type="checkbox"
                    checked={dontAskAgain}
                    onChange={(event) => setDontAskAgain(event.target.checked)}
                    className="size-4 cursor-pointer accent-accent"
                />
                Don't ask again
            </label>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                    type="button"
                    onClick={onCancel}
                    className={TEXT_BUTTON}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={() => onConfirm(dontAskAgain)}
                    className={TEXT_BUTTON}
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
            <button type="button" onClick={onDismiss} className={TEXT_BUTTON}>
                {dismissLabel}
            </button>
            <button type="button" onClick={onAction} className={TEXT_BUTTON}>
                {actionLabel}
            </button>
        </div>
    </ModalDialog>
);
