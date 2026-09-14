/**
 * @file Covers `Toolbar` and, through it, `useGridResize` and `useSketchFiles`:
 * that each control reaches the store, that resizing or loading over a drawing
 * asks first, and that saving, loading and exporting report failure in a dialog
 * rather than throwing.
 */

import {
    createEvent,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    BLANK_CELL_COLOR,
    createBlankGrid,
    MAX_GRID_SIZE,
    MIN_GRID_SIZE,
} from "../../domain/grid";
import {
    parseSketch,
    serializeSketch,
    SKETCH_FILE_MIME_TYPE,
} from "../../io/sketchFile";
import { selectCanUndo } from "../../state/sketchStore";
import {
    recordDownloads,
    stubCanvas2d,
    stubCanvas2dUnavailable,
    STUB_PNG_DATA_URL,
    type DownloadRecording,
} from "../../test/browserStubs";
import { artworkSketch } from "../../test/sketchFixtures";
import {
    paintStroke,
    store,
    switchToGridSize,
} from "../../test/storeHelpers";
import { RESIZE_DIALOG_TITLE, RESIZE_WARNING } from "./useGridResize";
import {
    EXPORT_FAILED,
    LOAD_FAILED,
    replaceTitle,
    replaceWarning,
    SAVE_FAILED,
    type LoadFailure,
} from "./useSketchFiles";
import { Toolbar } from "./Toolbar";

const PEN = "#000000";

const renderToolbar = (isOpen = true) => render(<Toolbar isOpen={isOpen} />);

const button = (name: string) => screen.getByRole("button", { name });

const panel = () => screen.getByRole("complementary", { name: "Settings" });

const fileInput = () => screen.getByLabelText("Sketch file") as HTMLInputElement;

const dontAskAgain = () =>
    screen.getByRole("checkbox", { name: "Don't ask again" });

/** The one dialog open, which `findByRole` also proves is the only one. */
const findDialog = () => screen.findByRole("alertdialog");

const expectNoDialog = () =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

const isBlank = () => store().colors.every((color) => color === BLANK_CELL_COLOR);

const selectFile = (contents: BlobPart, fileName = "sketch.skpd") => {
    const input = fileInput();

    fireEvent.change(input, {
        target: {
            files: [new File([contents], fileName, { type: SKETCH_FILE_MIME_TYPE })],
        },
    });

    return input;
};

let recording: DownloadRecording;

beforeEach(() => {
    recording = recordDownloads();
});

describe("visibility", () => {
    it("is hidden on small screens until it is opened", () => {
        renderToolbar(false);

        expect(panel()).toHaveClass("hidden");
    });

    it("is shown once opened", () => {
        renderToolbar(true);

        expect(panel()).toHaveClass("flex");
    });
});

describe("tool selection", () => {
    it.each([
        ["Pen", "pen"],
        ["Colorful Pen", "colorfulPen"],
        ["Eraser", "eraser"],
        ["Fill", "fill"],
    ])("selects the %s tool", async (label, tool) => {
        renderToolbar();

        await userEvent.click(button(label));

        expect(store().tool).toBe(tool);
        expect(button(label)).toHaveAttribute("aria-pressed", "true");
    });

    it("marks only the active tool as pressed", async () => {
        renderToolbar();

        await userEvent.click(button("Eraser"));

        expect(button("Pen")).toHaveAttribute("aria-pressed", "false");
        expect(button("Fill")).toHaveAttribute("aria-pressed", "false");
    });
});

describe("toggles", () => {
    it("toggles grid lines", async () => {
        renderToolbar();

        expect(button("Grid Lines")).toHaveAttribute("aria-pressed", "true");

        await userEvent.click(button("Grid Lines"));

        expect(store().showGridLines).toBe(false);
        expect(button("Grid Lines")).toHaveAttribute("aria-pressed", "false");
    });

    it("toggles both mirror axes independently", async () => {
        renderToolbar();

        await userEvent.click(button("Mirror X"));

        expect(store().mirrorX).toBe(true);
        expect(store().mirrorY).toBe(false);

        await userEvent.click(button("Mirror Y"));

        expect(store().mirrorY).toBe(true);
    });
});

