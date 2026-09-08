/**
 * @file The window-level undo/redo shortcuts. It owns the key bindings only; the
 * history itself lives in the store.
 */

import { useEffect } from "react";
import { useSketchStore } from "../state/sketchStore";

/**
 * Ctrl/Cmd+Z undoes; Ctrl/Cmd+Y and Ctrl/Cmd+Shift+Z redo. Bound straight to the
 * store rather than by synthesising clicks on toolbar buttons, so the shortcuts
 * keep working whatever the toolbar renders — including on narrow screens, where
 * it is collapsed out of the document.
 */
export const useKeyboardShortcuts = (): void => {
    const undo = useSketchStore((state) => state.undo);
    const redo = useSketchStore((state) => state.redo);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!event.ctrlKey && !event.metaKey) return;

            const key = event.key.toLowerCase();
            const isUndo = key === "z" && !event.shiftKey;
            const isRedo = key === "y" || (key === "z" && event.shiftKey);
            if (!isUndo && !isRedo) return;

            event.preventDefault();
            if (isRedo) redo();
            else undo();
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [redo, undo]);
};
