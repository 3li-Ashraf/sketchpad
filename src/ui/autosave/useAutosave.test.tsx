/**
 * @file Autosave as the app runs it, over the in-memory IndexedDB: when it
 * writes, what it holds back when opening could not read the device, the
 * question it asks, and how it keeps in step with other tabs.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    onTestFinished,
    vi,
} from "vitest";

import {
    BLANK_CELL_COLOR,
    createBlankGrid,
    NO_SYMMETRY,
} from "../../domain/grid";
import { DEFAULT_PEN_COLOR } from "../../domain/tools";
import type { Workspace } from "../../domain/workspace";
import {
    clearAutosave,
    encodeAutosave,
    readAutosave,
    writeAutosave,
} from "../../io/autosave";
import {
    type AutosaveChannel,
    openAutosaveChannel,
} from "../../io/autosaveChannel";
import { workspaceOf } from "../../state/sketchStore";
import {
    deleteAutosaveDatabase,
    readStoredRecord,
    writeStoredRecord,
} from "../../test/autosaveDatabase";
import { deferred } from "../../test/deferred";
import { expectLogged } from "../../test/logCapture";
import { button, expectNoDialog } from "../../test/queries";
import { actions, paintStroke, store } from "../../test/storeHelpers";
import { NoticeDialog } from "../common/Dialog";
import { AUTOSAVE_DELAY, clearSavedWorkspace } from "./autosaveSession";
import {
    RESTORE_TIMEOUT,
    restoreAutosave,
    type Restored,
} from "./restoreAutosave";
import {
    RESTORE_DIALOG_TITLE,
    RESTORE_WARNING,
    useAutosave,
} from "./useAutosave";

// The real storage, over the in-memory IndexedDB, with its calls counted,
// and the real channel between tabs, with the tab each call opened.
vi.mock("../../io/autosave", { spy: true });
vi.mock("../../io/autosaveChannel", { spy: true });

beforeEach(async () => {
    // `restoreMocks` clears the calls of a module's spies but keeps what a
    // test told them to return, so each starts again from the real one.
    vi.mocked(readAutosave).mockReset();
    vi.mocked(writeAutosave).mockReset();
    vi.mocked(clearAutosave).mockReset();

    await deleteAutosaveDatabase();
});

const saved = () => readAutosave();

/** The autosave as the app mounts it, with the question it may ask. */
const Autosaving = ({ restored }: { restored?: Restored }) => {
    const question = useAutosave(restored);

    return question && <NoticeDialog {...question} />;
};

/** A workspace of its own: a 4×4 grid with one cell painted `color`. */
const drawing = (color: string): Workspace => {
    const colors = createBlankGrid(4);
    colors[5] = color;

    return {
        document: {
            gridSize: 4,
            colors,
            undoStack: [[{ index: 5, before: BLANK_CELL_COLOR, after: color }]],
            redoStack: [],
        },
        settings: {
            tool: "pen",
            penColor: color,
            symmetry: NO_SYMMETRY,
            showGridLines: true,
        },
    };
};

/** What an earlier visit left on the device. */
const EARLIER = drawing("#123456");

/** Stores a workspace as the app would, without the calls being counted. */
const keepOnDevice = (workspace: Workspace) =>
    writeStoredRecord(encodeAutosave(workspace));

/**
 * Another tab saving `workspace` and saying so. Resolves once this tab has
 * heard, which it shows by reading the device.
 */
const saveInAnotherTab = async (workspace: Workspace) => {
    await keepOnDevice(workspace);
    const readsBefore = vi.mocked(readAutosave).mock.calls.length;

    const channel = openAutosaveChannel(() => {});
    onTestFinished(channel.close);
    channel.announce("saved");

    await vi.waitFor(() =>
        expect(vi.mocked(readAutosave).mock.calls.length).toBeGreaterThan(
            readsBefore
        )
    );
    await vi.mocked(readAutosave).mock.results.at(-1)!.value;
};

