/** @file The application shell: header, settings panel, canvas and footer. */

import type { Restored } from "../ui/autosave/restoreAutosave";
import { useAutosave } from "../ui/autosave/useAutosave";
import { Canvas } from "../ui/canvas/Canvas";
import { NoticeDialog } from "../ui/common/Dialog";
import { EDITOR_AREA } from "../ui/common/layout";
import { Toolbar } from "../ui/toolbar/Toolbar";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useToolbarPopover } from "./useToolbarPopover";

interface AppProps {
    /** What opening learned of the saved workspace; see `restoreAutosave`. */
    restored?: Restored;
}

export const App: React.FC<AppProps> = ({ restored }) => {
    const toolbar = useToolbarPopover();

    useKeyboardShortcuts();
    const restoreDialog = useAutosave(restored);

    return (
        <div className="flex h-full flex-col bg-surface font-main text-accent select-none">
            <Header
                toggleRef={toolbar.toggleRef}
                toolbarId={toolbar.panelId}
                isToolbarOpen={toolbar.isOpen}
                onToggleToolbar={toolbar.toggle}
            />
            <main
                className={`flex flex-auto items-center justify-around 2xl:relative 2xl:justify-center ${EDITOR_AREA}`}
            >
                <Toolbar
                    ref={toolbar.panelRef}
                    id={toolbar.panelId}
                    isOpen={toolbar.isOpen}
                />
                <Canvas />
            </main>
            <Footer />
            {restoreDialog && <NoticeDialog {...restoreDialog} />}
        </div>
    );
};
