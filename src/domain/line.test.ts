/**
 * @file Covers `domain/line`: that a traced line is connected and hits both
 * endpoints.
 */

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

    it("visits both endpoints and never jumps, whatever the slope", () => {
        const endpoints: [CellPosition, CellPosition][] = [
            [{ row: 0, column: 0 }, { row: 2, column: 7 }],
            [{ row: 5, column: 1 }, { row: 0, column: 9 }],
            [{ row: 9, column: 9 }, { row: 0, column: 4 }],
            [{ row: 3, column: 8 }, { row: 8, column: 0 }],
        ];

        for (const [from, to] of endpoints) {
            const visited = trace(from, to);

            expect(visited.at(0)).toEqual(from);
            expect(visited.at(-1)).toEqual(to);

            for (let step = 1; step < visited.length; step++) {
                const rowStep = Math.abs(visited[step].row - visited[step - 1].row);
                const columnStep = Math.abs(
                    visited[step].column - visited[step - 1].column
                );

                expect(Math.max(rowStep, columnStep)).toBe(1);
            }
        }
    });

    it("never revisits a cell", () => {
        const visited = trace({ row: 5, column: 1 }, { row: 0, column: 9 });
        const unique = new Set(visited.map(({ row, column }) => `${row},${column}`));

        expect(unique.size).toBe(visited.length);
    });
});
