/**
 * @file The autosave record: how a workspace is kept, and that nothing read
 * back is trusted before it is checked. No storage is involved; a record is
 * copied the way storage copies it, with `structuredClone`.
 */

import { describe, expect, it } from "vitest";

import { type HistoryEntry, MAX_HISTORY_ENTRIES } from "../domain/history";
import { DRAWING_TOOLS } from "../domain/tools";
import type { Workspace } from "../domain/workspace";
import { fc } from "../test/property";
import { smallWorkspace as workspace } from "../test/sketchFixtures";
import {
    AUTOSAVE_VERSION,
    type AutosaveRecord,
    decodeAutosave,
    encodeAutosave,
} from "./autosaveRecord";

const PEN = "#123456";

/** The record as storage hands it back: a copy, not the encoder's objects. */
const stored = (): AutosaveRecord =>
    structuredClone(encodeAutosave(workspace()));

/** A stored step, from plain numbers. */
const step = (cells: number[], before: number[], after: number[]) => ({
    cells: Uint16Array.from(cells),
    before: Uint32Array.from(before),
    after: Uint32Array.from(after),
});

const STEP = step([0], [0xffffff], [0x123456]);

// What storage might hold instead: the record with one part replaced.
const base = stored();

const withDocument = (part: Record<string, unknown>) => ({
    ...base,
    document: { ...base.document, ...part },
});

const withSettings = (part: Record<string, unknown>) => ({
    ...base,
    settings: { ...base.settings, ...part },
});

const withStep = (one: unknown) => withDocument({ undoStack: [one] });

describe("the autosave record", () => {
    it("holds each undo step as typed arrays, which copy at once", () => {
        const [redone] = encodeAutosave(workspace()).document.redoStack;

        expect(redone).toEqual(
            step([1, 3], [0xffffff, 0xffffff], [0xabcdef, 0xabcdef])
        );
    });

    it("converts a step once, however many saves include it", () => {
        const saved = workspace();

        expect(encodeAutosave(saved).document.undoStack[0]).toBe(
            encodeAutosave(saved).document.undoStack[0]
        );
    });

    it("saves a restored step as the arrays it was read from", () => {
        const record = stored();
        const restored = decodeAutosave(record)!;

        expect(encodeAutosave(restored).document.undoStack[0].cells).toBe(
            record.document.undoStack[0].cells
        );
    });

    it("keeps nothing it did not check", () => {
        const record = {
            ...withSettings({ askBefore: { resize: false } }),
            document: {
                ...base.document,
                undoStack: [{ ...STEP, note: "ignored" }],
            },
            extra: "ignored",
        };

        expect(decodeAutosave(record)).toEqual(workspace());
    });

    it.each<[string, unknown]>([
        ["nothing at all", null],
        ["a string", "workspace"],
        ["another version", { ...base, version: AUTOSAVE_VERSION + 1 }],
        ["no document", { ...base, document: undefined }],
        ["no settings", { ...base, settings: undefined }],
        [
            "colors that do not fill the grid",
            withDocument({ colors: base.document.colors.slice(1) }),
        ],
        [
            "a color that is not one",
            withDocument({ colors: ["red", ...base.document.colors.slice(1)] }),
        ],
        [
            // Storage keeps a String object as one, and it spells a color.
            "a color that is not a string",
            withDocument({
                colors: [
                    new String("#FFFFFF"),
                    ...base.document.colors.slice(1),
                ],
            }),
        ],
        ["an unsupported grid size", withDocument({ gridSize: 65 })],
        ["a grid size that is not a number", withDocument({ gridSize: "2" })],
        ["colors that are not a list", withDocument({ colors: "#FFFFFF" })],
        [
            "colors that are only like a list",
            withDocument({
                colors: {
                    ...base.document.colors,
                    length: base.document.colors.length,
                },
            }),
        ],
        ["history that is not a list", withDocument({ undoStack: {} })],
        [
            "more history than the app keeps",
            withDocument({
                undoStack: new Array(MAX_HISTORY_ENTRIES + 1).fill(STEP),
            }),
        ],
        ["a step that is not a record", withStep("step")],
        ["a step of nothing", withStep(null)],
        [
            "a step whose cells are a plain list",
            withStep({ ...STEP, cells: [0] }),
        ],
        [
            "a step whose colors before are a plain list",
            withStep({ ...STEP, before: [0xffffff] }),
        ],
        [
            "a step whose colors after are a plain list",
            withStep({ ...STEP, after: [0x123456] }),
        ],
        [
            "a step of the wrong kind of typed array",
            withStep({ ...STEP, cells: Float64Array.of(0) }),
        ],
        [
            // Only a real typed array is one: a name can be borrowed.
            "a step whose cells only claim to be typed",
            withStep({
                ...STEP,
                cells: { [Symbol.toStringTag]: "Uint16Array", length: 1, 0: 0 },
            }),
        ],
        [
            "a step with more colors before than cells",
            withStep(step([0], [0, 0], [0])),
        ],
        [
            "a step with more colors after than cells",
            withStep(step([0], [0], [0, 0])),
        ],
        ["an empty step", withStep(step([], [], []))],
        ["a step off the grid", withStep(step([4], [0], [0]))],
        [
            "a step whose parts differ in length",
            withStep(step([0, 1], [0], [0])),
        ],
        ["a step color past #FFFFFF", withStep(step([0], [0], [0x1000000]))],
        [
            "a step of plain lists",
            withStep({ cells: [0], before: [0], after: [0] }),
        ],
        ["an unknown tool", withSettings({ tool: "spray" })],
        ["a lowercase pen color", withSettings({ penColor: "#abcdef" })],
        [
            "symmetry that is not two switches",
            withSettings({ symmetry: { topBottom: true, leftRight: 1 } }),
        ],
        [
            "grid lines that are not on or off",
            withSettings({ showGridLines: "yes" }),
        ],
    ])("refuses %s", (_, record) => {
        expect(decodeAutosave(record)).toBeNull();
    });
});

