/**
 * @file Saving, loading and exporting, kept out of the toolbar so the toolbar
 * stays a declarative arrangement of controls. It owns the failure handling and
 * the next step each failure offers, the question asked before a file replaces a
 * drawing, and the file-input dance; the formats themselves live in `io/`.
 */

import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Sketch } from "../../domain/grid";
import type { Bytes } from "../../io/compression";
import { downloadBlob, downloadUrl } from "../../io/fileDownload";
import { sketchToPngDataUrl } from "../../io/pngExport";
import {
    parseSketch,
    serializeSketch,
    SKETCH_FILE_EXTENSION,
    SKETCH_FILE_MIME_TYPE,
    type SketchParseFailure,
} from "../../io/sketchFile";
import {
    selectHasWorkToLose,
    selectSketch,
    useSketchStore,
} from "../../state/sketchStore";
import type { ConfirmDialogProps, NoticeDialogProps } from "../common/Dialog";

const SAVE_FILE_NAME = `sketch${SKETCH_FILE_EXTENSION}`;
const PNG_FILE_NAME = "sketch.png";

/** What a failure says, and the labels of its two buttons. */
export interface FailureCopy {
    title: string;
    message: string;
    dismissLabel: string;
    actionLabel: string;
}

// A failed save or export offers the same operation again.
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

/** Every way a load can fail: the decoder's reasons, or no bytes to decode. */
export type LoadFailure = SketchParseFailure | "unreadable";

/**
 * A record rather than a switch, so a new failure reason cannot go unworded.
 * Every one offers the file picker again, since choosing a file is what the user
 * was in the middle of.
 */
export const LOAD_FAILED: Record<LoadFailure, (fileName: string) => FailureCopy> =
    {
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

/** Which of this hook's own operations a failure's action button runs. */
type NextStep = "save" | "export" | "pick";

interface Failure extends FailureCopy {
    nextStep: NextStep;
}

interface PendingLoad {
    fileName: string;
    sketch: Sketch;
}

interface SketchFiles {
    /** Attach to the hidden file input that `openFilePicker` opens. */
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    saveSketch: () => Promise<void>;
    exportPng: () => void;
    openFilePicker: () => void;
    loadSelectedFile: (
        event: React.ChangeEvent<HTMLInputElement>
    ) => Promise<void>;
    /** The failure to report, or null when there is none. */
    failureDialog: NoticeDialogProps | null;
    /** The question to ask before a decoded file replaces a drawing, or null. */
    replaceDialog: ConfirmDialogProps | null;
}

/**
 * Failures are returned as a dialog to render rather than thrown, so a caller
 * has one thing to handle. A dialog is modal, so nothing else can be saved,
 * loaded or exported until it is dismissed, and no failure can outlive the one
 * it reports.
 */
export const useSketchFiles = (): SketchFiles => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [failure, setFailure] = useState<Failure | null>(null);
    const [pendingLoad, setPendingLoad] = useState<PendingLoad | null>(null);

    const loadSketch = useSketchStore((state) => state.loadSketch);
    const stopAskingBeforeReplace = useSketchStore(
        (state) => state.stopAskingBeforeReplace
    );

    const saveSketch = useCallback(async () => {
        try {
            const file = await serializeSketch(
                selectSketch(useSketchStore.getState())
            );

            downloadBlob(
                new Blob([file], { type: SKETCH_FILE_MIME_TYPE }),
                SAVE_FILE_NAME
            );
        } catch {
            setFailure({ ...SAVE_FAILED, nextStep: "save" });
        }
    }, []);

    const exportPng = useCallback(() => {
        const dataUrl = sketchToPngDataUrl(selectSketch(useSketchStore.getState()));

        if (!dataUrl) {
            setFailure({ ...EXPORT_FAILED, nextStep: "export" });
            return;
        }

        downloadUrl(dataUrl, PNG_FILE_NAME);
    }, []);

    const openFilePicker = useCallback(() => fileInputRef.current?.click(), []);

    const loadSelectedFile = useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file) return;

            // Cleared so that choosing the same file again still fires a change
            // event; the input would otherwise consider it unchanged. Done up
            // front, so that every way out below — a failure included — leaves
            // the file retryable, and while the event is still being dispatched,
            // since `currentTarget` is null after the first await. The `File`
            // already taken from the input stays readable.
            input.value = "";

            const reportFailure = (reason: LoadFailure) =>
                setFailure({ ...LOAD_FAILED[reason](file.name), nextStep: "pick" });

            // Reading the bytes is a separate failure from decoding them:
            // `arrayBuffer` rejects when the file has been moved or deleted
            // since it was picked, which the browser only discovers here. Left
            // uncaught that would escape as an unhandled rejection and show the
            // user nothing.
            let bytes: Bytes;
            try {
                bytes = new Uint8Array(await file.arrayBuffer());
            } catch {
                reportFailure("unreadable");
                return;
            }

            const result = await parseSketch(bytes);
            if (!result.ok) {
                reportFailure(result.reason);
                return;
            }

            // Asked only once the file is known to be good, so a picker
            // dismissed or a bad file chosen never raises a pointless question.
            const state = useSketchStore.getState();
            if (state.askBeforeReplace && selectHasWorkToLose(state)) {
                setPendingLoad({ fileName: file.name, sketch: result.sketch });
                return;
            }

            loadSketch(result.sketch);
        },
        [loadSketch]
    );

    const nextSteps: Record<NextStep, () => void> = {
        save: saveSketch,
        export: exportPng,
        pick: openFilePicker,
    };

    const failureDialog: NoticeDialogProps | null = failure && {
        title: failure.title,
        message: failure.message,
        dismissLabel: failure.dismissLabel,
        actionLabel: failure.actionLabel,
        onAction: () => {
            // Closed synchronously before the next step runs, so the page
            // behind is interactive again by the time that step reaches into it
            // — the file input the picker opens from sits back there, inert for
            // as long as the modal is up — and so a step that fails again opens
            // its failure afresh.
            flushSync(() => setFailure(null));
            nextSteps[failure.nextStep]();
        },
        onDismiss: () => setFailure(null),
    };

    const replaceDialog: ConfirmDialogProps | null = pendingLoad && {
        title: replaceTitle(pendingLoad.fileName),
        message: replaceWarning(pendingLoad.sketch),
        confirmLabel: "Replace drawing",
        onConfirm: (dontAskAgain) => {
            if (dontAskAgain) stopAskingBeforeReplace();
            loadSketch(pendingLoad.sketch);
            setPendingLoad(null);
        },
        onCancel: () => setPendingLoad(null),
    };

    return {
        fileInputRef,
        saveSketch,
        exportPng,
        openFilePicker,
        loadSelectedFile,
        failureDialog,
        replaceDialog,
    };
};
