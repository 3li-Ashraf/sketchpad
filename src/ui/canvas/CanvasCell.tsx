/** @file One cell of the canvas. It renders a color and nothing else. */

import { memo } from "react";

import { useCellColor } from "./useCellColor";

interface CanvasCellProps {
    index: number;
}

/**
 * Re-renders only when its own color changes (`useCellColor`). Cells carry no
 * listeners: the canvas works out which cell is under the pointer, and grid
 * lines come from a rule on the surface.
 */
export const CanvasCell = memo(function CanvasCell({ index }: CanvasCellProps) {
    const color = useCellColor(index);

    return <div style={{ backgroundColor: color }} />;
});
