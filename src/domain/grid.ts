/**
 * @file Grid geometry and the cell-level rules of a sketch: sizes, indexing,
 * mirroring and flood fill. Pure: no DOM, no React, no store.
 */

export const MIN_GRID_SIZE = 1;
export const MAX_GRID_SIZE = 64;
export const DEFAULT_GRID_SIZE = 32;

/**
 * The color of an unpainted cell. It is also what the eraser paints and what
 * `clearGrid` restores, so changing it changes those, not just the look of a
 * fresh grid.
 */
export const BLANK_CELL_COLOR = "#FFFFFF";

export interface Sketch {
    gridSize: number;
    /**
     * Cell colors, row-major, exactly `gridSize * gridSize` entries. Nothing
     * checks this at runtime, so every producer has to uphold it; `parseSketch`
     * is where it is enforced for data arriving from outside.
     */
    colors: string[];
}

/**
 * A cell addressed by row and column — in that order, never as (x, y). The whole
 * repository follows that convention, in tests included, so a pair read the
 * other way round names the transposed cell wherever the two differ.
 */
export interface CellPosition {
    row: number;
    column: number;
}

/** Coerces any number into the supported range, rounding a fractional size. */
export const clampGridSize = (gridSize: number): number =>
    Math.min(MAX_GRID_SIZE, Math.max(MIN_GRID_SIZE, Math.round(gridSize)));

/**
 * Whether a size is one this app can render. Unlike `clampGridSize`, this
 * rejects rather than corrects, which is what a decoder wants for a size read
 * out of a file.
 */
export const isSupportedGridSize = (gridSize: number): boolean =>
    Number.isInteger(gridSize) &&
    gridSize >= MIN_GRID_SIZE &&
    gridSize <= MAX_GRID_SIZE;

export const createBlankGrid = (gridSize: number): string[] =>
    new Array<string>(gridSize * gridSize).fill(BLANK_CELL_COLOR);

export const toCellIndex = (
    { row, column }: CellPosition,
    gridSize: number
): number => row * gridSize + column;

/**
 * Visits a cell and each of its reflections, in that order. `mirrorX` reflects
 * across the horizontal axis and so swaps rows; `mirrorY` reflects across the
 * vertical axis and so swaps columns; both together also yield the diagonally
 * opposite cell.
 *
 * A cell lying on an axis of symmetry is its own reflection, so a reflection
 * landing back on a cell already visited is skipped. Callers rely on that:
 * `paintCells` does no de-duplicating of its own, and a repeated index would
 * paint and record the same cell twice.
 *
 * A visitor rather than a returned array because this runs once per cell of
 * every stroke — a single fast drag traces dozens of cells per pointer event —
 * and the array would be built and discarded every time. The caller passes one
 * closure for a whole call and this allocates nothing at all.
 */
export const forEachMirroredCell = (
    index: number,
    gridSize: number,
    mirrorX: boolean,
    mirrorY: boolean,
    visit: (index: number) => void
): void => {
    visit(index);
    if (!mirrorX && !mirrorY) return;

    const row = Math.floor(index / gridSize);
    const column = index % gridSize;
    const mirroredRow = gridSize - 1 - row;
    const mirroredColumn = gridSize - 1 - column;

    const reflectsRow = mirrorX && mirroredRow !== row;
    const reflectsColumn = mirrorY && mirroredColumn !== column;

    if (reflectsColumn) visit(row * gridSize + mirroredColumn);
    if (reflectsRow) visit(mirroredRow * gridSize + column);
    if (reflectsRow && reflectsColumn) {
        visit(mirroredRow * gridSize + mirroredColumn);
    }
};

/**
 * Every cell reachable from `start` through 4-connected neighbors of the same
 * color. Returns nothing when `start` is outside the grid.
 *
 * The search is iterative rather than recursive because the recursive form
 * overflows the stack on a large single-color grid — a blank 64x64 canvas is
 * 4096 cells deep.
 */
export const collectFillRegion = (
    colors: readonly string[],
    gridSize: number,
    start: number
): number[] => {
    const targetColor = colors[start];
    if (targetColor === undefined) return [];

    const visited = new Uint8Array(colors.length);
    const pending = [start];
    const region: number[] = [];
    visited[start] = 1;

    // Neighbors are tested through this closure rather than gathered into an
    // array per cell, so a flood allocates nothing beyond the region it returns.
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