describe("grid size", () => {
    const slider = () => screen.getByRole("slider", { name: "Grid size" });

    /** Steps of a drag, each reported by the browser as an `input` event. */
    const drag = (...sizes: number[]) => {
        for (const size of sizes) {
            fireEvent.input(slider(), { target: { value: String(size) } });
        }
    };

    /**
     * A primary-button press, returned so its default can be inspected. It is
     * fired at the input and bubbles to the track around it, which is where a
     * real press lands while the input ignores the pointer.
     */
    const press = () => {
        const event = createEvent.pointerDown(slider(), { button: 0 });
        fireEvent(slider(), event);

        return event;
    };

    const pressKey = (key: string) => {
        const event = createEvent.keyDown(slider(), { key });
        fireEvent(slider(), event);

        return event;
    };

    it("exposes the supported range and the current size", () => {
        renderToolbar();

        expect(slider()).toHaveAttribute("min", String(MIN_GRID_SIZE));
        expect(slider()).toHaveAttribute("max", String(MAX_GRID_SIZE));
        expect(slider()).toHaveValue(String(store().gridSize));
    });

    it("shows the current grid size as a square", () => {
        renderToolbar();

        expect(screen.getByText("32 X 32")).toBeInTheDocument();
    });

    it("resizes the canvas and updates the label", () => {
        renderToolbar();

        fireEvent.change(slider(), { target: { value: "8" } });

        expect(store().gridSize).toBe(8);
        expect(screen.getByText("8 X 8")).toBeInTheDocument();
    });

    it("leaves a blank grid's slider to the pointer, and resizes it live", () => {
        renderToolbar();

        expect(slider()).not.toHaveClass("pointer-events-none");
        expect(press().defaultPrevented).toBe(false);

        drag(20, 8);

        expect(store().gridSize).toBe(8);
        expect(screen.getByText("8 X 8")).toBeInTheDocument();
        expectNoDialog();
    });

    it("leaves a blank grid's keys to the browser", () => {
        renderToolbar();

        expect(pressKey("ArrowRight").defaultPrevented).toBe(false);
        expectNoDialog();
    });

    describe("over a drawing", () => {
        it("takes the slider out of the pointer's reach", async () => {
            renderToolbar();
            paintStroke(0);

            await waitFor(() =>
                expect(slider()).toHaveClass("pointer-events-none")
            );
        });

        it("asks as soon as the slider is pressed, before anything moves", async () => {
            renderToolbar();
            paintStroke(0);
            const before = store().colors;

            const event = press();

            const dialog = await findDialog();
            expect(dialog).toHaveAccessibleName(RESIZE_DIALOG_TITLE);
            expect(dialog).toHaveAccessibleDescription(RESIZE_WARNING);
            expect(button("Unlock")).toBeInTheDocument();
            expect(event.defaultPrevented).toBe(true);
            expect(slider()).toHaveValue("32");
            expect(store().colors).toBe(before);
        });

        it("puts focus on the slider, where closing the dialog hands it back", () => {
            renderToolbar();
            paintStroke(0);
            const focus = vi.spyOn(slider(), "focus");

            press();

            expect(focus).toHaveBeenCalledOnce();
        });

        it("ignores a press with any button but the primary one", () => {
            renderToolbar();
            paintStroke(0);

            fireEvent.pointerDown(slider(), { button: 2 });

            expectNoDialog();
        });

        it("drops a step that reaches it while locked", () => {
            // A drag begun on a blank grid can go on under the pointer while
            // a second finger paints.
            renderToolbar();
            paintStroke(0);

            drag(8);

            expect(store().gridSize).toBe(32);
            expect(slider()).toHaveValue("32");
        });

        it("keeps the drawing and stays locked when cancelled", async () => {
            renderToolbar();
            paintStroke(0);
            const before = store().colors;

            press();
            await userEvent.click(button("Cancel"));

            expect(store().colors).toBe(before);
            expectNoDialog();

            press();

            expect(await findDialog()).toHaveAccessibleName(RESIZE_DIALOG_TITLE);
        });

        it("only unlocks, leaving the drawing, its history and the size alone", async () => {
            renderToolbar();
            paintStroke(0);
            const before = store().colors;

            press();
            await userEvent.click(button("Unlock"));

            expect(store().colors).toBe(before);
            expect(store().gridSize).toBe(32);
            expect(selectCanUndo(store())).toBe(true);
            expectNoDialog();
            await waitFor(() =>
                expect(slider()).not.toHaveClass("pointer-events-none")
            );
        });

        it("erases the drawing only once the unlocked slider actually moves", async () => {
            renderToolbar();
            paintStroke(0);

            press();
            await userEvent.click(button("Unlock"));

            expect(press().defaultPrevented).toBe(false);
            drag(8);

            expect(store().gridSize).toBe(8);
            expect(isBlank()).toBe(true);
            expect(selectCanUndo(store())).toBe(false);
            expectNoDialog();
        });

        it.each([
            "ArrowRight",
            "ArrowUp",
            "PageUp",
            "End",
            "ArrowLeft",
            "ArrowDown",
            "PageDown",
            "Home",
        ])(
            "asks before %s steps it, and leaves the next press of it to the browser once unlocked",
            async (key) => {
                renderToolbar();
                paintStroke(0);
                const before = store().colors;

                expect(pressKey(key).defaultPrevented).toBe(true);
                expect(await findDialog()).toHaveAccessibleName(RESIZE_DIALOG_TITLE);

                await userEvent.click(button("Unlock"));

                expect(store().gridSize).toBe(32);
                expect(store().colors).toBe(before);
                expect(pressKey(key).defaultPrevented).toBe(false);
            }
        );

        it("leaves a key that would not step it to the browser", () => {
            renderToolbar();
            paintStroke(0);

            expect(pressKey("Tab").defaultPrevented).toBe(false);
            expectNoDialog();
        });

        it.each([
            [MIN_GRID_SIZE, "ArrowLeft"],
            [MIN_GRID_SIZE, "Home"],
            [MAX_GRID_SIZE, "ArrowRight"],
            [MAX_GRID_SIZE, "End"],
        ])(
            "asks nothing at size %i for %s, which cannot move it any further",
            async (size, key) => {
                renderToolbar();
                switchToGridSize(size);
                paintStroke(0);
                // A key is judged against the size the slider shows, so this
                // waits for the slider to catch up with the store first.
                await waitFor(() =>
                    expect(slider()).toHaveValue(String(size))
                );

                expect(pressKey(key).defaultPrevented).toBe(false);
                expectNoDialog();
            }
        );

        it("locks again once the drawing changes after unlocking", async () => {
            renderToolbar();
            paintStroke(0);

            press();
            await userEvent.click(button("Unlock"));
            paintStroke(1);
            press();

            expect(await findDialog()).toHaveAccessibleName(RESIZE_DIALOG_TITLE);
        });

        it("asks when the grid was cleared but the clear can still be undone", async () => {
            renderToolbar();
            paintStroke(0);
            store().clearGrid();

            press();

            expect(await findDialog()).toHaveAccessibleName(RESIZE_DIALOG_TITLE);
        });

        it("stops asking for the visit once unlocked with Don't ask again ticked", async () => {
            renderToolbar();
            paintStroke(0);

            press();
            await userEvent.click(dontAskAgain());
            await userEvent.click(button("Unlock"));
            // A new stroke lapses the unlock, so only the checkbox can be what
            // keeps the slider free after it.
            paintStroke(1);

            expect(press().defaultPrevented).toBe(false);
            drag(16);

            expect(store().gridSize).toBe(16);
            expectNoDialog();
        });

        it("keeps asking when Don't ask again is ticked but the question is cancelled", async () => {
            renderToolbar();
            paintStroke(0);

            press();
            await userEvent.click(dontAskAgain());
            await userEvent.click(button("Cancel"));
            press();

            expect(await findDialog()).toHaveAccessibleName(RESIZE_DIALOG_TITLE);
        });
    });
});