const writes = () => vi.mocked(writeAutosave).mock.calls.length;

const useFakeTimers = () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    });

    afterEach(() => {
        vi.useRealTimers();
    });
};

describe("useAutosave", () => {
    useFakeTimers();

    it("saves the workspace a moment after a change", async () => {
        render(<Autosaving />);
        paintStroke(0);

        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY - 1);
        expect(writes()).toBe(0);
        await vi.advanceTimersByTimeAsync(1);

        expect(writes()).toBe(1);
        await vi.mocked(writeAutosave).mock.results[0].value;
        expect(await saved()).toEqual(workspaceOf(store()));
    });

    it("writes nothing at mount, and sets no save going, over a drawing just restored", async () => {
        // As `restoreAutosave` leaves the store before the app mounts.
        paintStroke(0);
        render(<Autosaving />);

        expect(vi.getTimerCount()).toBe(0);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        expect(writes()).toBe(0);
    });

    it("writes once for a burst of changes", async () => {
        render(<Autosaving />);
        paintStroke(0);
        paintStroke(1);
        actions().toggleGridLines();

        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        expect(writes()).toBe(1);
    });

    it("waits for a stroke to be committed", async () => {
        render(<Autosaving />);
        actions().beginStroke();
        actions().paintCells([0, 1]);

        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        expect(writes()).toBe(0);

        actions().endStroke();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        expect(writes()).toBe(1);
    });

    it("holds a save that falls due during a stroke until the stroke ends", async () => {
        render(<Autosaving />);
        paintStroke(0);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY - 1);
        actions().beginStroke();
        actions().paintCells([1]);

        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        expect(writes()).toBe(0);

        actions().endStroke();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        expect(writes()).toBe(1);
        await vi.mocked(writeAutosave).mock.results[0].value;
        expect(await saved()).toEqual(workspaceOf(store()));
    });

    it("saves the drawing as last committed when the page is left mid-stroke", async () => {
        render(<Autosaving />);
        paintStroke(0);
        actions().beginStroke();
        actions().paintCells([1]);

        window.dispatchEvent(new Event("pagehide"));
        await vi.mocked(writeAutosave).mock.results[0].value;

        const restored = await saved();
        expect(restored?.document.colors.slice(0, 2)).toEqual([
            DEFAULT_PEN_COLOR,
            BLANK_CELL_COLOR,
        ]);
        expect(restored?.document.undoStack).toHaveLength(1);
    });

    it("saves a setting changed during a stroke once the stroke ends", async () => {
        render(<Autosaving />);
        actions().beginStroke();
        actions().setTool("eraser");
        actions().endStroke();

        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        await vi.mocked(writeAutosave).mock.results[0]?.value;

        expect((await saved())?.settings.tool).toBe("eraser");
    });

    it("writes nothing when nothing it keeps has changed", async () => {
        render(<Autosaving />);
        actions().undo();
        actions().setGridSize(store().document.gridSize);
        // A change the workspace leaves out on purpose.
        actions().stopAskingBeforeResize();

        expect(vi.getTimerCount()).toBe(0);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        expect(writes()).toBe(0);
    });

    it("saves at once when the page is hidden", () => {
        render(<Autosaving />);
        paintStroke(0);

        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        document.dispatchEvent(new Event("visibilitychange"));

        expect(writes()).toBe(1);
    });

    it("waits while the page is merely shown again", () => {
        render(<Autosaving />);
        paintStroke(0);

        document.dispatchEvent(new Event("visibilitychange"));

        expect(writes()).toBe(0);
    });

    it("saves at once when the page is unloaded", () => {
        render(<Autosaving />);
        paintStroke(0);

        window.dispatchEvent(new Event("pagehide"));

        expect(writes()).toBe(1);
        // The save that was due is not left to run again.
        expect(vi.getTimerCount()).toBe(0);
    });

    it("saves pending work when it stops", () => {
        const { unmount } = render(<Autosaving />);
        paintStroke(0);

        unmount();

        expect(writes()).toBe(1);
    });

    it("starts afresh on what a new restored handle knows", async () => {
        const { rerender } = render(<Autosaving />);

        rerender(<Autosaving restored={{ isKnown: false, answer: null }} />);
        paintStroke(0);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        // Held back until the device is read, as the new handle asks.
        expect(readAutosave).toHaveBeenCalledOnce();
        expect(writes()).toBe(0);
    });

    it("warns once for a run of failed saves, and again after a success", async () => {
        render(<Autosaving />);
        const write = vi.mocked(writeAutosave);
        const error = new Error("storage full");
        write.mockRejectedValue(error);

        paintStroke(0);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        paintStroke(1);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        expectLogged("warn", "autosave", "autosave failed", { error });

        write.mockResolvedValueOnce();
        paintStroke(2);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        paintStroke(3);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        expectLogged("warn", "autosave", "autosave failed");
    });
});

