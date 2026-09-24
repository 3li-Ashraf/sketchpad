/**
 * @file Whether the narrow-screen settings panel is open, and closing it when a
 * press lands outside it, a press that then does nothing else. From the `md`
 * breakpoint up the panel is always shown and this state has no visible
 * effect.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";

interface ToolbarPopover {
    isOpen: boolean;
    toggle: () => void;
    /** Links the toggle to the panel it controls. */
    panelId: string;
    panelRef: React.RefObject<HTMLElement | null>;
    toggleRef: React.RefObject<HTMLButtonElement | null>;
}

export const useToolbarPopover = (): ToolbarPopover => {
    const [isOpen, setIsOpen] = useState(false);
    const panelId = useId();
    const panelRef = useRef<HTMLElement>(null);
    const toggleRef = useRef<HTMLButtonElement>(null);

    // The toggle is excluded, or this would close the panel on `pointerdown`
    // and the toggle's click would open it again. Dialogs are too: the panel
    // opens them, but they are portalled out of it.
    //
    // In the document's capture phase, which comes before React's listeners
    // on the root, so the press that closes the panel can be consumed there
    // and not also paint on the canvas beneath. Only while the panel is a
    // popover, as a shown toggle means: left open past `md`, where the panel
    // is always on screen, the press is the user's to use.
    useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (event: PointerEvent) => {
            const { target } = event;
            if (
                !(target instanceof Element) ||
                panelRef.current?.contains(target) ||
                toggleRef.current?.contains(target) ||
                target.closest("dialog")
            ) {
                return;
            }

            setIsOpen(false);

            const toggle = toggleRef.current;
            if (toggle && getComputedStyle(toggle).display !== "none") {
                event.stopPropagation();
            }
        };

        document.addEventListener("pointerdown", handlePointerDown, true);

        return () =>
            document.removeEventListener(
                "pointerdown",
                handlePointerDown,
                true
            );
    }, [isOpen]);

    const toggle = useCallback(() => setIsOpen((open) => !open), []);

    return { isOpen, toggle, panelId, panelRef, toggleRef };
};
