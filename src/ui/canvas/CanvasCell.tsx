/** @file One cell of the canvas. It renders a color and nothing else. */

import { memo } from "react";
import { useSketchStore } from "../../state/sketchStore";

interface CanvasCellProps {
    index: number;
}

/**
 * Subscribes to one cell's color, so painting re-renders only the cells that
 * changed rather than the whole grid. That is why the store replaces `colors`
 * lazily: an untouched cell reads the same string and does not re-render.
 *
 * Cells carry no event listeners. The canvas resolves the pointer position
 * arithmetically, and grid lines are drawn by a rule on the container, so
 * nothing here has to react to either.
 */
export const CanvasCell = memo(function CanvasCell({ index }: CanvasCellProps) {
    const color = useSketchStore((state) => state.colors[index]);

    return <div style={{ backgroundColor: color }} />;
});