describe("color", () => {
    it("writes the picked color into the store, normalized", () => {
        renderToolbar();

        fireEvent.change(screen.getByLabelText("Color", { selector: "input" }), {
            target: { value: "#3ea6ff" },
        });

        expect(store().penColor).toBe("#3EA6FF");
    });
});

describe("history buttons", () => {
    it("disables undo and redo when there is nothing to step through", () => {
        renderToolbar();

        expect(button("Undo")).toBeDisabled();
        expect(button("Redo")).toBeDisabled();
    });

    it("enables undo after a stroke and steps back and forward through it", async () => {
        renderToolbar();
        paintStroke(0);

        await waitFor(() => expect(button("Undo")).toBeEnabled());
        await userEvent.click(button("Undo"));

        expect(store().colors[0]).toBe(BLANK_CELL_COLOR);

        await waitFor(() => expect(button("Redo")).toBeEnabled());
        await userEvent.click(button("Redo"));

        expect(store().colors[0]).toBe(PEN);
    });
});

describe("clear", () => {
    it("blanks the canvas", async () => {
        renderToolbar();
        paintStroke(0, 1, 2);

        await userEvent.click(button("Clear Grid"));

        expect(isBlank()).toBe(true);
    });
});

describe("saving", () => {
    /**
     * Compression is the one step of saving that can fail outright, so it is
     * where the failure path is triggered from.
     */
    const breakCompression = () =>
        vi.stubGlobal(
            "CompressionStream",
            class {
                constructor() {
                    throw new Error("unavailable");
                }
            }
        );

    it("downloads the sketch as a binary file that parses back to the canvas", async () => {
        renderToolbar();
        paintStroke(0);

        await userEvent.click(button("Save Grid"));

        await waitFor(() =>
            expect(recording.downloads.map((one) => one.fileName)).toEqual([
                "sketch.skpd",
            ])
        );

        const [blob] = recording.blobs;
        expect(blob.type).toBe(SKETCH_FILE_MIME_TYPE);
        expect(
            await parseSketch(new Uint8Array(await blob.arrayBuffer()))
        ).toEqual({
            ok: true,
            sketch: { gridSize: store().gridSize, colors: store().colors },
        });
    });

    it("saves far fewer bytes than one JSON color string per cell", async () => {
        renderToolbar();
        paintStroke(0, 1, 2);

        await userEvent.click(button("Save Grid"));
        await waitFor(() => expect(recording.blobs).toHaveLength(1));

        // The same 32x32 grid as a JSON array of hex strings is about 10 kB,
        // which is what makes this threshold a meaningful one.
        expect(recording.blobs[0].size).toBeLessThan(256);
    });

    it("reports the failure in a dialog instead of downloading a broken file", async () => {
        breakCompression();
        renderToolbar();

        await userEvent.click(button("Save Grid"));

        const dialog = await findDialog();
        expect(dialog).toHaveAccessibleName(SAVE_FAILED.title);
        expect(dialog).toHaveAccessibleDescription(SAVE_FAILED.message);
        expect(dialog).toHaveFocus();
        expect(recording.downloads).toEqual([]);
    });

    it("cancels without trying again", async () => {
        breakCompression();
        renderToolbar();

        await userEvent.click(button("Save Grid"));
        await findDialog();
        await userEvent.click(button(SAVE_FAILED.dismissLabel));

        expectNoDialog();
        expect(recording.downloads).toEqual([]);
    });

    it("saves once trying again succeeds", async () => {
        breakCompression();
        renderToolbar();

        await userEvent.click(button("Save Grid"));
        await findDialog();
        vi.unstubAllGlobals();
        await userEvent.click(button(SAVE_FAILED.actionLabel));

        await waitFor(() =>
            expect(recording.downloads.map((one) => one.fileName)).toEqual([
                "sketch.skpd",
            ])
        );
        expectNoDialog();
    });

    it("reports the failure afresh when trying again fails too", async () => {
        breakCompression();
        const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
        renderToolbar();

        await userEvent.click(button("Save Grid"));
        await findDialog();
        await userEvent.click(button(SAVE_FAILED.actionLabel));

        await waitFor(() => expect(showModal).toHaveBeenCalledTimes(2));
        expect(await findDialog()).toHaveAccessibleName(SAVE_FAILED.title);
        expect(recording.downloads).toEqual([]);
    });
});

