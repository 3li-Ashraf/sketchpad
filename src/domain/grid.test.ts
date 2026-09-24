import { describe, expect, it } from "vitest";

import { fc } from "../test/property";
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

    // Every cell of every grid up to 8×8, which covers odd and even sizes
    // and cells on, next to and away from each axis, under each symmetry.
    it("visits the cell first, then each distinct reflection once", () => {
        const symmetries = [NO_SYMMETRY, TOP_BOTTOM, LEFT_RIGHT, BOTH];
        const failures: string[] = [];

        for (let gridSize = 1; gridSize <= 8; gridSize++) {
            for (let index = 0; index < gridSize * gridSize; index++) {
                for (const symmetry of symmetries) {
                    const row = Math.floor(index / gridSize);
                    const column = index % gridSize;
                    const rows = new Set([row]);
                    const columns = new Set([column]);
                    if (symmetry.topBottom) rows.add(gridSize - 1 - row);
                    if (symmetry.leftRight) columns.add(gridSize - 1 - column);
                    const expected = [...rows].flatMap((r) =>
                        [...columns].map((c) => r * gridSize + c)
                    );

                    const visited = mirrored(index, gridSize, symmetry);

                    if (
                        visited[0] !== index ||
                        visited.length !== expected.length ||
                        ascending(visited).join() !== ascending(expected).join()
                    ) {
                        failures.push(
                            `${gridSize}×${gridSize} cell ${index} ${JSON.stringify(symmetry)}: ${visited.join()}`
                        );
                    }
                }
            }
        }

        expect(failures).toEqual([]);
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

    it("moves every cell of any size to (column, last - row)", () => {
        for (let gridSize = 1; gridSize <= 8; gridSize++) {
            const last = gridSize - 1;
            const colors = Array.from(
                { length: gridSize * gridSize },
                (_, index) => `${index}`
            );
            const expected = new Array<string>(colors.length);
            for (let row = 0; row < gridSize; row++) {
                for (let column = 0; column < gridSize; column++) {
                    expected[column * gridSize + (last - row)] =
                        colors[row * gridSize + column];
                }
            }

            expect(rotateClockwise(colors, gridSize)).toEqual(expected);
        }
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

    // Checked against a breadth-first search: another way to find the same
    // region, over grids of two or three colors, where regions have holes,
    // arms and islands.
    it("collects exactly the 4-connected region of the start's color", () => {
        const drawing = fc
            .record({
                gridSize: fc.integer({ min: 1, max: 8 }),
                colorCount: fc.integer({ min: 2, max: 3 }),
            })
            .chain(({ gridSize, colorCount }) =>
                fc.record({
                    gridSize: fc.constant(gridSize),
                    colors: fc.array(
                        fc.constantFrom(
                            ...["#000000", BLANK_CELL_COLOR, "#FF0000"].slice(
                                0,
                                colorCount
                            )
                        ),
                        {
                            minLength: gridSize * gridSize,
                            maxLength: gridSize * gridSize,
                        }
                    ),
                    start: fc.nat(gridSize * gridSize - 1),
                })
            );

        fc.assert(
            fc.property(drawing, ({ gridSize, colors, start }) => {
                const region = new Set([start]);
                for (const index of region) {
                    const row = Math.floor(index / gridSize);
                    const column = index % gridSize;
                    const neighbors = [
                        [row - 1, column],
                        [row + 1, column],
                        [row, column - 1],
                        [row, column + 1],
                    ];
                    for (const [r, c] of neighbors) {
                        const neighbor = r * gridSize + c;
                        const isOnGrid =
                            r >= 0 && r < gridSize && c >= 0 && c < gridSize;
                        if (isOnGrid && colors[neighbor] === colors[start]) {
                            region.add(neighbor);
                        }
                    }
                }

                expect(
                    ascending(collectFillRegion(colors, gridSize, start))
                ).toEqual(ascending([...region]));
            }),
            { numRuns: 300 }
        );
    });
});
