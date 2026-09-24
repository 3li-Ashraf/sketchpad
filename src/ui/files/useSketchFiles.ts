/**
 * @file Saving, opening and exporting: the file-input dance, opening a file
 * dropped on the page, the dialog each failure raises with the next step it
 * offers, and the question asked before a file replaces a drawing. The formats
 * themselves live in `io/`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
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
    selectHasWorkToLose,
    sketchOf,
    useSketchActions,
    useSketchStore,
} from "../../state/sketchStore";
import type { ConfirmDialogProps, NoticeDialogProps } from "../common/Dialog";
import { isDialogOpen } from "../common/isDialogOpen";
import {
    EXPORT_FAILED,
    type FailureCopy,
    LOAD_FAILED,
    replaceTitle,
    replaceWarning,
    SAVE_FAILED,
} from "./fileMessages";

const SAVE_FILE_NAME = `sketch${SKETCH_FILE_EXTENSION}`;
const PNG_FILE_NAME = "sketch.png";

const log = createLogger("files");

/** Which of this hook's operations a failure's action button runs. */
type NextStep = "save" | "export" | "open";

interface Failure extends FailureCopy {
    nextStep: NextStep;
}

interface PendingLoad {
    fileName: string;
    sketch: Sketch;
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

const carriesFiles = (event: DragEvent): boolean =>
    event.dataTransfer?.types.includes("Files") ?? false;

/**
 * Failures come back as a dialog to render rather than as exceptions. The
 * dialog is modal, so nothing else can be saved, opened or exported until it
 * is answered.
 */
export const useSketchFiles = (): SketchFiles => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [failure, setFailure] = useState<Failure | null>(null);
    const [pendingLoad, setPendingLoad] = useState<PendingLoad | null>(null);

    const { loadSketch, stopAskingBeforeReplace } = useSketchActions();

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

    // Never rejects: `readSketchFile` returns every failure as a reason.
    const loadFile = useCallback(
        async (file: File) => {
            const result = await readSketchFile(file);
            if (!result.ok) {
                setFailure({
                    ...LOAD_FAILED[result.reason](file.name),
                    nextStep: "open",
                });
                return;
            }

            // Asked only once the file is known to be good, so a bad file
            // raises its failure and nothing else.
            const state = useSketchStore.getState();
            if (state.askBeforeReplace && selectHasWorkToLose(state)) {
                setPendingLoad({ fileName: file.name, sketch: result.sketch });
                return;
            }

            loadSketch(result.sketch);
        },
        [loadSketch]
    );

    const openChosenFile = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file) return;

            // Cleared so choosing the same file again still fires `change`,
            // and cleared now because `currentTarget` is null once the event
            // has been dispatched. The `File` taken from it stays readable.
            input.value = "";
            void loadFile(file);
        },
        [loadFile]
    );

    // A file dropped anywhere on the page opens as if it had been picked.
    // Left to the browser, the drop would navigate to the file and replace
    // the page, drawing and all.
    useEffect(() => {
        const handleDragOver = (event: DragEvent) => {
            if (!carriesFiles(event)) return;

            event.preventDefault();
            event.dataTransfer!.dropEffect = isDialogOpen() ? "none" : "copy";
        };

        const handleDrop = (event: DragEvent) => {
            if (!carriesFiles(event)) return;

            event.preventDefault();
            // A question already on screen is answered first.
            if (isDialogOpen()) return;

            const file = event.dataTransfer?.files[0];
            if (file) void loadFile(file);
        };

        window.addEventListener("dragover", handleDragOver);
        window.addEventListener("drop", handleDrop);

        return () => {
            window.removeEventListener("dragover", handleDragOver);
            window.removeEventListener("drop", handleDrop);
        };
    }, [loadFile]);

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
        openSketch,
        openChosenFile,
        failureDialog,
        replaceDialog,
    };
};
