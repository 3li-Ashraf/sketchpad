/**
 * @file Bresenham line tracing between two cells. Pure: no DOM, no React, no
 * store.
 */

import type { CellPosition } from "./grid";

/**
 * Walks the cells along the line from `from` to `to`, visiting both endpoints
 * and moving at most one cell on either axis per step.
 *
 * This exists because pointer events are sampled far apart during a fast drag.
 * Painting only the sampled cells would leave a dotted trail, so the cells
 * between two consecutive samples are filled in.
 */
export const traceLine = (
    from: CellPosition,
    to: CellPosition,
    visit: (position: CellPosition) => void
): void => {
    const deltaX = Math.abs(to.column - from.column);
    const deltaY = Math.abs(to.row - from.row);
    const stepX = from.column < to.column ? 1 : -1;
    const stepY = from.row < to.row ? 1 : -1;

    let error = deltaX - deltaY;
    let { row, column } = from;

    for (;;) {
        visit({ row, column });
        if (row === to.row && column === to.column) return;

        const doubledError = 2 * error;
        if (doubledError > -deltaY) {
            error -= deltaY;
            column += stepX;
        }
        if (doubledError < deltaX) {
            error += deltaX;
            row += stepY;
        }
    }
};
