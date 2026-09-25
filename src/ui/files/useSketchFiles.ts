/**
 * @file Saving, opening and exporting: the file-input dance, the dialog each
 * failure raises with the next step it offers, and the question asked before
 * a file replaces a drawing. A file dropped on the page opens as a picked one
 * does (`useFileDrop`). The formats themselves live in `io/`.
 */

import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";

import type { Sketch } from "../../domain/grid";
import { downloadBlob } from "../../io/fileDownload";
import { renderSketchPng } from "../../io/pngExport";
import {
    encodeSketch,
    readSketchFile,
    SKETCH_FILE_EXTENSION,
    SKETCH_FILE_MIME_TYPE,
} from "../../io/sketchFile";
import { createLogger } from "../../log/logger";
import {
    sketchOf,
    useSketchActions,
    useSketchStore,
} from "../../state/sketchStore";
import type { ConfirmDialogProps, NoticeDialogProps } from "../common/Dialog";
import { useConfirmation } from "../common/useConfirmation";
import {
    EXPORT_FAILED,
    type FailureCopy,
    LOAD_FAILED,
    replaceQuestion,
    SAVE_FAILED,
} from "./fileMessages";
import { useFileDrop } from "./useFileDrop";

const SAVE_FILE_NAME = `sketch${SKETCH_FILE_EXTENSION}`;
const PNG_FILE_NAME = "sketch.png";

const log = createLogger("files");

/** Which of this hook's operations a failure's action button runs. */
type NextStep = "save" | "export" | "open";

interface Failure extends FailureCopy {
    nextStep: NextStep;
}

interface SketchFiles {
    /** Attach to the hidden file input; `openChosenFile` is its `onChange`. */
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    saveSketch: () => void;
    exportPng: () => void;
    /** Opens the file picker. */
    openSketch: () => void;
    openChosenFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
    /** The failure to report, or null when there is none. */
    failureDialog: NoticeDialogProps | null;
    /** The question to ask before a decoded file replaces a drawing, or null. */
    replaceDialog: ConfirmDialogProps | null;
}

const currentSketch = (): Sketch => sketchOf(useSketchStore.getState());

/**
 * Failures come back as a dialog to render rather than as exceptions. The
 * dialog is modal, so nothing else can be saved, opened or exported until it
 * is answered.
 */
export const useSketchFiles = (): SketchFiles => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [failure, setFailure] = useState<Failure | null>(null);

    const { loadSketch } = useSketchActions();
    const { runOrConfirm, dialog: replaceDialog } = useConfirmation("replace");

    const saveSketch = useCallback(() => {
        encodeSketch(currentSketch())
            .then((bytes) =>
                downloadBlob(
                    new Blob([bytes], { type: SKETCH_FILE_MIME_TYPE }),
                    SAVE_FILE_NAME
                )
            )
            .catch((error: unknown) => {
                log.error("save failed", { error });
                setFailure({ ...SAVE_FAILED, nextStep: "save" });
            });
    }, []);

    const exportPng = useCallback(() => {
        renderSketchPng(currentSketch())
            .then((png) => downloadBlob(png, PNG_FILE_NAME))
            .catch((error: unknown) => {
                log.error("export failed", { error });
                setFailure({ ...EXPORT_FAILED, nextStep: "export" });
            });
    }, []);

    const openSketch = useCallback(() => fileInputRef.current!.click(), []);

    // `readSketchFile` never rejects: it returns every failure as a reason.
    const openFile = useCallback(
        (file: File) => {
            void readSketchFile(file).then((result) => {
                if (!result.ok) {
                    setFailure({
                        ...LOAD_FAILED[result.reason](file.name),
                        nextStep: "open",
                    });
                    return;
                }

                // Asked only once the file is known to be good, so a bad
                // file raises its failure and nothing else.
                const { sketch } = result;
                runOrConfirm(replaceQuestion(file.name, sketch), () =>
                    loadSketch(sketch)
                );
            });
        },
        [loadSketch, runOrConfirm]
    );

    useFileDrop(openFile);

    const openChosenFile = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file) return;

            // Cleared so choosing the same file again still fires `change`,
            // and cleared now because `currentTarget` is null once the event
            // has been dispatched. The `File` taken from it stays readable.
            input.value = "";
            openFile(file);
        },
        [openFile]
    );

    const nextSteps: Record<NextStep, () => void> = {
        save: saveSketch,
        export: exportPng,
        open: openSketch,
    };

    const failureDialog: NoticeDialogProps | null = failure && {
        title: failure.title,
        message: failure.message,
        dismissLabel: failure.dismissLabel,
        actionLabel: failure.actionLabel,
        onAction: () => {
            // Closed synchronously first: the file input the picker opens from
            // is inert while the modal is up, and a step that fails again has
            // to open its failure afresh.
            flushSync(() => setFailure(null));
            nextSteps[failure.nextStep]();
        },
        onDismiss: () => setFailure(null),
    };

    return {
        fileInputRef,
        saveSketch,
        exportPng,
        openSketch,
        openChosenFile,
        failureDialog,
        replaceDialog,
    };
};
