/**
 * @file Saving, opening and exporting through the settings panel: what each
 * downloads or loads, the question asked before a file replaces a drawing, and
 * the dialog every failure raises with the next step it offers.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createBlankGrid } from "../../domain/grid";
import {
    decodeSketch,
    encodeSketch,
    SKETCH_FILE_MIME_TYPE,
    type SketchReadFailure,
} from "../../io/sketchFile";
import {
    type DownloadRecording,
    recordDownloads,
    STUB_OBJECT_URL,
    STUB_PNG,
    stubCanvas2d,
    stubCanvas2dUnavailable,
} from "../../test/jsdomStubs";
import { expectLogged, takeLogs } from "../../test/logCapture";
import {
    button,
    dontAskAgain,
    expectNoDialog,
    findDialog,
} from "../../test/queries";
import { artworkSketch } from "../../test/sketchFixtures";
import {
    actions,
    canvasColors,
    paintStroke,
    store,
} from "../../test/storeHelpers";
import { Toolbar } from "../toolbar/Toolbar";
import {
    EXPORT_FAILED,
    LOAD_FAILED,
    replaceQuestion,
    SAVE_FAILED,
} from "./fileMessages";

const renderToolbar = () => render(<Toolbar isOpen />);

const fileInput = () => screen.getByLabelText<HTMLInputElement>("Sketch file");

const selectFile = (contents: BlobPart, fileName = "sketch.skpd") => {
    const input = fileInput();

    fireEvent.change(input, {
        target: {
            files: [
                new File([contents], fileName, { type: SKETCH_FILE_MIME_TYPE }),
            ],
        },
    });

    return input;
};

let recording: DownloadRecording;

beforeEach(() => {
    recording = recordDownloads();
});

/** The replace question's title, which names the file alone. */
const replaceTitle = (fileName: string) =>
    replaceQuestion(fileName, artworkSketch(1)).title;

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

        await userEvent.click(button("Save sketch"));

        await waitFor(() =>
            expect(recording.downloads.map((one) => one.fileName)).toEqual([
                "sketch.skpd",
            ])
        );

        const [blob] = recording.blobs;
        expect(blob.type).toBe(SKETCH_FILE_MIME_TYPE);
        expect(
            await decodeSketch(new Uint8Array(await blob.arrayBuffer()))
        ).toEqual({
            ok: true,
            sketch: {
                gridSize: store().document.gridSize,
                colors: canvasColors(),
            },
        });
    });

    it("reports the failure in a dialog instead of downloading a broken file", async () => {
        breakCompression();
        renderToolbar();

        await userEvent.click(button("Save sketch"));

        const dialog = await findDialog();
        expect(dialog).toHaveAccessibleName(SAVE_FAILED.title);
        expect(dialog).toHaveAccessibleDescription(SAVE_FAILED.message);
        expect(dialog).toHaveFocus();
        expect(recording.downloads).toEqual([]);
        // The dialog tells the user; the log keeps the cause for developers.
        expectLogged("error", "files", "save failed", {
            error: expect.objectContaining({ message: "unavailable" }),
        });
    });

    it("cancels without trying again", async () => {
        breakCompression();
        renderToolbar();

        await userEvent.click(button("Save sketch"));
        await findDialog();
        await userEvent.click(button(SAVE_FAILED.dismissLabel));

        expectNoDialog();
        expect(recording.downloads).toEqual([]);
        expectLogged("error", "files", "save failed");
    });

    it("saves once trying again succeeds", async () => {
        breakCompression();
        renderToolbar();

        await userEvent.click(button("Save sketch"));
        await findDialog();
        expectLogged("error", "files", "save failed");
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

        await userEvent.click(button("Save sketch"));
        await findDialog();
        await userEvent.click(button(SAVE_FAILED.actionLabel));

        await waitFor(() => expect(showModal).toHaveBeenCalledTimes(2));
        expect(await findDialog()).toHaveAccessibleName(SAVE_FAILED.title);
        expect(recording.downloads).toEqual([]);
        expect(takeLogs().map(({ message }) => message)).toEqual([
            "save failed",
            "save failed",
        ]);
    });
});

