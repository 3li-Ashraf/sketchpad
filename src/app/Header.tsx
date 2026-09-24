/**
 * @file The page title, and the button that opens the settings panel on narrow
 * screens.
 */

import { MdSettings } from "react-icons/md";

interface HeaderProps {
    toggleRef: React.Ref<HTMLButtonElement>;
    /** The id of the panel the toggle opens. */
    toolbarId: string;
    isToolbarOpen: boolean;
    onToggleToolbar: () => void;
}

export const Header: React.FC<HeaderProps> = ({
    toggleRef,
    toolbarId,
    isToolbarOpen,
    onToggleToolbar,
}) => (
    <header className="relative py-7 text-center font-pixeled text-2xl sm:text-4xl md:static lg:text-5xl">
        <button
            ref={toggleRef}
            type="button"
            aria-label="Settings"
            aria-controls={toolbarId}
            aria-expanded={isToolbarOpen}
            onClick={onToggleToolbar}
            className="control absolute left-[5vw] h-8 w-8 sm:h-10 sm:w-10 md:hidden"
        >
            {/* Only for users who have not asked for less motion: it never
                stops, which reduced motion exists to prevent. */}
            <MdSettings
                className={
                    isToolbarOpen
                        ? "motion-safe:animate-spin"
                        : "motion-safe:animate-spin-slow"
                }
            />
        </button>
        <h1>Sketchpad</h1>
    </header>
);
