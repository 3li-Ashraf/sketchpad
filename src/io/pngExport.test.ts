/**
 * @file Covers `io/pngExport`. jsdom has no 2D canvas, so `stubCanvas2d` records
 * the calls the export makes and the assertions are about those calls rather
 * than about decoded image data.
 */

import { describe, expect, it } from "vitest";
import { createBlankGrid } from "../domain/grid";
import {
    stubCanvas2d,
    stubCanvas2dUnavailable,
    STUB_PNG_DATA_URL,
} from "../test/browserStubs";
import { DEFAULT_EXPORT_CELL_SIZE, sketchToPngDataUrl } from "./pngExport";

const twoByTwo = () => {
    const colors = createBlankGrid(2);
    colors[1] = "#3EA6FF";
    colors[2] = "#000000";

    return { gridSize: 2, colors };
};

describe("sketchToPngDataUrl", () => {
    it("returns the rendered canvas as a PNG data URL", () => {
        stubCanvas2d();

        expect(sketchToPngDataUrl(twoByTwo(), 10)).toBe(STUB_PNG_DATA_URL);
    });

    it("writes one opaque pixel per cell, row-major", () => {
        const recording = stubCanvas2d();

        sketchToPngDataUrl(twoByTwo(), 10);

        expect(recording.putImageData).toHaveLength(1);
        expect(recording.putImageData[0].width).toBe(2);
        expect(recording.putImageData[0].height).toBe(2);
        expect([...recording.putImageData[0].pixels]).toEqual([
            255, 255, 255, 255,
            62, 166, 255, 255,
            0, 0, 0, 255,
            255, 255, 255, 255,
        ]);
    });

    it("scales the one-pixel-per-cell image up with smoothing off", () => {
        // The smoothing flag is the only thing standing between a pixel-art
        // export and a blurred one, which is why it is asserted rather than
        // assumed.
        const recording = stubCanvas2d();

        sketchToPngDataUrl(twoByTwo(), 10);

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

    it("sizes the exported image by grid size and cell size", () => {
        const recording = stubCanvas2d();

        sketchToPngDataUrl({ gridSize: 4, colors: createBlankGrid(4) }, 10);

        const [source, output] = recording.canvases;
        expect([source.width, source.height]).toEqual([4, 4]);
        expect([output.width, output.height]).toEqual([40, 40]);
    });

    it("falls back to the default cell size", () => {
        const recording = stubCanvas2d();

        sketchToPngDataUrl({ gridSize: 4, colors: createBlankGrid(4) });

        expect(recording.canvases[1].width).toBe(4 * DEFAULT_EXPORT_CELL_SIZE);
    });

    it("exports the largest supported grid", () => {
        const recording = stubCanvas2d();

        sketchToPngDataUrl({ gridSize: 64, colors: createBlankGrid(64) }, 50);

        expect(recording.putImageData[0].pixels).toHaveLength(64 * 64 * 4);
        expect(recording.canvases[1].width).toBe(3200);
    });

    it("returns null when no 2D context is available", () => {
        stubCanvas2dUnavailable();

        expect(
            sketchToPngDataUrl({ gridSize: 2, colors: createBlankGrid(2) })
        ).toBeNull();
    });

    it("returns null when the full-size canvas cannot be allocated", () => {
        // A browser can refuse a 3200x3200 surface while granting the 64x64 one,
        // which is why the two contexts are checked separately.
        const recording = stubCanvas2d({ contextsAvailable: 1 });

        expect(sketchToPngDataUrl(twoByTwo(), 10)).toBeNull();
        expect(recording.drawImage).toEqual([]);
    });

    it("never attaches a canvas to the document", () => {
        stubCanvas2d();

        sketchToPngDataUrl(twoByTwo(), 5);

        expect(document.querySelectorAll("canvas")).toHaveLength(0);
    });
});
