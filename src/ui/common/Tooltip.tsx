/** @file The hover and focus label on toolbar controls. */

interface TooltipProps {
    label: string;
    children: React.ReactNode;
}

/**
 * Drawn entirely by the `.tooltip` rules in the stylesheet, from this
 * attribute: no portal, no positioning code. It wraps the control because a
 * disabled button emits no pointer events and could not raise a label itself.
 * Screen readers skip it, since each labelled control carries the same text as
 * its `aria-label`; the stylesheet gives the generated text empty alt text.
 */
export const Tooltip: React.FC<TooltipProps> = ({ label, children }) => (
    <span className="tooltip" data-tooltip={label}>
        {children}
    </span>
);
