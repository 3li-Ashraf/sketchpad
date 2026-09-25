/**
 * @file A file dropped anywhere on the page, handed on as if it had been
 * picked. Left to the browser, the drop would navigate to the file and
 * replace the page, drawing and all.
 */

import { useEffect } from "react";

import { isDialogOpen } from "../common/isDialogOpen";

const carriesFiles = (event: DragEvent): boolean =>
    event.dataTransfer?.types.includes("Files") ?? false;

/**
 * Takes over drags that carry files, and leaves any other, such as of text,
 * to the browser. Under a dialog a drop is still kept from the browser, but
 * opens nothing, and the pointer says so: the question on screen is answered
 * first.
 */
export const useFileDrop = (onFile: (file: File) => void): void => {
    useEffect(() => {
        const handleDragOver = (event: DragEvent) => {
            if (!carriesFiles(event)) return;

            event.preventDefault();
            event.dataTransfer!.dropEffect = isDialogOpen() ? "none" : "copy";
        };

        const handleDrop = (event: DragEvent) => {
            if (!carriesFiles(event)) return;

            event.preventDefault();
            if (isDialogOpen()) return;

            const file = event.dataTransfer?.files[0];
            if (file) onFile(file);
        };

        window.addEventListener("dragover", handleDragOver);
        window.addEventListener("drop", handleDrop);

        return () => {
            window.removeEventListener("dragover", handleDragOver);
            window.removeEventListener("drop", handleDrop);
        };
    }, [onFile]);
};