describe("exporting a PNG", () => {
    it("downloads the canvas as a PNG", async () => {
        stubCanvas2d();
        renderToolbar();

        await userEvent.click(button("Export PNG"));

        await waitFor(() =>
            expect(recording.downloads).toEqual([
                { fileName: "sketch.png", href: STUB_OBJECT_URL },
            ])
        );
        expect(recording.blobs).toEqual([STUB_PNG]);
    });

    it("reports the failure in a dialog instead of downloading nothing", async () => {
        stubCanvas2dUnavailable();
        renderToolbar();

        await userEvent.click(button("Export PNG"));

        const dialog = await findDialog();
        expect(dialog).toHaveAccessibleName(EXPORT_FAILED.title);
        expect(dialog).toHaveAccessibleDescription(EXPORT_FAILED.message);
        expect(dialog).toHaveFocus();
        expect(recording.downloads).toEqual([]);
        expectLogged("error", "files", "export failed", {
            error: expect.objectContaining<{ message: unknown }>({
                message: expect.stringContaining("No 2D context"),
            }),
        });
    });

    it("cancels without trying again", async () => {
        stubCanvas2dUnavailable();
        renderToolbar();

        await userEvent.click(button("Export PNG"));
        await findDialog();
        await userEvent.click(button(EXPORT_FAILED.dismissLabel));

        expectNoDialog();
        expect(recording.downloads).toEqual([]);
        expectLogged("error", "files", "export failed");
    });

    it("exports once trying again succeeds", async () => {
        stubCanvas2dUnavailable();
        renderToolbar();

        await userEvent.click(button("Export PNG"));
        await findDialog();
        expectLogged("error", "files", "export failed");
        stubCanvas2d();
        await userEvent.click(button(EXPORT_FAILED.actionLabel));

        await waitFor(() =>
            expect(recording.downloads).toEqual([
                { fileName: "sketch.png", href: STUB_OBJECT_URL },
            ])
        );
        expect(recording.blobs).toEqual([STUB_PNG]);
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
    const refusedFiles: [SketchReadFailure, string, () => Promise<BlobPart>][] =
        [
            [
                "not-a-sketch",
                "notes.txt",
                () => Promise.resolve("this is not a sketch"),
            ],
            [
                "unsupported",
                "future.skpd",
                async () => {
                    const file = await encodeSketch(artworkSketch(4));
                    file[5] = 9;
                    return file;
                },
            ],
            [
                "damaged",
                "broken.skpd",
                async () => {
                    const file = await encodeSketch(artworkSketch(16));
                    file[file.length - 3] ^= 0xff;
                    return file;
                },
            ],
        ];

    /** A file moved or deleted between being picked and being read. */
    const selectUnreadableFile = () => {
        const file = new File(["ignored"], "sketch.skpd");
        vi.spyOn(Blob.prototype, "arrayBuffer").mockRejectedValue(
            new DOMException(
                "A requested file could not be found",
                "NotFoundError"
            )
        );
        fireEvent.change(fileInput(), { target: { files: [file] } });
    };

    it("opens the file picker from the Open sketch button", async () => {
        renderToolbar();
        const click = vi.spyOn(fileInput(), "click");

        await userEvent.click(button("Open sketch"));

        expect(click).toHaveBeenCalledOnce();
    });

    it("accepts only sketch files", () => {
        renderToolbar();

        expect(fileInput()).toHaveAttribute("accept", ".skpd");
    });

    it("loads a valid sketch onto a blank canvas without asking", async () => {
        renderToolbar();

        const sketch = smallSketch();
        const input = selectFile(await encodeSketch(sketch));

        await waitFor(() => expect(store().document.gridSize).toBe(4));
        expect(canvasColors()).toEqual(sketch.colors);
        expect(input.value).toBe("");
        expectNoDialog();
    });

    it.each(refusedFiles)(
        "reports a %s file by name, keeps the canvas and asks nothing",
        async (reason, fileName, contents) => {
            renderToolbar();
            paintStroke(0);
            const before = canvasColors();

            const input = selectFile(await contents(), fileName);

            const { title, message } = LOAD_FAILED[reason](fileName);
            const dialog = await findDialog();
            expect(dialog).toHaveAccessibleName(title);
            expect(dialog).toHaveAccessibleDescription(message);
            expect(dialog).toHaveFocus();
            expect(canvasColors()).toBe(before);
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
            await userEvent.click(
                button(LOAD_FAILED[reason](fileName).actionLabel)
            );

            expect(click).toHaveBeenCalledOnce();
            expectNoDialog();
        }
    );

    it("reports the failure when the file itself cannot be read", async () => {
        renderToolbar();
        paintStroke(0);
        const before = canvasColors();

        selectUnreadableFile();

        const { title, message } = LOAD_FAILED.unreadable("sketch.skpd");
        const dialog = await findDialog();
        expect(dialog).toHaveAccessibleName(title);
        expect(dialog).toHaveAccessibleDescription(message);
        expect(dialog).toHaveFocus();
        expect(canvasColors()).toBe(before);
        expectLogged("warn", "files", "file could not be read");
    });

    it("offers to choose another file when the file could not be read", async () => {
        renderToolbar();
        const click = vi.spyOn(fileInput(), "click");

        selectUnreadableFile();
        await findDialog();
        expectLogged("warn", "files", "file could not be read");
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
        expect(store().document.gridSize).toBe(32);
    });

    describe("over a drawing", () => {
        const loadOverDrawing = async () => {
            renderToolbar();
            paintStroke(0);
            const before = canvasColors();

            const sketch = smallSketch();
            selectFile(await encodeSketch(sketch), "cat.skpd");

            return { before, sketch };
        };

        it("asks before replacing it, naming the file and its size, and replaces it once confirmed", async () => {
            const { sketch } = await loadOverDrawing();

            const dialog = await findDialog();
            const question = replaceQuestion("cat.skpd", sketch);
            expect(dialog).toHaveAccessibleName(question.title);
            expect(dialog).toHaveAccessibleDescription(question.message);
            expect(store().document.gridSize).toBe(32);

            await userEvent.click(button("Replace drawing"));

            expect(store().document.gridSize).toBe(4);
            expect(canvasColors()).toEqual(sketch.colors);
            expectNoDialog();
        });

        it("keeps the drawing when cancelled", async () => {
            const { before } = await loadOverDrawing();

            await findDialog();
            await userEvent.click(button("Cancel"));

            expect(canvasColors()).toBe(before);
            expectNoDialog();
        });

        it("stops asking once confirmed with Don't ask again ticked", async () => {
            await loadOverDrawing();

            await findDialog();
            await userEvent.click(dontAskAgain());
            await userEvent.click(button("Replace drawing"));

            paintStroke(0);
            selectFile(await encodeSketch(artworkSketch(8)));

            await waitFor(() => expect(store().document.gridSize).toBe(8));
            expectNoDialog();
        });

        it("asks again next time when Don't ask again was left unticked", async () => {
            await loadOverDrawing();
            await findDialog();
            await userEvent.click(button("Replace drawing"));

            paintStroke(0);
            selectFile(await encodeSketch(artworkSketch(8)), "dog.skpd");

            expect(await findDialog()).toHaveAccessibleName(
                replaceTitle("dog.skpd")
            );
        });

        it("asks independently of the resize question", async () => {
            renderToolbar();
            actions().stopAskingBefore("resize");
            paintStroke(0);

            selectFile(await encodeSketch(smallSketch()));

            expect(await findDialog()).toHaveAccessibleName(
                replaceTitle("sketch.skpd")
            );
        });
    });
});

describe("dropping a file on the page", () => {
    /** A drag event carrying files, or text when there are none. */
    const dragEvent = (type: "dragover" | "drop", files: File[] = []) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, "dataTransfer", {
            value: {
                types: files.length > 0 ? ["Files"] : ["text/plain"],
                files,
                dropEffect: "none",
            },
        });

        return event as DragEvent;
    };

    const drop = (file: File) => {
        const event = dragEvent("drop", [file]);
        window.dispatchEvent(event);

        return event;
    };

    const sketchFile = async (name = "cat.skpd") =>
        new File([await encodeSketch(artworkSketch(4))], name);

    it("opens it like a picked file, instead of letting the browser navigate to it", async () => {
        renderToolbar();

        const over = dragEvent("dragover", [await sketchFile()]);
        window.dispatchEvent(over);
        const dropped = drop(await sketchFile());

        expect(over.defaultPrevented).toBe(true);
        expect(over.dataTransfer!.dropEffect).toBe("copy");
        expect(dropped.defaultPrevented).toBe(true);
        await waitFor(() => expect(store().document.gridSize).toBe(4));
        expect(canvasColors()).toEqual(artworkSketch(4).colors);
    });

    it("reports a file that is not a sketch, like a picked one", async () => {
        renderToolbar();

        drop(new File(["hello"], "notes.txt"));

        expect(await findDialog()).toHaveAccessibleName(
            LOAD_FAILED["not-a-sketch"]("notes.txt").title
        );
    });

    it("asks before replacing a drawing, like a picked file", async () => {
        renderToolbar();
        paintStroke(0);

        drop(await sketchFile());

        expect(await findDialog()).toHaveAccessibleName(
            replaceTitle("cat.skpd")
        );
    });

    it("leaves a drag of text to the browser", () => {
        renderToolbar();

        const over = dragEvent("dragover");
        const dropped = dragEvent("drop");
        window.dispatchEvent(over);
        window.dispatchEvent(dropped);

        expect(over.defaultPrevented).toBe(false);
        expect(dropped.defaultPrevented).toBe(false);
    });

    it("refuses a drop while a dialog is open, but still keeps the page", async () => {
        renderToolbar();
        paintStroke(0);
        drop(await sketchFile("first.skpd"));
        await findDialog();

        const over = dragEvent("dragover", [await sketchFile("second.skpd")]);
        window.dispatchEvent(over);
        const read = vi.spyOn(Blob.prototype, "arrayBuffer");
        const second = drop(await sketchFile("second.skpd"));

        expect(over.dataTransfer!.dropEffect).toBe("none");
        expect(second.defaultPrevented).toBe(true);
        expect(read).not.toHaveBeenCalled();
        expect(await findDialog()).toHaveAccessibleName(
            replaceTitle("first.skpd")
        );
    });

    it("keeps the page, and opens nothing, for a drop of files that holds none", () => {
        renderToolbar();
        // As a folder dropped in some browsers: typed as files, with none.
        const dropped = dragEvent("drop");
        Object.defineProperty(dropped.dataTransfer, "types", {
            value: ["Files"],
        });

        window.dispatchEvent(dropped);

        expect(dropped.defaultPrevented).toBe(true);
        expectNoDialog();
    });

    it("leaves a drag with no data at all to the browser", () => {
        renderToolbar();

        const dropped = new Event("drop", { cancelable: true });
        window.dispatchEvent(dropped);

        expect(dropped.defaultPrevented).toBe(false);
    });

    it("stops listening once unmounted", async () => {
        const { unmount } = renderToolbar();
        unmount();

        const over = dragEvent("dragover", [await sketchFile()]);
        window.dispatchEvent(over);
        const dropped = drop(await sketchFile());

        expect(over.defaultPrevented).toBe(false);
        expect(dropped.defaultPrevented).toBe(false);
    });
});
