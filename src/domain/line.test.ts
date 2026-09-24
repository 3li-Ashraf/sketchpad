import { describe, expect, it } from "vitest";

import type { CellPosition } from "./grid";
import { traceLine } from "./line";

const trace = (from: CellPosition, to: CellPosition): CellPosition[] => {
    const visited: CellPosition[] = [];
    traceLine(from, to, (position) => visited.push(position));

    return visited;
};

describe("traceLine", () => {
    it("visits a single cell when both endpoints match", () => {
        expect(trace({ row: 2, column: 2 }, { row: 2, column: 2 })).toEqual([
            { row: 2, column: 2 },
        ]);
    });

    it("fills the gap along a horizontal run", () => {
        expect(trace({ row: 1, column: 0 }, { row: 1, column: 3 })).toEqual([
            { row: 1, column: 0 },
            { row: 1, column: 1 },
            { row: 1, column: 2 },
            { row: 1, column: 3 },
        ]);
    });

    it("fills the gap along a vertical run", () => {
        expect(trace({ row: 0, column: 4 }, { row: 3, column: 4 })).toEqual([
            { row: 0, column: 4 },
            { row: 1, column: 4 },
            { row: 2, column: 4 },
            { row: 3, column: 4 },
        ]);
    });

    it("steps diagonally one cell at a time", () => {
        expect(trace({ row: 0, column: 0 }, { row: 3, column: 3 })).toEqual([
            { row: 0, column: 0 },
            { row: 1, column: 1 },
            { row: 2, column: 2 },
            { row: 3, column: 3 },
        ]);
    });

    it("walks backwards when the endpoint is above and to the left", () => {
        expect(trace({ row: 2, column: 2 }, { row: 0, column: 0 })).toEqual([
            { row: 2, column: 2 },
            { row: 1, column: 1 },
            { row: 0, column: 0 },
        ]);
    });

    // Every pair of cells in a 12×12 grid, which is every slope and
    // direction a drag between two samples can have at that size.
    it("draws the nearest cells to the true line, one per step along it", () => {
        const size = 12;
        const failures: string[] = [];

        for (let a = 0; a < size * size; a++) {
            for (let b = 0; b < size * size; b++) {
                const from = { row: Math.floor(a / size), column: a % size };
                const to = { row: Math.floor(b / size), column: b % size };
                const visited = trace(from, to);
                const rows = to.row - from.row;
                const columns = to.column - from.column;
                const steps = Math.max(Math.abs(rows), Math.abs(columns));

                // One cell per step along the longer axis, so no cell is
                // visited twice and none is skipped.
                if (visited.length !== steps + 1) {
                    failures.push(`${a}→${b}: ${visited.length} cells`);
                }
                if (
                    visited[0].row !== from.row ||
                    visited[0].column !== from.column ||
                    visited.at(-1)?.row !== to.row ||
                    visited.at(-1)?.column !== to.column
                ) {
                    failures.push(`${a}→${b}: wrong endpoints`);
                }

                // Each cell is the one nearest the true line on the shorter
                // axis, half a cell away at most, where a tie falls.
                visited.forEach(({ row, column }, step) => {
                    const along = steps === 0 ? 0 : step / steps;
                    const offRow = Math.abs(row - (from.row + rows * along));
                    const offColumn = Math.abs(
                        column - (from.column + columns * along)
                    );

                    if (Math.max(offRow, offColumn) > 0.5) {
                        failures.push(`${a}→${b}: step ${step} off the line`);
                    }
                });
            }
        }

        expect(failures).toEqual([]);
    });
});
