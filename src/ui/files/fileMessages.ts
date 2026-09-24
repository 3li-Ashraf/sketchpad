/**
 * @file What saving, opening and exporting say when they fail or ask, kept
 * apart from the hook that shows them.
 */

import type { Sketch } from "../../domain/grid";
import {
    SKETCH_FILE_EXTENSION,
    type SketchReadFailure,
} from "../../io/sketchFile";

/** What a failure says, and the labels of its two buttons. */
export interface FailureCopy {
    title: string;
    message: string;
    dismissLabel: string;
    actionLabel: string;
}

export const SAVE_FAILED: FailureCopy = {
    title: "Save failed",
    message: "Nothing was downloaded.",
    dismissLabel: "Close",
    actionLabel: "Try again",
};

export const EXPORT_FAILED: FailureCopy = {
    title: "Export failed",
    message: "Nothing was downloaded.",
    dismissLabel: "Close",
    actionLabel: "Try again",
};

/**
 * A record rather than a switch, so a new failure reason cannot go unworded.
 * Each offers the file picker again, since choosing a file is what the user
 * was in the middle of.
 */
export const LOAD_FAILED: Record<
    SketchReadFailure,
    (fileName: string) => FailureCopy
> = {
    "not-a-sketch": (fileName) => ({
        title: "Not a Sketchpad file",
        message: `${fileName} isn't a sketch. Sketches are saved as ${SKETCH_FILE_EXTENSION} files.`,
        dismissLabel: "Close",
        actionLabel: "Choose another file",
    }),
    unsupported: (fileName) => ({
        title: "Can't read this sketch",
        message: `${fileName} was saved in a format this version of Sketchpad doesn't support.`,
        dismissLabel: "Close",
        actionLabel: "Choose another file",
    }),
    damaged: (fileName) => ({
        title: "File is damaged",
        message: `${fileName} is incomplete or corrupted.`,
        dismissLabel: "Close",
        actionLabel: "Choose another file",
    }),
    unreadable: (fileName) => ({
        title: "File unavailable",
        message: `${fileName} couldn't be read. It may have been moved, renamed or deleted.`,
        dismissLabel: "Close",
        actionLabel: "Choose another file",
    }),
};

export const replaceTitle = (fileName: string): string => `Open ${fileName}?`;

export const replaceWarning = ({ gridSize }: Sketch): string =>
    `This ${gridSize} × ${gridSize} sketch will replace your drawing and its undo history. This can't be undone.`;