/**
 * Whatever a page listens for, from mounting until it stops, as the
 * listeners added and removed on `target`.
 */
const watchListeners = (target: EventTarget) => ({
    added: vi.spyOn(target, "addEventListener"),
    removed: vi.spyOn(target, "removeEventListener"),
});

describe("useAutosave, once it stops", () => {
    it("stops listening to the page, removing every listener it added", () => {
        const onWindow = watchListeners(window);
        const onDocument = watchListeners(document);
        const { unmount } = render(<Autosaving />);

        unmount();

        for (const [{ added, removed }, type] of [
            [onWindow, "pagehide"],
            [onWindow, "pageshow"],
            [onDocument, "visibilitychange"],
        ] as const) {
            const listener = added.mock.calls.find(
                ([addedType]) => addedType === type
            )?.[1];
            expect(listener).toBeDefined();
            expect(removed).toHaveBeenCalledWith(type, listener);
        }
    });

    it("closes its line to the other tabs", () => {
        const { unmount } = render(<Autosaving />);
        const close = vi.spyOn(sessionChannel(), "close");

        unmount();

        expect(close).toHaveBeenCalledOnce();
    });

    it("announces nothing on its closed line, though its last save completes", async () => {
        const { unmount } = render(<Autosaving />);
        const announce = vi.spyOn(sessionChannel(), "announce");
        paintStroke(0);

        unmount();
        await vi.mocked(writeAutosave).mock.results[0].value;

        expect(announce).not.toHaveBeenCalled();
    });

    it("leaves New sketch to the session still running", async () => {
        const first = render(<Autosaving />);
        render(<Autosaving />);
        paintStroke(0);
        window.dispatchEvent(new Event("pagehide"));
        await Promise.all(
            vi
                .mocked(writeAutosave)
                .mock.results.map(({ value }) => value as Promise<void>)
        );
        first.unmount();

        actions().startNewSketch();
        clearSavedWorkspace();
        await vi.mocked(clearAutosave).mock.results.at(-1)?.value;

        expect(clearAutosave).toHaveBeenCalledOnce();
        expect(await readStoredRecord()).toBeUndefined();
    });
});

/** The channel the mounted autosave opened, the first one a test opens. */
const sessionChannel = () =>
    vi.mocked(openAutosaveChannel).mock.results[0].value as AutosaveChannel;

/** The last read of the device that autosave began. */
const lastRead = () =>
    vi.mocked(readAutosave).mock.results.at(-1)!
        .value as Promise<Workspace | null>;

/**
 * Tells the mounted autosave that another tab has saved, or cleared, as its
 * channel would. The real channel is tested in `io/autosaveChannel.test`, and
 * end to end in "hears another tab through the channel" below.
 */
const hearElsewhere = (news: "saved" | "cleared") =>
    act(() => vi.mocked(openAutosaveChannel).mock.calls.at(-1)![0](news));

const hearSaveElsewhere = () => hearElsewhere("saved");

