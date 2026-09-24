/** @file One row of the canvas: a run of cells, laid out by the surface's grid. */

import { memo } from "react";

import { CanvasCell } from "./CanvasCell";

interface CanvasRowProps {
    row: number;
    gridSize: number;
}

/**
 * The row is for React, not the layout: it is `display: contents`, so its
 * cells stay items of the surface's grid. Grouped this way, an update to one
 * cell walks its own row and the list of rows, 128 elements at 64×64, rather
 * than all 4096 cells of one flat list.
 */
export const CanvasRow = memo(function CanvasRow({
    row,
    gridSize,
}: CanvasRowProps) {
    const first = row * gridSize;
    const cells = [];

    for (let index = first; index < first + gridSize; index++) {
        cells.push(<CanvasCell key={index} index={index} />);
    }

    return <div className="contents">{cells}</div>;
});
