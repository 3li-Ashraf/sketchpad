/**
 * @file What the grid size slider does: resize freely while there is nothing to
 * lose, and ask the moment it is touched when a resize would erase a drawing.
 */

import { useCallback, useState } from "react";
import {
    selectHasWorkToLose,
    useSketchStore,
    type SketchStore,
} from "../../state/sketchStore";
import type { ConfirmDialogProps } from "../common/Dialog";

export const RESIZE_DIALOG_TITLE = "Unlock grid size?";

export const RESIZE_WARNING =
    "Changing the size will erase your drawing and its undo history. This can't be undone.";

/**
 * The drawing as it stood when the slider was unlocked, held by identity. The
 * store replaces `colors` and the history stacks rather than mutating them, so
 * this matches exactly until the drawing next changes — a stroke, a fill, an
 * undo — and lapses on its own after that, without anything having to clear it.
 */
type Approval = Pick<SketchStore, "colors" | "undoStack" | "redoStack">;

interface GridResize {
    gridSize: number;
    /** Whether the slider has to ask before it moves. */
    isLocked: boolean;
    /** A step the slider has already taken. */
    resize: (gridSize: number) => void;
    /**
     * A press or key, before the slider moves. Asks while locked, and says
     * whether the slider may move.
     */
    allowResize: () => boolean;
    /** The question to render, or null while nothing is being asked. */
    resizeDialog: ConfirmDialogProps | null;
}

const isApproved = (state: SketchStore, approval: Approval | null): boolean =>
    approval !== null &&
    approval.colors === state.colors &&
    approval.undoStack === state.undoStack &&
    approval.redoStack === state.redoStack;

// Ordered cheapest first: the scan in `selectHasWorkToLose` runs only when the
// two flags have not already settled it.
const isLockedFor = (state: SketchStore, approval: Approval | null): boolean =>
    state.askBeforeResize &&
    !isApproved(state, approval) &&
    selectHasWorkToLose(state);

/**
 * Over a drawing the slider is locked, and the first press on it — or the first
 * key that would step it — asks before anything moves. Unlocking erases nothing
 * by itself: the drawing goes only once the slider is moved again and the size
 * actually changes. Cancel leaves it locked.
 *
 * The lock is subscribed to, because the slider has to be out of the pointer's
 * reach before a press arrives rather than refuse one afterwards. It is selected
 * as a boolean, so the toolbar re-renders when it flips rather than on every
 * painted cell.
 */
export const useGridResize = (): GridResize => {
    const gridSize = useSketchStore((state) => state.gridSize);
    const setGridSize = useSketchStore((state) => state.setGridSize);
    const stopAskingBeforeResize = useSketchStore(
        (state) => state.stopAskingBeforeResize
    );

    const [approval, setApproval] = useState<Approval | null>(null);
    const [isAsking, setIsAsking] = useState(false);

    const isLocked = useSketchStore((state) => isLockedFor(state, approval));

    // Both read the store afresh rather than trusting `isLocked`, which is only
    // as current as the last render.
    //
    // A step can still arrive while locked: a drag begun on a blank grid goes on
    // under the pointer if a second finger paints meanwhile. It is dropped, so
    // the new strokes are not erased unasked.
    const resize = useCallback(
        (size: number) => {
            if (!isLockedFor(useSketchStore.getState(), approval)) {
                setGridSize(size);
            }
        },
        [approval, setGridSize]
    );

    const allowResize = useCallback(() => {
        if (!isLockedFor(useSketchStore.getState(), approval)) return true;

        setIsAsking(true);
        return false;
    }, [approval]);

    const resizeDialog: ConfirmDialogProps | null = isAsking
        ? {
              title: RESIZE_DIALOG_TITLE,
              message: RESIZE_WARNING,
              confirmLabel: "Unlock",
              onConfirm: (dontAskAgain) => {
                  if (dontAskAgain) stopAskingBeforeResize();

                  const { colors, undoStack, redoStack } =
                      useSketchStore.getState();
                  setApproval({ colors, undoStack, redoStack });
                  setIsAsking(false);
              },
              onCancel: () => setIsAsking(false),
          }
        : null;

    return { gridSize, isLocked, resize, allowResize, resizeDialog };
};