describe("exporting a screenshot", () => {
    it("downloads the canvas as a PNG", async () => {
        stubCanvas2d();
        renderToolbar();

        await userEvent.click(button("Screenshot"));

        expect(recording.downloads).toEqual([
            { fileName: "sketch.png", href: STUB_PNG_DATA_URL },
        ]);
    });

    it("reports the failure in a dialog instead of downloading nothing", async () => {
        stubCanvas2dUnavailable();
        renderToolbar();

        await userEvent.click(button("Screenshot"));

        const dialog = await findDialog();
        expect(dialog).toHaveAccessibleName(EXPORT_FAILED.title);
        expect(dialog).toHaveAccessibleDescription(EXPORT_FAILED.message);
        expect(dialog).toHaveFocus();
        expect(recording.downloads).toEqual([]);
    });

    it("cancels without trying again", async () => {
        stubCanvas2dUnavailable();
        renderToolbar();

        await userEvent.click(button("Screenshot"));
        await findDialog();
        await userEvent.click(button(EXPORT_FAILED.dismissLabel));

        expectNoDialog();
        expect(recording.downloads).toEqual([]);
    });

    it("exports once trying again succeeds", async () => {
        stubCanvas2dUnavailable();
        renderToolbar();

        await userEvent.click(button("Screenshot"));
        await findDialog();
        stubCanvas2d();
        await userEvent.click(button(EXPORT_FAILED.actionLabel));

        expect(recording.downloads).toEqual([
            { fileName: "sketch.png", href: STUB_PNG_DATA_URL },
        ]);
        expectNoDialog();
    });
});

