/**
 * @file Covers `Toolbar` and, through it, `useSketchFiles`: that each control
 * reaches the store, and that saving, loading and exporting report failure in the
 * page rather than throwing.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import {
    recordDownloads,
    stubCanvas2d,
    stubCanvas2dUnavailable,
    STUB_PNG_DATA_URL,
    type DownloadRecording,
} from "../../test/browserStubs";
import { paintStroke, store } from "../../test/storeHelpers";
import {
    EXPORT_FAILED_MESSAGE,
    LOAD_FAILED_MESSAGE,
    SAVE_FAILED_MESSAGE,
} from "./useSketchFiles";
import { Toolbar } from "./Toolbar";

const PEN = "#000000";

const renderToolbar = (isOpen = true) => render(<Toolbar isOpen={isOpen} />);

const button = (name: string) => screen.getByRole("button", { name });

const panel = () => screen.getByRole("complementary", { name: "Settings" });

const fileInput = () => screen.getByLabelText("Sketch file") as HTMLInputElement;

const selectFile = (contents: BlobPart) => {
    const input = fileInput();

    fireEvent.change(input, {
        target: {
            files: [
                new File([contents], "sketch.skpd", {
                    type: SKETCH_FILE_MIME_TYPE,
                }),
            ],
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

        expect(store().colors.every((color) => color === BLANK_CELL_COLOR)).toBe(
            true
        );
    });
});

describe("saving", () => {
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
        ).toEqual({ gridSize: store().gridSize, colors: store().colors });
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

    it("reports the failure instead of downloading a broken file", async () => {
        // Compression is the one step of saving that can fail outright, so it is
        // where the failure path is triggered from.
        vi.stubGlobal(
            "CompressionStream",
            class {
                constructor() {
                    throw new Error("unavailable");
                }
            }
        );
        renderToolbar();

        await userEvent.click(button("Save Grid"));

        expect(await screen.findByRole("alert")).toHaveTextContent(
            SAVE_FAILED_MESSAGE
        );
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

    it("reports the failure instead of downloading nothing", async () => {
        stubCanvas2dUnavailable();
        renderToolbar();

        await userEvent.click(button("Screenshot"));

        expect(await screen.findByRole("alert")).toHaveTextContent(
            EXPORT_FAILED_MESSAGE
        );
        expect(recording.downloads).toEqual([]);
    });
});

describe("loading", () => {
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

    it("loads a valid sketch onto the canvas", async () => {
        renderToolbar();

        const colors = createBlankGrid(4);
        colors[5] = "#3EA6FF";
        const input = selectFile(await serializeSketch({ gridSize: 4, colors }));

        await waitFor(() => expect(store().gridSize).toBe(4));
        expect(store().colors).toEqual(colors);
        expect(input.value).toBe("");
    });

    it("reports the failure and keeps the canvas when the file is not a sketch", async () => {
        renderToolbar();
        paintStroke(0);
        const before = store().colors;

        selectFile("this is not a sketch");

        expect(await screen.findByRole("alert")).toHaveTextContent(
            LOAD_FAILED_MESSAGE
        );
        expect(store().colors).toBe(before);
    });

    it("clears an earlier failure once a sketch loads", async () => {
        renderToolbar();

        selectFile("this is not a sketch");
        await screen.findByRole("alert");

        selectFile(
            await serializeSketch({ gridSize: 4, colors: createBlankGrid(4) })
        );

        await waitFor(() => expect(store().gridSize).toBe(4));
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("reports the failure when the file itself cannot be read", async () => {
        // A file moved or deleted between being picked and being read. The
        // browser only discovers this at `arrayBuffer`, and `parseSketch` never
        // sees the bytes — so this rejects rather than returning null, which is
        // the case a decode-only failure path would let escape unhandled.
        renderToolbar();
        paintStroke(0);
        const before = store().colors;

        const file = new File(["ignored"], "sketch.skpd");
        vi.spyOn(file, "arrayBuffer").mockRejectedValue(
            new DOMException("A requested file could not be found", "NotFoundError")
        );
        fireEvent.change(fileInput(), { target: { files: [file] } });

        expect(await screen.findByRole("alert")).toHaveTextContent(
            LOAD_FAILED_MESSAGE
        );
        expect(store().colors).toBe(before);
    });

    it("does nothing when the picker is dismissed without a file", () => {
        renderToolbar();

        fireEvent.change(fileInput(), { target: { files: [] } });

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(store().gridSize).toBe(32);
    });
});