describe("useAutosave when opening could not read the device", () => {
    useFakeTimers();

    /**
     * Opens as if storage answered only once opening had given up waiting.
     * The test delivers the late answer with `late`.
     */
    const openLate = async () => {
        const late = deferred<Workspace | null>();
        vi.mocked(readAutosave).mockReturnValueOnce(late.promise);

        const restoring = restoreAutosave();
        await vi.advanceTimersByTimeAsync(RESTORE_TIMEOUT);
        const restored = await restoring;
        expectLogged("warn", "autosave", "autosave could not be read");

        return {
            restored,
            /** Delivers the late answer, and lets autosave act on it. */
            answer: (workspace: Workspace | null) =>
                act(async () => {
                    late.resolve(workspace);
                    await late.promise;
                }),
            fail: (error: Error) =>
                act(async () => {
                    late.reject(error);
                    await late.promise.catch(() => {});
                }),
        };
    };

    const question = () =>
        screen.getByRole("alertdialog", { name: RESTORE_DIALOG_TITLE });

    it("writes nothing over the saved drawing before it has read it", async () => {
        await keepOnDevice(EARLIER);
        const { restored } = await openLate();
        render(<Autosaving restored={restored} />);

        paintStroke(0);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        window.dispatchEvent(new Event("pagehide"));

        expect(writes()).toBe(0);
        expect(await saved()).toEqual(EARLIER);
    });

    it("asks once the late answer holds a drawing the new one would erase", async () => {
        const { restored, answer } = await openLate();
        render(<Autosaving restored={restored} />);
        paintStroke(0);

        await answer(EARLIER);

        expect(question()).toBeInTheDocument();
        expect(writes()).toBe(0);
    });

    it("asks in words as true of a file opened since as of a drawing", async () => {
        const { restored, answer } = await openLate();
        render(<Autosaving restored={restored} />);
        actions().loadSketch({
            gridSize: 2,
            colors: ["#123456", "#FFFFFF", "#FFFFFF", "#FFFFFF"],
        });

        await answer(EARLIER);

        // Nothing was drawn: the question must not say so.
        expect(question()).toHaveAccessibleDescription(RESTORE_WARNING);
        expect(RESTORE_WARNING).not.toMatch(/drawn/);
    });

    it("puts the saved drawing back when asked to, and writes nothing", async () => {
        const { restored, answer } = await openLate();
        render(<Autosaving restored={restored} />);
        paintStroke(0);
        await answer(EARLIER);

        fireEvent.click(button("Restore saved drawing"));
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        expectNoDialog();
        expect(workspaceOf(store())).toEqual(EARLIER);
        expect(writes()).toBe(0);
        expect(restored.isKnown).toBe(true);
        // No other tab saved while it asked, so there is nothing to read again.
        expect(readAutosave).toHaveBeenCalledOnce();
    });

    it("keeps the new drawing when asked to, and writes it over the saved one", async () => {
        await keepOnDevice(EARLIER);
        const { restored, answer } = await openLate();
        render(<Autosaving restored={restored} />);
        paintStroke(0);
        await answer(EARLIER);

        fireEvent.click(button("Keep this drawing"));
        expect(writes()).toBe(1);
        await vi.mocked(writeAutosave).mock.results[0].value;

        expectNoDialog();
        expect(store().document.colors[0]).toBe(DEFAULT_PEN_COLOR);
        expect(await saved()).toEqual(workspaceOf(store()));
    });

    it("puts a late drawing on the canvas when nothing has been drawn", async () => {
        const { restored, answer } = await openLate();
        render(<Autosaving restored={restored} />);
        // A setting is not a drawing, and is not worth a question.
        actions().setTool("eraser");
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        await answer(EARLIER);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        expectNoDialog();
        expect(workspaceOf(store())).toEqual(EARLIER);
        expect(writes()).toBe(0);
    });

    it("writes what it held once the late answer finds nothing saved", async () => {
        const { restored, answer } = await openLate();
        render(<Autosaving restored={restored} />);
        paintStroke(0);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        expect(writes()).toBe(0);

        await answer(null);

        expect(writes()).toBe(1);
    });

    it("reads the device before its first write when opening failed to", async () => {
        await keepOnDevice(EARLIER);
        render(<Autosaving restored={{ isKnown: false, answer: null }} />);
        paintStroke(0);

        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        await act(() => lastRead());

        expect(question()).toBeInTheDocument();
        expect(writes()).toBe(0);
    });

    it("keeps holding its writes while the device cannot be read", async () => {
        vi.mocked(readAutosave).mockRejectedValue(new Error("unavailable"));
        render(<Autosaving restored={{ isKnown: false, answer: null }} />);

        paintStroke(0);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        paintStroke(1);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        expect(readAutosave).toHaveBeenCalledTimes(2);
        expect(writes()).toBe(0);
        expectLogged("warn", "autosave", "autosave failed");
    });

    it("reads afresh at the next write when the late answer is a failure", async () => {
        await keepOnDevice(EARLIER);
        const { restored, fail } = await openLate();
        render(<Autosaving restored={restored} />);

        await fail(new Error("lost"));
        expectLogged("warn", "autosave", "autosave failed");
        expect(restored.answer).toBeNull();

        paintStroke(0);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        await act(() => lastRead());

        expect(question()).toBeInTheDocument();
        expect(writes()).toBe(0);
    });

    it("asks again once mounted afresh, as after a crash", async () => {
        await keepOnDevice(EARLIER);
        const { restored, answer } = await openLate();
        const crashed = render(<Autosaving restored={restored} />);
        paintStroke(0);
        await answer(EARLIER);

        crashed.unmount();
        // Nothing more is drawn: the drawing held back is what it asks about.
        render(<Autosaving restored={restored} />);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        await act(() => lastRead());

        expect(question()).toBeInTheDocument();
        expect(writes()).toBe(0);
        expect(await saved()).toEqual(EARLIER);
    });

    it("asks about what the device holds after a crash, not what it held before", async () => {
        const { restored, answer } = await openLate();
        const crashed = render(<Autosaving restored={restored} />);
        paintStroke(0);
        await answer(EARLIER);
        crashed.unmount();
        const later = drawing("#654321");
        await keepOnDevice(later);

        render(<Autosaving restored={restored} />);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        await act(() => lastRead());
        fireEvent.click(button("Restore saved drawing"));

        expect(workspaceOf(store())).toEqual(later);
    });

    it("reads the device once at a time, however many saves fall due", async () => {
        const reading = deferred<Workspace | null>();
        vi.mocked(readAutosave).mockReturnValueOnce(reading.promise);
        render(<Autosaving restored={{ isKnown: false, answer: null }} />);

        paintStroke(0);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        paintStroke(1);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        expect(readAutosave).toHaveBeenCalledOnce();
    });

    it("reads nothing more while its question is up", async () => {
        const { restored, answer } = await openLate();
        render(<Autosaving restored={restored} />);
        paintStroke(0);
        await answer(EARLIER);
        const reads = vi.mocked(readAutosave).mock.calls.length;

        paintStroke(1);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        expect(readAutosave).toHaveBeenCalledTimes(reads);
        expect(writes()).toBe(0);
    });

    it("starts no read once it has stopped", () => {
        const { unmount } = render(
            <Autosaving restored={{ isKnown: false, answer: null }} />
        );
        paintStroke(0);

        unmount();

        expect(readAutosave).not.toHaveBeenCalled();
        expect(writes()).toBe(0);
    });

    it("warns afresh for a failed write once the device could be read again", async () => {
        vi.mocked(readAutosave).mockRejectedValueOnce(new Error("unavailable"));
        vi.mocked(writeAutosave).mockRejectedValueOnce(new Error("full"));
        render(<Autosaving restored={{ isKnown: false, answer: null }} />);
        paintStroke(0);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        expectLogged("warn", "autosave", "autosave failed");

        // Read at the next save, and found empty, so the write goes ahead.
        paintStroke(1);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        await act(() => lastRead());
        await vi.waitFor(() => expect(writes()).toBe(1));
        await (
            vi.mocked(writeAutosave).mock.results[0].value as Promise<void>
        ).catch(() => {});

        expectLogged("warn", "autosave", "autosave failed");
    });

    it.each([
        ["answers", "resolve"],
        ["fails", "reject"],
    ] as const)(
        "leaves a late answer that %s after it stops to the next start",
        async (_, settle) => {
            const late = deferred<Workspace | null>();
            const restored: Restored = { isKnown: false, answer: late.promise };
            const { unmount } = render(<Autosaving restored={restored} />);
            unmount();

            if (settle === "resolve") late.resolve(EARLIER);
            else late.reject(new Error("lost"));
            await late.promise.catch(() => {});

            // As in StrictMode's second mount: the next start takes it up.
            expect(restored.answer).toBe(late.promise);
            expect(store().document.gridSize).not.toBe(4);
        }
    );

    it("restores the latest save when another tab saved while it asked", async () => {
        const later = drawing("#654321");
        const { restored, answer } = await openLate();
        render(<Autosaving restored={restored} />);
        paintStroke(0);
        await answer(EARLIER);

        await keepOnDevice(later);
        hearSaveElsewhere();
        fireEvent.click(button("Restore saved drawing"));
        await lastRead();

        expect(workspaceOf(store())).toEqual(later);
        expect(writes()).toBe(0);
    });
});

