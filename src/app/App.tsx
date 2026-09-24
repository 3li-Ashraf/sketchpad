/** @file The application shell: header, settings panel, canvas and footer. */

import { Canvas } from "../ui/canvas/Canvas";
import { useAutosave } from "../ui/files/autosave";
import { Toolbar } from "../ui/toolbar/Toolbar";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useToolbarPopover } from "./useToolbarPopover";

export const App: React.FC = () => {
    const toolbar = useToolbarPopover();

    useKeyboardShortcuts();
    useAutosave();

    return (
        <div className="flex h-full flex-col bg-surface font-main text-accent select-none">
            <Header
                toggleRef={toolbar.toggleRef}
                toolbarId={toolbar.panelId}
                isToolbarOpen={toolbar.isOpen}
                onToggleToolbar={toolbar.toggle}
            />
            <main className="flex flex-auto items-center justify-around 2xl:relative 2xl:justify-center">
                <Toolbar
                    ref={toolbar.panelRef}
                    id={toolbar.panelId}
                    isOpen={toolbar.isOpen}
                />
                <Canvas />
            </main>
            <Footer />
        </div>
    );
};
