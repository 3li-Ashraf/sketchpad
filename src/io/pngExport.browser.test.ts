/**
 * @file The PNG export decoded by a real browser: that the file is a PNG, of
 * the right size, with every pixel its cell's color and hard edges between
 * cells. The jsdom suite can only record the calls that draw it.
 */

import { describe, expect, it } from "vitest";

import { hexToRgb } from "../domain/color";
import { createBlankGrid, type Sketch } from "../domain/grid";
import { renderSketchPng } from "./pngExport";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const decode = async (png: Blob): Promise<ImageData> => {
    const bitmap = await createImageBitmap(png);
    // A plain canvas: WebKit on Windows has no OffscreenCanvas.
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);

    return context.getImageData(0, 0, bitmap.width, bitmap.height);
};

// Neighbors differ in every channel, so any blending at an edge shows.
const checkerboard = (): Sketch => {
    const colors = createBlankGrid(3);
    colors[1] = "#000000";
    colors[3] = "#3EA6FF";
    colors[5] = "#123456";
    colors[7] = "#FF0000";

    return { gridSize: 3, colors };
};

describe("renderSketchPng in a real browser", () => {
    it("produces a PNG file", async () => {
        const png = await renderSketchPng(checkerboard(), 10);
        const head = new Uint8Array(await png.slice(0, 8).arrayBuffer());

        expect(png.type).toBe("image/png");
        expect([...head]).toEqual(PNG_SIGNATURE);
    });

    it("decodes to exactly each cell's color, pixel for pixel", async () => {
        const sketch = checkerboard();
        const cellSize = 50;

        const image = await decode(await renderSketchPng(sketch, cellSize));

        expect([image.width, image.height]).toEqual([150, 150]);

        // Every pixel, not a sample: nearest-neighbour scaling leaves no pixel
        // that is not exactly its cell's color, so an edge blurred by even one
        // pixel fails here.
        const mismatches: string[] = [];
        for (let y = 0; y < image.height; y++) {
            for (let x = 0; x < image.width; x++) {
                const cell =
                    Math.floor(y / cellSize) * sketch.gridSize +
                    Math.floor(x / cellSize);
                const [red, green, blue] = hexToRgb(sketch.colors[cell]);
                const at = (y * image.width + x) * 4;
                const actual = [...image.data.subarray(at, at + 4)];

                if (actual.join() !== [red, green, blue, 255].join()) {
                    mismatches.push(`(${x}, ${y})`);
                }
            }
        }

        expect(mismatches).toEqual([]);
    });

    it("renders the largest grid at full size", async () => {
        const image = await decode(
            await renderSketchPng({
                gridSize: 64,
                colors: createBlankGrid(64),
            })
        );

        expect([image.width, image.height]).toEqual([3200, 3200]);
    });
});
