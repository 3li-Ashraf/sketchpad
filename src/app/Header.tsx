/**
 * @file The page title, and the button that opens the toolbar on narrow screens.
 * The open state itself belongs to `App`.
 */

import { MdSettings } from "react-icons/md";

interface HeaderProps {
    ref?: React.Ref<HTMLButtonElement>;
    isToolbarOpen: boolean;
    onToggleToolbar: () => void;
}

export const Header: React.FC<HeaderProps> = ({
    ref,
    isToolbarOpen,
    onToggleToolbar,
}) => (
    <header className="relative md:static text-2xl sm:text-4xl lg:text-5xl text-center font-pixeled py-7">
        <button
            ref={ref}
            type="button"
            aria-label="Settings"
            aria-expanded={isToolbarOpen}
            data-active={isToolbarOpen}
            onClick={onToggleToolbar}
            className="toolbar-control md:hidden absolute left-[5vw] w-8 h-8 sm:w-10 sm:h-10"
        >
            <MdSettings
                className={isToolbarOpen ? "animate-spin" : "animate-spin-slow"}
            />
        </button>
        <h1>Sketchpad</h1>
    </header>
);
