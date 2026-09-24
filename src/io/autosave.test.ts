import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { createBlankGrid } from "../domain/grid";
import { MAX_HISTORY_ENTRIES } from "../domain/history";
import type { Workspace } from "../domain/workspace";
import {
    deleteAutosaveDatabase,
    readStoredRecord,
    writeStoredRecord,
} from "../test/autosaveDatabase";
import { expectLogged } from "../test/logCapture";
import {
    AUTOSAVE_VERSION,
    type AutosaveRecord,
    decodeAutosave,
    encodeAutosave,
    openAutosaveChannel,
    readAutosave,
    writeAutosave,
} from "./autosave";

const PEN = "#123456";

/** A small workspace with one step to undo and one to redo. */
const workspace = (): Workspace => {
    const colors = createBlankGrid(2);
    colors[0] = PEN;

    return {
        document: {
            gridSize: 2,
            colors,
            undoStack: [[{ index: 0, before: "#FFFFFF", after: PEN }]],
            redoStack: [
                [
                    { index: 1, before: "#FFFFFF", after: "#ABCDEF" },
                    { index: 3, before: "#FFFFFF", after: "#ABCDEF" },
                ],
            ],
        },
        settings: {
            tool: "eraser",
            penColor: PEN,
            symmetry: { topBottom: true, leftRight: false },
            showGridLines: false,
        },
    };
};

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

beforeEach(deleteAutosaveDatabase);

describe("autosave storage", () => {
    it("holds nothing until something is written", async () => {
        expect(await readAutosave()).toBeNull();
    });

    it("reads back the workspace it wrote", async () => {
        await writeAutosave(workspace());

        expect(await readAutosave()).toEqual(workspace());
    });

    it("keeps only the latest workspace", async () => {
        const later = workspace();
        later.settings.tool = "fill";

        await writeAutosave(workspace());
        await writeAutosave(later);

        expect(await readAutosave()).toEqual(later);
    });

    it("keeps the record where earlier versions look for it", async () => {
        await writeAutosave(workspace());

        expect(decodeAutosave(await readStoredRecord())).toEqual(workspace());
    });

    it("ignores, and warns about, a record this version cannot use", async () => {
        await writeStoredRecord({ version: AUTOSAVE_VERSION + 1 });

        expect(await readAutosave()).toBeNull();
        expectLogged(
            "warn",
            "autosave",
            "autosave ignored: not a workspace this version can use"
        );
    });

    it("rejects, rather than throws, when the browser has no IndexedDB", async () => {
        vi.stubGlobal("indexedDB", undefined);

        await expect(readAutosave()).rejects.toThrow();
        await expect(writeAutosave(workspace())).rejects.toThrow();
    });

    it("rejects when the database cannot be opened", async () => {
        const failed = new DOMException("Denied", "SecurityError");
        vi.spyOn(indexedDB, "open").mockImplementation(() => {
            const request = { error: failed } as unknown as IDBOpenDBRequest;
            queueMicrotask(() => {
                request.onerror?.(new Event("error"));
            });
            return request;
        });

        await expect(readAutosave()).rejects.toMatchObject({
            message: "IndexedDB request failed",
            cause: failed,
        });
    });

    it("rejects when the browser aborts the write", async () => {
        vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
            this: IDBObjectStore
        ) {
            this.transaction.abort();
            return {} as IDBRequest<IDBValidKey>;
        });

        await expect(writeAutosave(workspace())).rejects.toThrow(
            "Autosave was not written"
        );
    });
});

describe("the autosave channel", () => {
    /** A tab's end of the channel, counting what it hears. */
    const tab = () => {
        const heard = { saves: 0 };
        const channel = openAutosaveChannel(() => heard.saves++);
        onTestFinished(channel.close);

        return { channel, heard };
    };

    it("tells every other tab of a save, but not itself", async () => {
        const saving = tab();
        const other = tab();
        const another = tab();

        saving.channel.announce();

        await vi.waitFor(() => {
            expect(other.heard.saves).toBe(1);
            expect(another.heard.saves).toBe(1);
        });
        expect(saving.heard.saves).toBe(0);
    });

    it("hears nothing once closed", async () => {
        const saving = tab();
        const closed = tab();
        const open = tab();
        closed.channel.close();

        saving.channel.announce();

        await vi.waitFor(() => expect(open.heard.saves).toBe(1));
        expect(closed.heard.saves).toBe(0);
    });

    it("is silent where the browser has no BroadcastChannel", () => {
        vi.stubGlobal("BroadcastChannel", undefined);
        const onSavedElsewhere = vi.fn();

        const channel = openAutosaveChannel(onSavedElsewhere);

        expect(() => {
            channel.announce();
            channel.close();
        }).not.toThrow();
        expect(onSavedElsewhere).not.toHaveBeenCalled();
    });
});

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

    it("reads back a workspace exactly", () => {
        expect(decodeAutosave(stored())).toEqual(workspace());
    });

    it("keeps nothing it did not check", () => {
        const record = {
            ...withSettings({ askBeforeResize: false }),
            document: {
                ...base.document,
                undoStack: [{ ...STEP, note: "ignored" }],
            },
            extra: "ignored",
        };

        expect(decodeAutosave(record)).toEqual(workspace());
    });

    it("accepts the full history the app keeps", () => {
        const record = withDocument({
            undoStack: new Array(MAX_HISTORY_ENTRIES).fill(STEP),
        });

        expect(decodeAutosave(record)?.document.undoStack).toHaveLength(
            MAX_HISTORY_ENTRIES
        );
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
        ["history that is not a list", withDocument({ undoStack: {} })],
        [
            "more history than the app keeps",
            withDocument({
                undoStack: new Array(MAX_HISTORY_ENTRIES + 1).fill(STEP),
            }),
        ],
        ["a step that is not a record", withStep("step")],
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
