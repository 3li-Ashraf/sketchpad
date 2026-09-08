/**
 * @file The application shell: it arranges the header, toolbar, canvas and
 * footer, and owns the one piece of state that is not about the drawing — whether
 * the narrow-screen toolbar is open.
 */

import { useEffect, useRef, useState } from "react";
import { Canvas } from "../ui/canvas/Canvas";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { Toolbar } from "../ui/toolbar/Toolbar";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

export const App: React.FC = () => {
    // The toolbar is always visible from the `md` breakpoint up, so this drives
    // only the collapsible panel on narrower screens.
    const [isToolbarOpen, setIsToolbarOpen] = useState(false);
    const toolbarRef = useRef<HTMLElement>(null);
    const toggleRef = useRef<HTMLButtonElement>(null);

    useKeyboardShortcuts();

    // Dismisses the panel when a press lands outside it. The toggle has to be
    // excluded, or it would look dead: this listener would close the panel on
    // `pointerdown` and the button's own `onClick` would immediately reopen it.
    useEffect(() => {
        if (!isToolbarOpen) return;

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node;

            if (
                toolbarRef.current?.contains(target) ||
                toggleRef.current?.contains(target)
            ) {
                return;
            }

            setIsToolbarOpen(false);
        };

        document.addEventListener("pointerdown", handlePointerDown);

        return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, [isToolbarOpen]);

    return (
        <div className="flex flex-col h-full select-none font-main text-accent bg-surface">
            <Header
                ref={toggleRef}
                isToolbarOpen={isToolbarOpen}
                onToggleToolbar={() => setIsToolbarOpen((isOpen) => !isOpen)}
            />
            <main className="flex flex-auto items-center justify-around 2xl:justify-center 2xl:relative">
                <Toolbar ref={toolbarRef} isOpen={isToolbarOpen} />
                <Canvas />
            </main>
            <Footer />
        </div>
    );
};
