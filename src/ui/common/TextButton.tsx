/**
 * @file A button with a text label, in the look every control shares: the
 * dialogs' buttons, and the error screen's.
 */

interface TextButtonProps {
    children: React.ReactNode;
    onClick: () => void;
}

/**
 * The shared control stretched to fit its label. Every text button looks
 * alike, so in a dialog neither reads as the default, and `hover:` applies
 * only on devices that can hover, so a tap does not leave one painted.
 */
export const TextButton: React.FC<TextButtonProps> = ({
    children,
    onClick,
}) => (
    <button
        type="button"
        onClick={onClick}
        className="control h-auto w-auto px-4 py-2 text-sm font-medium hover:bg-accent hover:text-surface"
    >
        {children}
    </button>
);