describe("loading", () => {
    const smallSketch = () => {
        const colors = createBlankGrid(4);
        colors[5] = "#3EA6FF";

        return { gridSize: 4, colors };
    };

    /** Every file that reads but is refused, with a name to report it by. */
    const refusedFiles: [LoadFailure, string, () => Promise<BlobPart>][] = [
        ["not-a-sketch", "notes.txt", async () => "this is not a sketch"],
        [
            "unsupported",
            "future.skpd",
            async () => {
                const file = await serializeSketch(artworkSketch(4));
                file[5] = 9;
                return file;
            },
        ],
        [
            "damaged",
            "broken.skpd",
            async () => {
                const file = await serializeSketch(artworkSketch(16));
                file[file.length - 3] ^= 0xff;
                return file;
            },
        ],
    ];

    /**
     * A file moved or deleted between being picked and being read. The browser
     * only discovers this at `arrayBuffer`, and `parseSketch` never sees the
     * bytes — so this rejects rather than returning a reason, which is the case
     * a decode-only failure path would let escape unhandled.
     */
    const selectUnreadableFile = () => {
        const file = new File(["ignored"], "sketch.skpd");
        vi.spyOn(file, "arrayBuffer").mockRejectedValue(
            new DOMException("A requested file could not be found", "NotFoundError")
        );
        fireEvent.change(fileInput(), { target: { files: [file] } });
    };

    it("opens the file picker from the Load Grid button", async () => {
        renderToolbar();
        const click = vi.spyOn(fileInput(), "click");

        await userEvent.click(button("Load Grid"));

        expect(click).toHaveBeenCalledOnce();
    });

    it("accepts only sketch files", () => {
        renderToolbar();

        expect(fileInput()).toHaveAttribute("accept", ".skpd");
    });

    it("loads a valid sketch onto a blank canvas without asking", async () => {
        renderToolbar();

        const sketch = smallSketch();
        const input = selectFile(await serializeSketch(sketch));

        await waitFor(() => expect(store().gridSize).toBe(4));
        expect(store().colors).toEqual(sketch.colors);
        expect(input.value).toBe("");
        expectNoDialog();
    });

    it.each(refusedFiles)(
        "reports a %s file by name, keeps the canvas and asks nothing",
        async (reason, fileName, contents) => {
            renderToolbar();
            paintStroke(0);
            const before = store().colors;

            const input = selectFile(await contents(), fileName);

            const { title, message } = LOAD_FAILED[reason](fileName);
            const dialog = await findDialog();
            expect(dialog).toHaveAccessibleName(title);
            expect(dialog).toHaveAccessibleDescription(message);
            expect(dialog).toHaveFocus();
            expect(store().colors).toBe(before);
            // Cleared on the failure path too, so the same file can be retried.
            expect(input.value).toBe("");
        }
    );

    it.each(refusedFiles)(
        "offers to choose another file after a %s one",
        async (reason, fileName, contents) => {
            renderToolbar();
            const click = vi.spyOn(fileInput(), "click");

            selectFile(await contents(), fileName);
            await findDialog();
            await userEvent.click(button(LOAD_FAILED[reason](fileName).actionLabel));

            expect(click).toHaveBeenCalledOnce();
            expectNoDialog();
        }
    );

    it("reports the failure when the file itself cannot be read", async () => {
        renderToolbar();
        paintStroke(0);
        const before = store().colors;

        selectUnreadableFile();

        const { title, message } = LOAD_FAILED.unreadable("sketch.skpd");
        const dialog = await findDialog();
        expect(dialog).toHaveAccessibleName(title);
        expect(dialog).toHaveAccessibleDescription(message);
        expect(dialog).toHaveFocus();
        expect(store().colors).toBe(before);
    });

    it("offers to choose another file when the file could not be read", async () => {
        renderToolbar();
        const click = vi.spyOn(fileInput(), "click");

        selectUnreadableFile();
        await findDialog();
        await userEvent.click(
            button(LOAD_FAILED.unreadable("sketch.skpd").actionLabel)
        );

        expect(click).toHaveBeenCalledOnce();
        expectNoDialog();
    });

    it("does nothing when the picker is dismissed without a file", () => {
        renderToolbar();

        fireEvent.change(fileInput(), { target: { files: [] } });

        expectNoDialog();
        expect(store().gridSize).toBe(32);
    });

    describe("over a drawing", () => {
        const loadOverDrawing = async () => {
            renderToolbar();
            paintStroke(0);
            const before = store().colors;

            const sketch = smallSketch();
            selectFile(await serializeSketch(sketch), "cat.skpd");

            return { before, sketch };
        };

        it("asks before replacing it, naming the file and its size, and replaces it once confirmed", async () => {
            const { sketch } = await loadOverDrawing();

            const dialog = await findDialog();
            expect(dialog).toHaveAccessibleName(replaceTitle("cat.skpd"));
            expect(dialog).toHaveAccessibleDescription(replaceWarning(sketch));
            expect(store().gridSize).toBe(32);

            await userEvent.click(button("Replace drawing"));

            expect(store().gridSize).toBe(4);
            expect(store().colors).toEqual(sketch.colors);
            expectNoDialog();
        });

        it("keeps the drawing when cancelled", async () => {
            const { before } = await loadOverDrawing();

            await findDialog();
            await userEvent.click(button("Cancel"));

            expect(store().colors).toBe(before);
            expectNoDialog();
        });

        it("stops asking once confirmed with Don't ask again ticked", async () => {
            await loadOverDrawing();

            await findDialog();
            await userEvent.click(dontAskAgain());
            await userEvent.click(button("Replace drawing"));

            paintStroke(0);
            selectFile(await serializeSketch(artworkSketch(8)));

            await waitFor(() => expect(store().gridSize).toBe(8));
            expectNoDialog();
        });

        it("asks independently of the resize question", async () => {
            renderToolbar();
            store().stopAskingBeforeResize();
            paintStroke(0);

            selectFile(await serializeSketch(smallSketch()));

            expect(await findDialog()).toHaveAccessibleName(
                replaceTitle("sketch.skpd")
            );
        });
    });
});