const COLOR = /^#[0-9A-F]{6}$/;

const anyColor = fc.oneof(
    fc.constantFrom("#FFFFFF", "#000000", PEN),
    fc
        .integer({ min: 0, max: 0xffffff })
        .map((value) => `#${value.toString(16).padStart(6, "0").toUpperCase()}`)
);

/** Any workspace, now and then with as much history as the app keeps. */
const anyWorkspace: fc.Arbitrary<Workspace> = fc
    .integer({ min: 1, max: 8 })
    .chain((gridSize) => {
        const cellCount = gridSize * gridSize;
        const anyStep: fc.Arbitrary<HistoryEntry> = fc
            .uniqueArray(fc.nat(cellCount - 1), {
                minLength: 1,
                maxLength: cellCount,
            })
            .chain((cells) =>
                fc
                    .array(fc.tuple(anyColor, anyColor), {
                        minLength: cells.length,
                        maxLength: cells.length,
                    })
                    .map((colors) =>
                        cells.map((index, at) => ({
                            index,
                            before: colors[at][0],
                            after: colors[at][1],
                        }))
                    )
            );
        const anyHistory = fc.oneof(
            { arbitrary: fc.array(anyStep, { maxLength: 6 }), weight: 9 },
            {
                arbitrary: fc.array(anyStep, {
                    minLength: MAX_HISTORY_ENTRIES,
                    maxLength: MAX_HISTORY_ENTRIES,
                }),
                weight: 1,
            }
        );

        return fc.record({
            document: fc.record({
                gridSize: fc.constant(gridSize),
                colors: fc.array(anyColor, {
                    minLength: cellCount,
                    maxLength: cellCount,
                }),
                undoStack: anyHistory,
                redoStack: anyHistory,
            }),
            settings: fc.record({
                tool: fc.constantFrom(...DRAWING_TOOLS),
                penColor: anyColor,
                symmetry: fc.record({
                    topBottom: fc.boolean(),
                    leftRight: fc.boolean(),
                }),
                showGridLines: fc.boolean(),
            }),
        });
    });

/**
 * Whether a workspace is whole, checked from scratch: exactly the parts a
 * workspace has, each in range, and nothing else.
 */
