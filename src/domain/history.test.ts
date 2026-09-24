import { describe, expect, it } from "vitest";

import { fc } from "../test/property";
import {
    appendEntry,
    diffColors,
    type HistoryEntry,
    MAX_HISTORY_ENTRIES,
    reapplyEntry,
    revertEntry,
} from "./history";

const entryOf = (index: number): HistoryEntry => [
    { index, before: "#FFFFFF", after: "#000000" },
];

describe("diffColors", () => {
    it("records only the cells that changed", () => {
        expect(
            diffColors(
                ["#FFFFFF", "#FFFFFF", "#FFFFFF"],
                ["#000000", "#FFFFFF", "#123456"]
            )
        ).toEqual([
            { index: 0, before: "#FFFFFF", after: "#000000" },
            { index: 2, before: "#FFFFFF", after: "#123456" },
        ]);
    });

    it("records nothing when the colors match", () => {
        expect(diffColors(["#FFFFFF"], ["#FFFFFF"])).toEqual([]);
    });

    it("refuses to diff grids of different sizes", () => {
        expect(diffColors(["#FFFFFF"], ["#FFFFFF", "#000000"])).toEqual([]);
    });
});

describe("appendEntry", () => {
    it("adds an entry without mutating the stack it was given", () => {
        const past: HistoryEntry[] = [entryOf(0)];
        const next = appendEntry(past, entryOf(1));

        expect(next).toHaveLength(2);
        expect(past).toHaveLength(1);
    });

    it("keeps the newest entries once the cap is reached", () => {
        let past: HistoryEntry[] = [];

        for (let step = 0; step < MAX_HISTORY_ENTRIES + 10; step++) {
            past = appendEntry(past, entryOf(step));
        }

        expect(past).toHaveLength(MAX_HISTORY_ENTRIES);
        expect(past.at(0)).toEqual(entryOf(10));
        expect(past.at(-1)).toEqual(entryOf(MAX_HISTORY_ENTRIES + 9));
    });
});

describe("revertEntry and reapplyEntry", () => {
    const colors = ["#000000", "#123456", "#FFFFFF"];
    const entry: HistoryEntry = [
        { index: 0, before: "#FFFFFF", after: "#000000" },
        { index: 1, before: "#FFFFFF", after: "#123456" },
    ];

    it("restores the colors the cells had before the step", () => {
        expect(revertEntry(colors, entry)).toEqual([
            "#FFFFFF",
            "#FFFFFF",
            "#FFFFFF",
        ]);
    });

    it("re-applies the colors the step painted", () => {
        expect(reapplyEntry(revertEntry(colors, entry), entry)).toEqual(colors);
    });

    it("returns a new array rather than editing the one it was given", () => {
        const before = [...colors];
        const reverted = revertEntry(colors, entry);

        expect(colors).toEqual(before);
        expect(reverted).not.toBe(colors);
    });
});

describe("a diff and its inverse", () => {
    const color = fc.constantFrom("#FFFFFF", "#000000", "#123456");

    /** Two snapshots of one grid, frozen so an edit to either would throw. */
    const snapshots = fc
        .nat(40)
        .chain((length) =>
            fc.tuple(
                fc.array(color, { minLength: length, maxLength: length }),
                fc.array(color, { minLength: length, maxLength: length })
            )
        )
        .map(([before, after]) => [
            Object.freeze(before),
            Object.freeze(after),
        ]);

    it("record exactly the cells that differ, in order, with both colors", () => {
        fc.assert(
            fc.property(snapshots, ([before, after]) => {
                const expected = before.flatMap((color, index) =>
                    color === after[index]
                        ? []
                        : [{ index, before: color, after: after[index] }]
                );

                expect(diffColors(before, after)).toEqual(expected);
            })
        );
    });

    it("reapply to the new grid and revert to the old", () => {
        fc.assert(
            fc.property(snapshots, ([before, after]) => {
                const entry = diffColors(before, after);

                expect(reapplyEntry(before, entry)).toEqual(after);
                expect(revertEntry(after, entry)).toEqual(before);
            })
        );
    });
});
