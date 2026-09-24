/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import { createBlankGrid } from "../domain/grid";
import {
    STUB_PNG,
    stubCanvas2d,
    stubCanvas2dUnavailable,
} from "../test/jsdomStubs";
import { expectInvalidInput } from "../test/logCapture";
import { DEFAULT_EXPORT_CELL_SIZE, renderSketchPng } from "./pngExport";

const twoByTwo = () => {
    const colors = createBlankGrid(2);
    colors[1] = "#3EA6FF";
    colors[2] = "#000000";

    return { gridSize: 2, colors };
};

const blank = (gridSize: number) => ({
    gridSize,
    colors: createBlankGrid(gridSize),
});

describe("renderSketchPng", () => {
    it("resolves to the encoded PNG", async () => {
        stubCanvas2d();

        expect(await renderSketchPng(twoByTwo(), 10)).toBe(STUB_PNG);
    });

    it("writes one opaque pixel per cell, row-major", async () => {
        const recording = stubCanvas2d();

        await renderSketchPng(twoByTwo(), 10);

        expect(recording.putImageData).toHaveLength(1);
        const [{ pixels, width, height }] = recording.putImageData;
        expect([width, height]).toEqual([2, 2]);
        // prettier-ignore
        expect([...pixels]).toEqual([
            255, 255, 255, 255,   62, 166, 255, 255,
              0,   0,   0, 255,  255, 255, 255, 255,
        ]);
    });

    it("scales the one-pixel-per-cell image up with smoothing off", async () => {
        // Smoothing is all that stands between a crisp export and a blurred
        // one, so it is asserted rather than assumed.
        const recording = stubCanvas2d();

        await renderSketchPng(twoByTwo(), 10);

        expect(recording.drawImage).toEqual([
            {
                sourceWidth: 2,
                sourceHeight: 2,
                destinationWidth: 20,
                destinationHeight: 20,
                smoothing: false,
            },
        ]);
    });

    it("sizes the image by grid size times cell size", async () => {
        const recording = stubCanvas2d();

        await renderSketchPng(blank(4), 10);

        const [source, output] = recording.canvases;
        expect([source.width, source.height]).toEqual([4, 4]);
        expect([output.width, output.height]).toEqual([40, 40]);
    });

    it("defaults to 50 image pixels per cell", async () => {
        const recording = stubCanvas2d();

        await renderSketchPng(blank(64));

        expect(DEFAULT_EXPORT_CELL_SIZE).toBe(50);
        expect(recording.canvases[1].width).toBe(3200);
    });

    it("rejects when no 2D context is available", async () => {
        stubCanvas2dUnavailable();

        await expect(renderSketchPng(blank(2))).rejects.toThrow();
    });

    it("rejects when the full-size canvas cannot be allocated", async () => {
        const recording = stubCanvas2d({ contextsAvailable: 1 });

        await expect(renderSketchPng(twoByTwo(), 10)).rejects.toThrow();
        expect(recording.drawImage).toEqual([]);
    });

    it("rejects when the browser cannot encode the image", async () => {
        stubCanvas2d({ encodes: false });

        await expect(renderSketchPng(twoByTwo(), 10)).rejects.toThrow();
    });

    it.each([
        ["too few colors", { gridSize: 2, colors: createBlankGrid(1) }],
        ["a color that is not one", { gridSize: 1, colors: ["red"] }],
    ])("rejects a sketch with %s, drawing nothing", async (_, sketch) => {
        const recording = stubCanvas2d();

        await expect(renderSketchPng(sketch)).rejects.toThrow(TypeError);
        expect(recording.canvases).toEqual([]);
        expectInvalidInput("renderSketchPng");
    });

    it.each([0, -50, 1.5, Number.NaN])(
        "rejects a cell size of %d, drawing nothing",
        async (cellSize) => {
            const recording = stubCanvas2d();

            await expect(renderSketchPng(twoByTwo(), cellSize)).rejects.toThrow(
                RangeError
            );
            expect(recording.canvases).toEqual([]);
            expectInvalidInput("renderSketchPng");
        }
    );

    it("never attaches a canvas to the document", async () => {
        stubCanvas2d();

        await renderSketchPng(twoByTwo(), 5);

        expect(document.querySelector("canvas")).toBeNull();
    });
});
