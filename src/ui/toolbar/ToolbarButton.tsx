/**
 * @file The square icon button every toolbar control is built from. It has no
 * behaviour of its own beyond reporting its state.
 */

import { Tooltip } from "../common/Tooltip";

interface ToolbarButtonProps {
    label: string;
    children: React.ReactNode;
    onClick: () => void;
    /**
     * Set for tools and toggles, which stay visibly pressed; omit for one-shot
     * actions, which flash on press through the `active:` variant instead.
     * Omitting it also drops `aria-pressed`, so a one-shot action is not
     * announced as a toggle.
     */
    isActive?: boolean;
    isDisabled?: boolean;
}

export const ToolbarButton: React.FC<ToolbarButtonProps> = ({
    label,
    children,
    onClick,
    isActive,
    isDisabled,
}) => (
    <Tooltip label={label}>
        <button
            type="button"
            aria-label={label}
            aria-pressed={isActive}
            data-active={isActive}
            disabled={isDisabled}
            onClick={onClick}
            className="toolbar-control text-xl"
        >
            {children}
        </button>
    </Tooltip>
);
