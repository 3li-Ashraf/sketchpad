/**
 * @file Asking before an edit that erases a drawing with no undo step, with
 * the choice not to be asked again for the visit. Resizing, opening a file
 * and New sketch each ask this way; each brings its own words.
 */

import { useCallback, useState } from "react";

import {
    type ConfirmedAction,
    mustAskBefore,
    useSketchActions,
    useSketchStore,
} from "../../state/sketchStore";
import type { ConfirmDialogProps } from "./Dialog";

/** What a question says, and what confirming it is called, such as "Unlock". */
export interface ConfirmationCopy {
    title: string;
    message: string;
    confirmLabel: string;
}

interface Asking {
    copy: ConfirmationCopy;
    proceed: () => void;
}

interface Confirmation {
    /** Asks, and runs `proceed` once confirmed; cancelled, nothing happens. */
    confirm: (copy: ConfirmationCopy, proceed: () => void) => void;
    /**
     * Runs `proceed` at once when nothing would be lost or the user has said
     * not to ask again, and otherwise asks first.
     */
    runOrConfirm: (copy: ConfirmationCopy, proceed: () => void) => void;
    /** The question to render, or null while nothing is being asked. */
    dialog: ConfirmDialogProps | null;
}

export const useConfirmation = (action: ConfirmedAction): Confirmation => {
    const { stopAskingBefore } = useSketchActions();
    const [asking, setAsking] = useState<Asking | null>(null);

    const confirm = useCallback(
        (copy: ConfirmationCopy, proceed: () => void) =>
            setAsking({ copy, proceed }),
        []
    );

    const runOrConfirm = useCallback(
        (copy: ConfirmationCopy, proceed: () => void) => {
            if (mustAskBefore(useSketchStore.getState(), action)) {
                confirm(copy, proceed);
            } else {
                proceed();
            }
        },
        [action, confirm]
    );

    const dialog: ConfirmDialogProps | null = asking && {
        ...asking.copy,
        onConfirm: (dontAskAgain) => {
            if (dontAskAgain) stopAskingBefore(action);
            asking.proceed();
            setAsking(null);
        },
        onCancel: () => setAsking(null),
    };

    return { confirm, runOrConfirm, dialog };
};
