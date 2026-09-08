/**
 * @file Saving, loading and exporting, kept out of the toolbar so the toolbar
 * stays a declarative arrangement of controls. It owns the failure handling and
 * the file-input dance; the formats themselves live in `io/`.
 */

import { useCallback, useRef, useState } from "react";
import type { Sketch } from "../../domain/grid";
import { downloadBlob, downloadUrl } from "../../io/fileDownload";
import { sketchToPngDataUrl } from "../../io/pngExport";
import {
    parseSketch,
    serializeSketch,
    SKETCH_FILE_EXTENSION,
    SKETCH_FILE_MIME_TYPE,
} from "../../io/sketchFile";
import { selectSketch, useSketchStore } from "../../state/sketchStore";

const SAVE_FILE_NAME = `sketch${SKETCH_FILE_EXTENSION}`;
const PNG_FILE_NAME = "sketch.png";

export const SAVE_FAILED_MESSAGE = "Could not save the sketch. Please try again.";
export const EXPORT_FAILED_MESSAGE = "Could not render the sketch to an image.";
export const LOAD_FAILED_MESSAGE =
    "That file is not a sketch this app can open.";

interface SketchFiles {
    /** Attach to the hidden file input that `openFilePicker` opens. */
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    /** The last failure, or null once an operation succeeds. */
    error: string | null;
    saveSketch: () => Promise<void>;
    exportPng: () => void;
    openFilePicker: () => void;
    loadSelectedFile: (
        event: React.ChangeEvent<HTMLInputElement>
    ) => Promise<void>;
}

/**
 * Failures land in `error` rather than throwing, so a caller has one thing to
 * handle. The toolbar renders it as a `role="alert"` message, which announces
 * itself and gives the tests something to assert on.
 */
export const useSketchFiles = (): SketchFiles => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState<string | null>(null);

    const loadSketch = useSketchStore((state) => state.loadSketch);

    const saveSketch = useCallback(async () => {
        try {
            const file = await serializeSketch(
                selectSketch(useSketchStore.getState())
            );

            downloadBlob(
                new Blob([file], { type: SKETCH_FILE_MIME_TYPE }),
                SAVE_FILE_NAME
            );
            setError(null);
        } catch {
            setError(SAVE_FAILED_MESSAGE);
        }
    }, []);

    const exportPng = useCallback(() => {
        const dataUrl = sketchToPngDataUrl(selectSketch(useSketchStore.getState()));

        if (!dataUrl) {
            setError(EXPORT_FAILED_MESSAGE);
            return;
        }

        downloadUrl(dataUrl, PNG_FILE_NAME);
        setError(null);
    }, []);

    const openFilePicker = useCallback(() => fileInputRef.current?.click(), []);

    const loadSelectedFile = useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            // Captured before the first await: `currentTarget` is only valid
            // while the event is being dispatched, and is null by the time the
            // file has been read.
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file) return;

            // `parseSketch` returns null for anything it cannot decode, but
            // reading the bytes is a separate failure: `arrayBuffer` rejects
            // when the file has been moved or deleted since it was picked,
            // which the browser only discovers here. Left uncaught that would
            // escape as an unhandled rejection and show the user nothing.
            let sketch: Sketch | null = null;
            try {
                sketch = await parseSketch(new Uint8Array(await file.arrayBuffer()));
            } catch {
                // Left null, which is the same outcome as an undecodable file.
            }

            // Cleared so that choosing the same file again still fires a change
            // event; the input would otherwise consider it unchanged. It has to
            // happen on the failure path too, or a file that failed once could
            // not be retried.
            input.value = "";

            if (!sketch) {
                setError(LOAD_FAILED_MESSAGE);
                return;
            }

            loadSketch(sketch);
            setError(null);
        },
        [loadSketch]
    );

    return {
        fileInputRef,
        error,
        saveSketch,
        exportPng,
        openFilePicker,
        loadSelectedFile,
    };
};
