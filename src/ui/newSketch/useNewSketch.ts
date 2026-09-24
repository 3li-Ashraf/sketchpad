/**
 * @file What New sketch does: start over at once while there is nothing to
 * lose, and ask first when it would erase a drawing.
 */

import { useCallback } from "react";

import { useSketchActions } from "../../state/sketchStore";
import { clearSavedWorkspace } from "../autosave/autosaveSession";
import type { ConfirmDialogProps } from "../common/Dialog";
import {
    type ConfirmationCopy,
    useConfirmation,
} from "../common/useConfirmation";

export const NEW_SKETCH_QUESTION: ConfirmationCopy = {
    title: "Start a new sketch?",
    message:
        "A new sketch erases your drawing and its undo history. This can't be undone.",
    confirmLabel: "Start new sketch",
};

interface NewSketch {
    /** The button's action: asks first, or starts over at once. */
    requestNewSketch: () => void;
    /** The question to render, or null while nothing is being asked. */
    newSketchDialog: ConfirmDialogProps | null;
}

/**
 * Clear canvas is one undo step, so it asks nothing. This erases the history
 * too, and clears the autosave from the device at once, so the drawing is
 * gone from there as well.
 */
export const useNewSketch = (): NewSketch => {
    const { startNewSketch } = useSketchActions();
    const { runOrConfirm, dialog } = useConfirmation("newSketch");

    // The store first: clearing then drops the save its change scheduled.
    const startOver = useCallback(() => {
        startNewSketch();
        clearSavedWorkspace();
    }, [startNewSketch]);

    const requestNewSketch = useCallback(
        () => runOrConfirm(NEW_SKETCH_QUESTION, startOver),
        [runOrConfirm, startOver]
    );

    return { requestNewSketch, newSketchDialog: dialog };
};
