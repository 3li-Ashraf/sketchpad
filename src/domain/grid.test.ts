import { describe, expect, it } from "vitest";

import {
    BLANK_CELL_COLOR,
    clampGridSize,
    collectFillRegion,
    createBlankGrid,
    forEachMirroredCell,
    isBlankGrid,
    isCellIndex,
    isSupportedGridSize,
    isValidSketch,
    MAX_GRID_SIZE,
    MIN_GRID_SIZE,
    NO_SYMMETRY,
    rotateClockwise,
    type Symmetry,
    toCellIndex,
} from "./grid";

// `collectFillRegion` promises no order, so its results are sorted before
// comparing; `forEachMirroredCell` does, so `mirrored` keeps it.
const ascending = (indices: number[]) => [...indices].sort((a, b) => a - b);

const TOP_BOTTOM: Symmetry = { topBottom: true, leftRight: false };
const LEFT_RIGHT: Symmetry = { topBottom: false, leftRight: true };
const BOTH: Symmetry = { topBottom: true, leftRight: true };

const mirrored = (
    index: number,
    gridSize: number,
    symmetry: Symmetry
): number[] => {
    const visited: number[] = [];
    forEachMirroredCell(index, gridSize, symmetry, (at) => visited.push(at));

    return visited;
};

describe("createBlankGrid", () => {
    it("creates one blank cell per grid square", () => {
        const colors = createBlankGrid(4);

        expect(colors).toHaveLength(16);
        expect(colors.every((color) => color === BLANK_CELL_COLOR)).toBe(true);
    });
});

describe("isBlankGrid", () => {
    it("is true for a grid nothing has been painted on", () => {
        expect(isBlankGrid(createBlankGrid(4))).toBe(true);
    });

    it("is false once any cell holds another color, even the last", () => {
        const colors = createBlankGrid(4);
        colors[15] = "#000000";

        expect(isBlankGrid(colors)).toBe(false);
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

describe("isValidSketch", () => {
    it("accepts a supported size with one valid color per cell", () => {
        expect(isValidSketch({ gridSize: 2, colors: createBlankGrid(2) })).toBe(
            true
        );
    });

    it.each([
        ["too few colors", { gridSize: 2, colors: createBlankGrid(1) }],
        ["too many colors", { gridSize: 1, colors: createBlankGrid(2) }],
        ["a size below the range", { gridSize: 0, colors: [] }],
        [
            "a size above the range",
            { gridSize: MAX_GRID_SIZE + 1, colors: createBlankGrid(65) },
        ],
        ["a fractional size", { gridSize: 1.5, colors: createBlankGrid(1) }],
        ["a color that is not one", { gridSize: 1, colors: ["red"] }],
        ["a lowercase color", { gridSize: 1, colors: ["#3ea6ff"] }],
        ["a hole in the colors", { gridSize: 1, colors: new Array<string>(1) }],
    ])("refuses %s", (_, sketch) => {
        expect(isValidSketch(sketch)).toBe(false);
    });
});

describe("isCellIndex", () => {
    it("accepts every whole index inside the grid", () => {
        expect(isCellIndex(0, 4)).toBe(true);
        expect(isCellIndex(3, 4)).toBe(true);
    });

    it.each([-1, 4, 1.5, Number.NaN, Infinity])("refuses %d", (index) => {
        expect(isCellIndex(index, 4)).toBe(false);
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

    it("visits only the cell without symmetry", () => {
        expect(mirrored(5, gridSize, NO_SYMMETRY)).toEqual([5]);
    });

    it("reflects between top and bottom, swapping rows", () => {
        expect(ascending(mirrored(5, gridSize, TOP_BOTTOM))).toEqual([5, 9]);
    });

    it("reflects between left and right, swapping columns", () => {
        expect(ascending(mirrored(5, gridSize, LEFT_RIGHT))).toEqual([5, 6]);
    });

    it("adds the diagonal opposite with both symmetries", () => {
        expect(ascending(mirrored(5, gridSize, BOTH))).toEqual([5, 6, 9, 10]);
    });

    it("visits the cell itself first, before any reflection", () => {
        expect(mirrored(5, gridSize, BOTH).at(0)).toBe(5);
    });

    it("de-duplicates a cell that lies on both axes of symmetry", () => {
        expect(mirrored(4, 3, BOTH)).toEqual([4]);
    });

    it("de-duplicates a cell that lies on one axis of symmetry", () => {
        expect(ascending(mirrored(1, 3, BOTH))).toEqual([1, 7]);
        expect(mirrored(1, 3, LEFT_RIGHT)).toEqual([1]);

        expect(ascending(mirrored(3, 3, BOTH))).toEqual([3, 5]);
        expect(mirrored(3, 3, TOP_BOTTOM)).toEqual([3]);
    });

    it("never visits the same cell twice, for any cell of any grid", () => {
        for (const gridSize of [1, 2, 3, 4, 5]) {
            for (let index = 0; index < gridSize * gridSize; index++) {
                const indices = mirrored(index, gridSize, BOTH);

                expect(new Set(indices).size).toBe(indices.length);
                expect(indices).toContain(index);
                expect(
                    indices.every((at) => at >= 0 && at < gridSize * gridSize)
                ).toBe(true);
            }
        }
    });

    it("gives every cell of an even grid all four reflections", () => {
        // An odd grid has a middle row and column; an even one has neither, so
        // no cell of it lies on an axis of symmetry.
        for (let index = 0; index < 16; index++) {
            expect(mirrored(index, 4, BOTH)).toHaveLength(4);
        }
    });
});

describe("rotateClockwise", () => {
    it("turns the top row into the right column", () => {
        // prettier-ignore
        expect(rotateClockwise([
            "a", "b", "c",
            "d", "e", "f",
            "g", "h", "i",
        ], 3)).toEqual([
            "g", "d", "a",
            "h", "e", "b",
            "i", "f", "c",
        ]);
    });

    it("comes back to where it started after four turns", () => {
        const colors = Array.from({ length: 16 }, (_, index) => `${index}`);

        const turns = [colors];
        for (let turn = 0; turn < 4; turn++) {
            turns.push(rotateClockwise(turns[turn], 4));
        }

        expect(turns.slice(1, 4)).not.toContainEqual(colors);
        expect(turns[4]).toEqual(colors);
    });

    it("leaves the colors it was given alone", () => {
        const colors = ["a", "b", "c", "d"];

        rotateClockwise(colors, 2);

        expect(colors).toEqual(["a", "b", "c", "d"]);
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

        expect(ascending(collectFillRegion(colors, gridSize, 0))).toEqual([
            0, 3, 6,
        ]);
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

        expect(ascending(collectFillRegion(colors, gridSize, 2))).toEqual([
            0, 1, 2,
        ]);
    });

    it.each([99, -1, 1.5])("returns nothing for a start of %d", (start) => {
        expect(collectFillRegion(createBlankGrid(2), 2, start)).toEqual([]);
    });

    it("floods the largest supported grid without overflowing the stack", () => {
        const colors = createBlankGrid(MAX_GRID_SIZE);

        expect(collectFillRegion(colors, MAX_GRID_SIZE, 0)).toHaveLength(
            MAX_GRID_SIZE * MAX_GRID_SIZE
        );
    });
});
