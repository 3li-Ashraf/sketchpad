/**
 * @file The hover/focus label shared by the toolbar controls. It contributes an
 * attribute and a class and nothing else — the label is drawn by the stylesheet.
 */

interface TooltipProps {
    label: string;
    children: React.ReactNode;
}

/**
 * A label drawn entirely in CSS, by the `.tooltip` rules that read this
 * `data-tooltip` attribute. There is no portal, no positioning code and no
 * JavaScript; the stylesheet also carries the reasoning for each trigger, which
 * is hover on pointer devices only and keyboard focus.
 *
 * The label hangs on a wrapper rather than on the control itself because a
 * disabled button emits no pointer events and so could never raise its own.
 *
 * It is deliberately invisible to assistive technology: every control that uses
 * a tooltip already carries the same text as its `aria-label`, and announcing it
 * twice would be noise.
 */
export const Tooltip: React.FC<TooltipProps> = ({ label, children }) => (
    <span className="tooltip" data-tooltip={label}>
        {children}
    </span>
);
