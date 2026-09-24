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
import { encodeAutosave, readAutosave, writeAutosave } from "../../io/autosave";
import { openAutosaveChannel } from "../../io/autosaveChannel";
import { workspaceOf } from "../../state/sketchStore";
import {
    deleteAutosaveDatabase,
    writeStoredRecord,
} from "../../test/autosaveDatabase";
import { deferred } from "../../test/deferred";
import { expectLogged } from "../../test/logCapture";
import { button, expectNoDialog } from "../../test/queries";
import { actions, paintStroke, store } from "../../test/storeHelpers";
import { NoticeDialog } from "../common/Dialog";
import { AUTOSAVE_DELAY } from "./autosaveSession";
import {
    RESTORE_TIMEOUT,
    restoreAutosave,
    type Restored,
} from "./restoreAutosave";
import { RESTORE_DIALOG_TITLE, useAutosave } from "./useAutosave";

// The real storage, over the in-memory IndexedDB, with its calls counted,
// and the real channel between tabs, with the tab each call opened.
vi.mock("../../io/autosave", { spy: true });
vi.mock("../../io/autosaveChannel", { spy: true });

beforeEach(async () => {
    // `restoreMocks` clears the calls of a module's spies but keeps what a
    // test told them to return, so each starts again from the real one.
    vi.mocked(readAutosave).mockReset();
    vi.mocked(writeAutosave).mockReset();

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
    channel.announce();

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
    });

    it("saves pending work when it stops", () => {
        const { unmount } = render(<Autosaving />);
        paintStroke(0);

        unmount();

        expect(writes()).toBe(1);
    });

    it("warns once for a run of failed saves, and again after a success", async () => {
        render(<Autosaving />);
        const write = vi.mocked(writeAutosave);
        write.mockRejectedValue(new Error("storage full"));

        paintStroke(0);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        paintStroke(1);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        expectLogged("warn", "autosave", "autosave failed");

        write.mockResolvedValueOnce();
        paintStroke(2);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        paintStroke(3);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);

        expectLogged("warn", "autosave", "autosave failed");
    });
});

/** The last read of the device that autosave began. */
const lastRead = () =>
    vi.mocked(readAutosave).mock.results.at(-1)!
        .value as Promise<Workspace | null>;

/**
 * Tells the mounted autosave that another tab has saved, as its channel
 * would. The real channel is tested in `io/autosave.test`, and end to end in
 * "hears another tab through the channel" below.
 */
const hearSaveElsewhere = () =>
    act(() => vi.mocked(openAutosaveChannel).mock.calls.at(-1)![0]());

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

    it("hears another tab through the channel", async () => {
        render(<Autosaving />);

        await saveInAnotherTab(EARLIER);

        expect(workspaceOf(store())).toEqual(EARLIER);
    });

    it("tells the other tabs once it has saved", async () => {
        render(<Autosaving />);
        const heard = vi.fn();
        const otherTab = openAutosaveChannel(heard);
        onTestFinished(otherTab.close);

        paintStroke(0);
        await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
        await vi.mocked(writeAutosave).mock.results[0].value;

        await vi.waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
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

        hear();

        expect(readAutosave).not.toHaveBeenCalled();
    });
});