const expectWholeWorkspace = (workspace: Workspace) => {
    const { document, settings } = workspace;
    const { gridSize, colors, undoStack, redoStack } = document;
    const cellCount = gridSize * gridSize;

    expect(Object.keys(workspace).sort()).toEqual(["document", "settings"]);
    expect(Object.keys(document).sort()).toEqual([
        "colors",
        "gridSize",
        "redoStack",
        "undoStack",
    ]);
    expect(Number.isInteger(gridSize) && gridSize >= 1 && gridSize <= 64).toBe(
        true
    );
    expect(colors).toHaveLength(cellCount);
    expect(colors.every((color) => COLOR.test(color))).toBe(true);
    for (const stack of [undoStack, redoStack]) {
        expect(stack.length).toBeLessThanOrEqual(MAX_HISTORY_ENTRIES);
        for (const entry of stack) {
            expect(entry.length).toBeGreaterThan(0);
            for (const change of entry) {
                expect(Object.keys(change).sort()).toEqual([
                    "after",
                    "before",
                    "index",
                ]);
                expect(
                    Number.isInteger(change.index) &&
                        change.index >= 0 &&
                        change.index < cellCount
                ).toBe(true);
                expect(COLOR.test(change.before)).toBe(true);
                expect(COLOR.test(change.after)).toBe(true);
            }
        }
    }
    const { tool, penColor, symmetry, showGridLines } = settings;
    expect(Object.keys(settings).sort()).toEqual([
        "penColor",
        "showGridLines",
        "symmetry",
        "tool",
    ]);
    expect(DRAWING_TOOLS).toContain(tool);
    expect(penColor).toMatch(COLOR);
    expect(Object.keys(symmetry).sort()).toEqual(["leftRight", "topBottom"]);
    expect([
        typeof symmetry.topBottom,
        typeof symmetry.leftRight,
        typeof showGridLines,
    ]).toEqual(["boolean", "boolean", "boolean"]);
};

/**
 * One part of a stored record, anywhere in it, replaced with anything: the
 * path is followed one choice per level, and stops where it runs out.
 */
const corrupt = (record: unknown, path: number[], value: unknown) => {
    let node = record as Record<string, unknown>;
    for (let depth = 0; ; depth++) {
        const keys = Object.keys(node);
        if (keys.length === 0) return;

        const key = keys[path[depth] % keys.length];
        const child = node[key];
        const isLast = depth === path.length - 1;
        if (isLast || typeof child !== "object" || child === null) {
            node[key] = value;
            return;
        }
        node = child as Record<string, unknown>;
    }
};

describe("the autosave record, for any workspace", () => {
    it("reads back exactly what was saved", () => {
        fc.assert(
            fc.property(anyWorkspace, (saved) => {
                expect(
                    decodeAutosave(structuredClone(encodeAutosave(saved)))
                ).toEqual(saved);
            }),
            { numRuns: 150 }
        );
    });

    // Storage can hand back anything: a record from another version, damaged,
    // or written by other code. Whatever it is, what is read back is either
    // nothing or a whole workspace, and one that saves and reads back as itself.
    it("reads back nothing, or a whole workspace, from a damaged record", () => {
        const anyValue = fc.oneof(
            fc.anything(),
            fc.constantFrom(
                -1,
                0,
                1.5,
                65,
                4096,
                0x1000000,
                "#abcdef",
                "#FFFFFF",
                "pen",
                [],
                new Uint16Array(1),
                new Uint32Array(1)
            )
        );

        fc.assert(
            fc.property(
                anyWorkspace,
                fc.array(fc.nat(), { minLength: 1, maxLength: 6 }),
                anyValue,
                (saved, path, value) => {
                    const record = structuredClone(encodeAutosave(saved));
                    corrupt(record, path, value);

                    const read = decodeAutosave(record);

                    if (read) {
                        expectWholeWorkspace(read);
                        expect(
                            decodeAutosave(
                                structuredClone(encodeAutosave(read))
                            )
                        ).toEqual(read);
                    }
                }
            ),
            { numRuns: 400 }
        );
    });
});
