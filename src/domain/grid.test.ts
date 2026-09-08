/**
 * @file Covers `domain/grid`: sizing, row-major indexing, mirroring and flood
 * fill.
 */

import { describe, expect, it } from "vitest";
import {
    BLANK_CELL_COLOR,
    clampGridSize,
    collectFillRegion,
    createBlankGrid,
    isSupportedGridSize,
    MAX_GRID_SIZE,
    MIN_GRID_SIZE,
    forEachMirroredCell,
    toCellIndex,
} from "./grid";

// `collectFillRegion` leaves its result in an unspecified order, so assertions
// on its contents sort first. `forEachMirroredCell` does promise an order, so
// `mirrored` keeps the one it visited in.
const ascending = (indices: number[]) => [...indices].sort((a, b) => a - b);

const mirrored = (
    index: number,
    gridSize: number,
    mirrorX: boolean,
    mirrorY: boolean
): number[] => {
    const visited: number[] = [];
    forEachMirroredCell(index, gridSize, mirrorX, mirrorY, (at) =>
        visited.push(at)
    );

    return visited;
};

describe("createBlankGrid", () => {
    it("creates one blank cell per grid square", () => {
        const colors = createBlankGrid(4);

        expect(colors).toHaveLength(16);
        expect(colors.every((color) => color === BLANK_CELL_COLOR)).toBe(true);
    });
});

describe("clampGridSize", () => {
    it("keeps a size that is already in range", () => {
        expect(clampGridSize(32)).toBe(32);
    });

    it("clamps to the supported range", () => {
        expect(clampGridSize(999)).toBe(MAX_GRID_SIZE);
        expect(clampGridSize(-4)).toBe(MIN_GRID_SIZE);
    });

    it("rounds a fractional size, which is what a slider drag can produce", () => {
        expect(clampGridSize(7.4)).toBe(7);
        expect(clampGridSize(7.6)).toBe(8);
    });
});

describe("isSupportedGridSize", () => {
    it("accepts whole sizes across the supported range", () => {
        expect(isSupportedGridSize(MIN_GRID_SIZE)).toBe(true);
        expect(isSupportedGridSize(MAX_GRID_SIZE)).toBe(true);
    });

    it("rejects sizes outside the range or not a whole number", () => {
        expect(isSupportedGridSize(MIN_GRID_SIZE - 1)).toBe(false);
        expect(isSupportedGridSize(MAX_GRID_SIZE + 1)).toBe(false);
        expect(isSupportedGridSize(8.5)).toBe(false);
        expect(isSupportedGridSize(NaN)).toBe(false);
    });
});

describe("toCellIndex", () => {
    it("indexes cells row-major", () => {
        expect(toCellIndex({ row: 0, column: 0 }, 8)).toBe(0);
        expect(toCellIndex({ row: 0, column: 7 }, 8)).toBe(7);
        expect(toCellIndex({ row: 1, column: 0 }, 8)).toBe(8);
        expect(toCellIndex({ row: 2, column: 3 }, 8)).toBe(19);
    });

    it("numbers every cell of a grid exactly once", () => {
        const gridSize = 7;
        const indices = new Set<number>();

        for (let row = 0; row < gridSize; row++) {
            for (let column = 0; column < gridSize; column++) {
                indices.add(toCellIndex({ row, column }, gridSize));
            }
        }

        expect(indices.size).toBe(gridSize * gridSize);
        expect(Math.min(...indices)).toBe(0);
        expect(Math.max(...indices)).toBe(gridSize * gridSize - 1);
    });
});

describe("forEachMirroredCell", () => {
    const gridSize = 4;

    it("visits only the cell when mirroring is off", () => {
        expect(mirrored(5, gridSize, false, false)).toEqual([5]);
    });

    it("reflects across the horizontal axis for mirrorX", () => {
        expect(ascending(mirrored(5, gridSize, true, false))).toEqual([5, 9]);
    });

    it("reflects across the vertical axis for mirrorY", () => {
        expect(ascending(mirrored(5, gridSize, false, true))).toEqual([5, 6]);
    });

    it("adds the diagonal opposite when both axes mirror", () => {
        expect(ascending(mirrored(5, gridSize, true, true))).toEqual([5, 6, 9, 10]);
    });

    it("visits the cell itself first, before any reflection", () => {
        expect(mirrored(5, gridSize, true, true).at(0)).toBe(5);
    });

    it("de-duplicates a cell that lies on both axes of symmetry", () => {
        expect(mirrored(4, 3, true, true)).toEqual([4]);
    });

    it("de-duplicates a cell that lies on one axis of symmetry", () => {
        expect(ascending(mirrored(1, 3, true, true))).toEqual([1, 7]);
        expect(mirrored(1, 3, false, true)).toEqual([1]);

        expect(ascending(mirrored(3, 3, true, true))).toEqual([3, 5]);
        expect(mirrored(3, 3, true, false)).toEqual([3]);
    });

    it("never visits the same cell twice, for any cell of any grid", () => {
        for (const gridSize of [1, 2, 3, 4, 5]) {
            for (let index = 0; index < gridSize * gridSize; index++) {
                const indices = mirrored(index, gridSize, true, true);

                expect(new Set(indices).size).toBe(indices.length);
                expect(indices).toContain(index);
                expect(
                    indices.every((at) => at >= 0 && at < gridSize * gridSize)
                ).toBe(true);
            }
        }
    });

    it("reflects a cell onto itself only where an axis of symmetry runs", () => {
        // An odd grid has a middle row and column; an even one has neither, so
        // every cell of an even grid has the full set of reflections.
        for (let index = 0; index < 16; index++) {
            expect(mirrored(index, 4, true, true)).toHaveLength(4);
        }
    });
});

describe("collectFillRegion", () => {
    const gridSize = 3;

    it("collects the whole grid when it is one color", () => {
        const colors = createBlankGrid(gridSize);

        expect(collectFillRegion(colors, gridSize, 0)).toHaveLength(9);
    });

    it("stops at cells of a different color", () => {
        const colors = createBlankGrid(gridSize);
        colors[1] = "#000000";
        colors[4] = "#000000";
        colors[7] = "#000000";

        expect(ascending(collectFillRegion(colors, gridSize, 0))).toEqual([0, 3, 6]);
    });

    it("does not leak through diagonal neighbors", () => {
        const colors = createBlankGrid(2);
        colors[1] = "#000000";
        colors[2] = "#000000";

        expect(collectFillRegion(colors, 2, 0)).toEqual([0]);
    });

    it("does not wrap around row edges", () => {
        const colors = createBlankGrid(gridSize);
        colors[3] = "#000000";
        colors[4] = "#000000";
        colors[5] = "#000000";

        expect(ascending(collectFillRegion(colors, gridSize, 2))).toEqual([0, 1, 2]);
    });

    it("returns nothing for an out-of-range start", () => {
        expect(collectFillRegion(createBlankGrid(2), 2, 99)).toEqual([]);
        expect(collectFillRegion(createBlankGrid(2), 2, -1)).toEqual([]);
    });

    it("floods the largest supported grid without overflowing the stack", () => {
        const colors = createBlankGrid(MAX_GRID_SIZE);

        expect(collectFillRegion(colors, MAX_GRID_SIZE, 0)).toHaveLength(
            MAX_GRID_SIZE * MAX_GRID_SIZE
        );
    });
});