describe("useAutosave with other tabs", () => {
    useFakeTimers();

    it("takes up what another tab saved, writing nothing back", async () => {
        render(<Autosaving />);
        await keepOnDevice(EARLIER);

        hearSaveElsewhere();
        await lastRead();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        expect(workspaceOf(store())).toEqual(EARLIER);
        expect(writes()).toBe(0);
    });

    it("saves its own edits after taking up another tab's save", async () => {
        render(<Autosaving />);
        await keepOnDevice(EARLIER);
        hearSaveElsewhere();
        await lastRead();

        paintStroke(0);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        expect(writes()).toBe(1);
    });

    it("hears another tab through the channel", async () => {
        render(<Autosaving />);

        await saveInAnotherTab(EARLIER);

        expect(workspaceOf(store())).toEqual(EARLIER);
    });

    it("tells the other tabs once it has saved", async () => {
        render(<Autosaving />);
        const announce = vi.spyOn(sessionChannel(), "announce");
        const heard = vi.fn();
        const otherTab = openAutosaveChannel(heard);
        onTestFinished(otherTab.close);

        paintStroke(0);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        await vi.mocked(writeAutosave).mock.results[0].value;

        await vi.waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
        expect(announce).toHaveBeenCalledExactlyOnceWith("saved");
    });

    it("keeps its own drawing when another tab saves before it has written it", async () => {
        render(<Autosaving />);
        paintStroke(0);
        await keepOnDevice(EARLIER);

        hearSaveElsewhere();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        await vi.mocked(writeAutosave).mock.results[0].value;

        // The later edit wins, and the other tab takes it up in turn.
        expect(readAutosave).not.toHaveBeenCalled();
        expect(await saved()).toEqual(workspaceOf(store()));
    });

    it("keeps what it draws while reading another tab's save", async () => {
        render(<Autosaving />);
        await keepOnDevice(EARLIER);

        hearSaveElsewhere();
        paintStroke(0);
        await lastRead();

        expect(store().document.colors[0]).toBe(DEFAULT_PEN_COLOR);
    });

    it("leaves a stroke in progress alone when another tab saves", async () => {
        render(<Autosaving />);
        await keepOnDevice(EARLIER);
        actions().beginStroke();
        actions().paintCells([0]);

        hearSaveElsewhere();
        await lastRead();

        expect(store().document.strokeBaseline).not.toBeNull();
        expect(store().document.colors[0]).toBe(DEFAULT_PEN_COLOR);
    });

    it("keeps its drawing when another tab's save cannot be found", async () => {
        render(<Autosaving />);
        const before = store().document;

        hearSaveElsewhere();
        await lastRead();

        expect(store().document).toBe(before);
    });

    it("reads again when another tab saves while it is reading", async () => {
        render(<Autosaving />);
        const outdated = deferred<Workspace | null>();
        vi.mocked(readAutosave).mockReturnValueOnce(outdated.promise);
        const later = drawing("#654321");

        hearSaveElsewhere();
        await keepOnDevice(later);
        hearSaveElsewhere();
        expect(readAutosave).toHaveBeenCalledTimes(1);

        outdated.resolve(EARLIER);
        await vi.waitFor(() => expect(readAutosave).toHaveBeenCalledTimes(2));
        await lastRead();

        expect(workspaceOf(store())).toEqual(later);
    });

    it("warns when another tab's save cannot be read", async () => {
        render(<Autosaving />);
        vi.mocked(readAutosave).mockRejectedValueOnce(new Error("lost"));

        hearSaveElsewhere();
        await act(async () => {
            await lastRead().catch(() => {});
        });

        expectLogged("warn", "autosave", "autosave failed");
    });

    it("catches up when the page comes back from the back-forward cache", async () => {
        render(<Autosaving />);
        await keepOnDevice(EARLIER);

        window.dispatchEvent(
            new PageTransitionEvent("pageshow", { persisted: false })
        );
        expect(readAutosave).not.toHaveBeenCalled();

        window.dispatchEvent(
            new PageTransitionEvent("pageshow", { persisted: true })
        );
        await lastRead();

        expect(workspaceOf(store())).toEqual(EARLIER);
    });

    it("stops hearing other tabs once it stops", () => {
        const { unmount } = render(<Autosaving />);
        const hear = vi.mocked(openAutosaveChannel).mock.calls[0][0];
        unmount();

        hear("saved");

        expect(readAutosave).not.toHaveBeenCalled();
    });
});

