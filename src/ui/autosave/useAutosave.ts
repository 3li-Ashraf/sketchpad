/**
 * @file Autosave in the app: the workspace is written to the device after
 * every change, and read back when the page opens, so a reload, a closed tab
 * or a crash loses nothing.
 */

import { useEffect, useState } from "react";

import type { NoticeDialogProps } from "../common/Dialog";
import { type Question, startAutosave } from "./autosaveSession";
import { RESTORE_SKIPPED, type Restored } from "./restoreAutosave";

export const RESTORE_DIALOG_TITLE = "Restore your saved drawing?";

export const RESTORE_WARNING =
    "Sketchpad has just found the drawing saved on this device, and you've drawn since the page opened. Restoring it replaces what you've drawn; keeping yours erases the saved one. This can't be undone.";
/**
 * Saves the workspace a moment after it changes, and at once when the page is
 * hidden or unloaded: a phone can end a background tab without warning.
 *
 * A save that falls due during a stroke waits for it to end rather than
 * stall the drag. Leaving the page mid-stroke saves the drawing as last
 * committed, without the stroke.
 *
 * Returns the question to render when the device turns out to hold a drawing
 * that the one drawn since would erase, or null.
 */
export const useAutosave = (
    restored: Restored = RESTORE_SKIPPED
): NoticeDialogProps | null => {
    const [question, setQuestion] = useState<Question | null>(null);

    useEffect(() => startAutosave(restored, setQuestion), [restored]);

    return (
        question && {
            title: RESTORE_DIALOG_TITLE,
            message: RESTORE_WARNING,
            dismissLabel: "Keep this drawing",
            actionLabel: "Restore saved drawing",
            onAction: question.restore,
            onDismiss: question.keep,
        }
    );
};
