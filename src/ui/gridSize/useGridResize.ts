/**
 * @file What the grid size slider does: resize freely while there is nothing to
 * lose, and ask the moment it is touched when a resize would erase a drawing.
 */

import { useCallback, useState } from "react";

import type { SketchDocument } from "../../domain/sketchDocument";
import {
    selectHasWorkToLose,
    type SketchStore,
    useSketchActions,
    useSketchStore,
} from "../../state/sketchStore";
import type { ConfirmDialogProps } from "../common/Dialog";

export const RESIZE_DIALOG_TITLE = "Unlock grid size?";

export const RESIZE_WARNING =
    "Changing the size will erase your drawing and its undo history. This can't be undone.";

/**
 * The colors as they stood when the slider was unlocked, held by identity.
 * Every edit to the drawing or its history replaces them, a stroke from its
 * first painted cell, so the approval lapses on its own at the next stroke,
 * fill, clear, rotation, undo or redo.
 */
type Approval = SketchDocument["colors"];

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

const isApproved = (
    { document }: SketchStore,
    approval: Approval | null
): boolean => approval === document.colors;

// Cheapest first: the grid scan runs only when the flags have not settled it.
const isLockedFor = (state: SketchStore, approval: Approval | null): boolean =>
    state.askBeforeResize &&
    !isApproved(state, approval) &&
    selectHasWorkToLose(state);

/**
 * Over a drawing the slider is locked, and the first press on it, or key that
 * would step it, asks before anything moves. Unlocking erases nothing by
 * itself: the drawing goes only once the slider moves and the size changes.
 *
 * The lock is subscribed to because the slider must be out of the pointer's
 * reach before a press arrives. It is selected as a boolean, so the toolbar
 * re-renders when it flips rather than on every painted cell.
 */
export const useGridResize = (): GridResize => {
    const gridSize = useSketchStore((state) => state.document.gridSize);
    const { setGridSize, stopAskingBeforeResize } = useSketchActions();

    const [approval, setApproval] = useState<Approval | null>(null);
    const [isAsking, setIsAsking] = useState(false);

    const isLocked = useSketchStore((state) => isLockedFor(state, approval));

    // Both read the store afresh: `isLocked` is only as current as the last
    // render. A step can arrive while locked (a drag begun on a blank grid
    // while a second finger paints) and is dropped, so nothing is erased
    // unasked.
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

                  setApproval(useSketchStore.getState().document.colors);
                  setIsAsking(false);
              },
              onCancel: () => setIsAsking(false),
          }
        : null;

    return { gridSize, isLocked, resize, allowResize, resizeDialog };
};