describe("useAutosave on a new sketch", () => {
    useFakeTimers();

    /** Starts over as New sketch does: the store first, then the device. */
    const startOver = async () => {
        actions().startNewSketch();
        clearSavedWorkspace();
        await vi.mocked(clearAutosave).mock.results.at(-1)?.value;
    };

    /** A drawing on the canvas, written to the device, with nothing waiting. */
    const drawnAndSaved = async () => {
        const rendered = render(<Autosaving />);
        paintStroke(0);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        await vi.mocked(writeAutosave).mock.results[0].value;
        expect(await readStoredRecord()).toBeDefined();

        return rendered;
    };

    it("empties the device at once, and writes nothing after", async () => {
        await drawnAndSaved();

        await startOver();

        expect(await readStoredRecord()).toBeUndefined();
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        window.dispatchEvent(new Event("pagehide"));
        expect(writes()).toBe(1);
        expect(await readStoredRecord()).toBeUndefined();
    });

    it("drops a save of the drawing that had not been written yet", async () => {
        await keepOnDevice(EARLIER);
        render(<Autosaving />);
        paintStroke(0);

        await startOver();
        expect(vi.getTimerCount()).toBe(0);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        expect(writes()).toBe(0);
        expect(await readStoredRecord()).toBeUndefined();
    });

    it("writes again at the next change", async () => {
        await drawnAndSaved();
        await startOver();

        actions().setTool("eraser");
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        await vi.mocked(writeAutosave).mock.results.at(-1)!.value;

        expect(await saved()).toEqual(workspaceOf(store()));
    });

    it("leaves alone a saved drawing the page has not seen", async () => {
        await keepOnDevice(EARLIER);
        render(<Autosaving restored={{ isKnown: false, answer: null }} />);
        paintStroke(0);

        await startOver();

        expect(clearAutosave).not.toHaveBeenCalled();
        expect(await saved()).toEqual(EARLIER);
    });

    it("tells the other tabs once it has cleared", async () => {
        await drawnAndSaved();
        const news = vi.fn();
        const otherTab = openAutosaveChannel(news);
        onTestFinished(otherTab.close);

        await startOver();

        await vi.waitFor(() =>
            expect(news).toHaveBeenLastCalledWith("cleared")
        );
    });

    it("announces no clear once it has stopped, its line closed", async () => {
        const { unmount } = await drawnAndSaved();
        const clearing = deferred<void>();
        vi.mocked(clearAutosave).mockReturnValueOnce(clearing.promise);
        const announce = vi.spyOn(sessionChannel(), "announce");
        actions().startNewSketch();
        clearSavedWorkspace();

        unmount();
        clearing.resolve();
        await clearing.promise;

        expect(announce).not.toHaveBeenCalled();
    });

    it("warns afresh for a failed write once the device could be cleared", async () => {
        render(<Autosaving />);
        vi.mocked(writeAutosave).mockRejectedValue(new Error("full"));
        paintStroke(0);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        expectLogged("warn", "autosave", "autosave failed");

        await startOver();
        paintStroke(1);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        expectLogged("warn", "autosave", "autosave failed");
    });

    it("warns when the device cannot be cleared", async () => {
        await drawnAndSaved();
        vi.mocked(clearAutosave).mockRejectedValueOnce(new Error("denied"));

        await startOver().catch(() => {});
        await vi.advanceTimersByTimeAsync(0);

        expectLogged("warn", "autosave", "autosave failed");
    });

    it("does nothing with no autosave running", () => {
        clearSavedWorkspace();

        expect(clearAutosave).not.toHaveBeenCalled();
    });

    it("does not bring back a save it was reading when it cleared", async () => {
        await drawnAndSaved();
        const outdated = deferred<Workspace | null>();
        vi.mocked(readAutosave).mockReturnValueOnce(outdated.promise);
        hearSaveElsewhere();

        await startOver();
        outdated.resolve(EARLIER);
        await vi.waitFor(() => expect(readAutosave).toHaveBeenCalledTimes(2));
        await lastRead();

        expect(store().document.colors[0]).toBe(BLANK_CELL_COLOR);
        expect(store().document.undoStack).toEqual([]);
    });
});

