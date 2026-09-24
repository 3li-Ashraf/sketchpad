/** @file The window-level undo and redo shortcuts. */

import { useEffect } from "react";

import { useSketchActions } from "../state/sketchStore";
import { isDialogOpen } from "../ui/common/isDialogOpen";

/**
 * The letter a shortcut is on: the one the key types, where that is a Latin
 * letter, so QWERTZ and AZERTY keep Z on the key labelled Z; on a layout with
 * none, such as Cyrillic or Greek, the one it has where it sits on US QWERTY.
 */
const shortcutLetter = ({ key, code }: KeyboardEvent): string => {
    const letter = key.toLowerCase();
    if (/^[a-z]$/.test(letter)) return letter;

    return /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : letter;
};

/**
 * Ctrl/Cmd+Z undoes; Ctrl/Cmd+Y and Ctrl/Cmd+Shift+Z redo. Bound straight to the
 * store rather than by synthesising clicks on toolbar buttons, so the shortcuts
 * keep working whatever the toolbar renders — including on narrow screens, where
 * it is collapsed out of the document.
 */
export const useKeyboardShortcuts = (): void => {
    const { undo, redo } = useSketchActions();

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!event.ctrlKey && !event.metaKey) return;

            const key = shortcutLetter(event);
            const isUndo = key === "z" && !event.shiftKey;
            const isRedo = key === "y" || (key === "z" && event.shiftKey);
            if (!isUndo && !isRedo) return;

            event.preventDefault();

            // Nothing is undone behind a dialog: a step undone underneath a
            // question would change what the question was about.
            if (isDialogOpen()) return;

            if (isRedo) redo();
            else undo();
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [redo, undo]);
};
