/**
 * @file Grid geometry and the cell-level rules of a sketch: sizes, indexing,
 * symmetry, rotation and flood fill.
 */

import { isHexColor } from "./color";

export const MIN_GRID_SIZE = 1;
export const MAX_GRID_SIZE = 64;
export const DEFAULT_GRID_SIZE = 32;

/**
 * The color of an unpainted cell. It is also what the eraser paints and what
 * clearing restores, so changing it changes those too.
 */
export const BLANK_CELL_COLOR = "#FFFFFF";

/**
 * The artwork on its own: `colors` is row-major, one uppercase `#RRGGBB` per
 * cell. `isValidSketch` checks that, wherever a sketch enters or leaves the
 * app. It is read-only because it is replaced, never edited, which is what
 * lets a cell tell by identity that nothing changed.
 */
export interface Sketch {
    readonly gridSize: number;
    readonly colors: readonly string[];
}

/**
 * A cell by row and column, in that order and never as (x, y). The whole
 * repository follows the convention, tests included.
 */
export interface CellPosition {
    row: number;
    column: number;
}

/** Which reflections a stroke paints besides the cell itself. */
export interface Symmetry {
    /** Across the horizontal center line, so rows swap. */
    readonly topBottom: boolean;
    /** Across the vertical center line, so columns swap. */
    readonly leftRight: boolean;
}

export const NO_SYMMETRY: Symmetry = { topBottom: false, leftRight: false };

/** Coerces any number into the supported range, rounding a fraction. */
export const clampGridSize = (gridSize: number): number =>
    Math.min(MAX_GRID_SIZE, Math.max(MIN_GRID_SIZE, Math.round(gridSize)));

/** Rejects rather than corrects, which is what a decoder wants. */
export const isSupportedGridSize = (gridSize: number): boolean =>
    Number.isInteger(gridSize) &&
    gridSize >= MIN_GRID_SIZE &&
    gridSize <= MAX_GRID_SIZE;

/**
 * Whether a sketch holds together: a supported size and exactly one valid
 * color per cell. A loop rather than `every`, which skips the holes of a
 * sparse array and would pass one.
 */
export const isValidSketch = ({ gridSize, colors }: Sketch): boolean => {
    if (!isSupportedGridSize(gridSize)) return false;
    if (colors.length !== gridSize * gridSize) return false;

    for (let index = 0; index < colors.length; index++) {
        if (!isHexColor(colors[index])) return false;
    }

    return true;
};

/** Whether an index names a cell: a whole number inside the grid. */
export const isCellIndex = (index: number, cellCount: number): boolean =>
    Number.isInteger(index) && index >= 0 && index < cellCount;

export const createBlankGrid = (gridSize: number): string[] =>
    new Array<string>(gridSize * gridSize).fill(BLANK_CELL_COLOR);

export const isBlankGrid = (colors: readonly string[]): boolean =>
    colors.every((color) => color === BLANK_CELL_COLOR);

export const toCellIndex = (
    { row, column }: CellPosition,
    gridSize: number
): number => row * gridSize + column;

/**
 * Visits a cell, then each of its reflections. A cell on an axis of symmetry
 * is its own reflection there and is not visited twice; `paintCells` relies on
 * that and does no de-duplicating of its own.
 *
 * A visitor rather than a returned array because this runs for every cell of
 * every stroke, and it should allocate nothing.
 */
export const forEachMirroredCell = (
    index: number,
    gridSize: number,
    { topBottom, leftRight }: Symmetry,
    visit: (index: number) => void
): void => {
    visit(index);
    if (!topBottom && !leftRight) return;

    const row = Math.floor(index / gridSize);
    const column = index % gridSize;
    const mirroredRow = gridSize - 1 - row;
    const mirroredColumn = gridSize - 1 - column;

    const reflectsRow = topBottom && mirroredRow !== row;
    const reflectsColumn = leftRight && mirroredColumn !== column;

    if (reflectsColumn) visit(row * gridSize + mirroredColumn);
    if (reflectsRow) visit(mirroredRow * gridSize + column);
    if (reflectsRow && reflectsColumn) {
        visit(mirroredRow * gridSize + mirroredColumn);
    }
};

/**
 * The colors turned a quarter turn clockwise: the top row becomes the right
 * column, so the cell at (row, column) moves to (column, last - row).
 */
export const rotateClockwise = (
    colors: readonly string[],
    gridSize: number
): string[] => {
    const rotated = new Array<string>(colors.length);
    const last = gridSize - 1;

    for (let row = 0; row < gridSize; row++) {
        for (let column = 0; column < gridSize; column++) {
            rotated[column * gridSize + (last - row)] =
                colors[row * gridSize + column];
        }
    }

    return rotated;
};

/**
 * Every cell reachable from `start` through 4-connected neighbors of the same
 * color, in no particular order; empty when `start` is off the grid.
 *
 * Iterative because the recursive form overflows the stack on a blank 64×64
 * grid, 4096 cells deep.
 */
export const collectFillRegion = (
    colors: readonly string[],
    gridSize: number,
    start: number
): number[] => {
    if (!isCellIndex(start, colors.length)) return [];

    const targetColor = colors[start];
    const visited = new Uint8Array(colors.length);
    const pending = [start];
    const region: number[] = [];
    visited[start] = 1;

    const visit = (neighbor: number) => {
        if (visited[neighbor] || colors[neighbor] !== targetColor) return;

        visited[neighbor] = 1;
        pending.push(neighbor);
    };

    while (pending.length > 0) {
        const index = pending.pop()!;
        region.push(index);

        const column = index % gridSize;

        if (index >= gridSize) visit(index - gridSize);
        if (index + gridSize < colors.length) visit(index + gridSize);
        if (column > 0) visit(index - 1);
        if (column < gridSize - 1) visit(index + 1);
    }

    return region;
};
