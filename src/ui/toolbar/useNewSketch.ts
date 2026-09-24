/**
 * @file What New sketch does: start over at once while there is nothing to
 * lose, and ask first when it would erase a drawing.
 */

import { useCallback, useState } from "react";

import {
    selectHasWorkToLose,
    useSketchActions,
    useSketchStore,
} from "../../state/sketchStore";
import { clearSavedWorkspace } from "../autosave/autosaveSession";
import type { ConfirmDialogProps } from "../common/Dialog";

export const NEW_SKETCH_DIALOG_TITLE = "Start a new sketch?";

export const NEW_SKETCH_WARNING =
    "A new sketch erases your drawing and its undo history. This can't be undone.";

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
    const { startNewSketch, stopAskingBeforeNewSketch } = useSketchActions();
    const [isAsking, setIsAsking] = useState(false);

    // The store first: clearing then drops the save its change scheduled.
    const startOver = useCallback(() => {
        startNewSketch();
        clearSavedWorkspace();
    }, [startNewSketch]);

    const requestNewSketch = useCallback(() => {
        const state = useSketchStore.getState();

        if (state.askBeforeNewSketch && selectHasWorkToLose(state)) {
            setIsAsking(true);
        } else {
            startOver();
        }
    }, [startOver]);

    const newSketchDialog: ConfirmDialogProps | null = isAsking
        ? {
              title: NEW_SKETCH_DIALOG_TITLE,
              message: NEW_SKETCH_WARNING,
              confirmLabel: "Start new sketch",
              onConfirm: (dontAskAgain) => {
                  if (dontAskAgain) stopAskingBeforeNewSketch();
                  startOver();
                  setIsAsking(false);
              },
              onCancel: () => setIsAsking(false),
          }
        : null;

    return { requestNewSketch, newSketchDialog };
};
