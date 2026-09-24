/** @file One cell of the canvas. It renders a color and nothing else. */

import { memo } from "react";

import { useSketchStore } from "../../state/sketchStore";

interface CanvasCellProps {
    index: number;
}

/**
 * Subscribes to its own color only, so a stroke re-renders just the cells it
 * changed. Cells carry no listeners: the canvas works out which cell is under
 * the pointer, and grid lines come from a rule on the container.
 */
export const CanvasCell = memo(function CanvasCell({ index }: CanvasCellProps) {
    const color = useSketchStore((state) => state.document.colors[index]);

    return <div style={{ backgroundColor: color }} />;
});