describe("useAutosave when another tab starts a new sketch", () => {
    useFakeTimers();

    it("starts over too, keeping its size and settings, and writes nothing", async () => {
        render(<Autosaving />);
        actions().setGridSize(8);
        paintStroke(0);
        actions().setTool("eraser");
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        hearElsewhere("cleared");
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        expect(store().document).toMatchObject({
            gridSize: 8,
            colors: createBlankGrid(8),
            undoStack: [],
        });
        expect(store().tool).toBe("eraser");
        expect(writes()).toBe(1);
    });

    it("keeps its own drawing when it has not been written yet", async () => {
        render(<Autosaving />);
        paintStroke(0);

        hearElsewhere("cleared");
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        // The later edit wins, and the other tab takes it up in turn.
        expect(store().document.colors[0]).toBe(DEFAULT_PEN_COLOR);
        expect(writes()).toBe(1);
    });

    it("leaves a stroke in progress alone", () => {
        render(<Autosaving />);
        actions().beginStroke();
        actions().paintCells([0]);

        hearElsewhere("cleared");

        expect(store().document.strokeBaseline).not.toBeNull();
        expect(store().document.colors[0]).toBe(DEFAULT_PEN_COLOR);
    });

    it("leaves a page that has not seen the device to read it first", () => {
        render(<Autosaving restored={{ isKnown: false, answer: null }} />);
        paintStroke(0);
        const before = store().document;

        hearElsewhere("cleared");

        expect(store().document).toBe(before);
    });
});
