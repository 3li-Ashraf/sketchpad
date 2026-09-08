/**
 * @file Covers `io/sketchFile`: that a round trip is pixel-identical at every
 * grid size, that the byte layout is what the header documents, and that a
 * malformed or hostile file is refused rather than trusted.
 */

import { describe, expect, it } from "vitest";
import { createBlankGrid, MAX_GRID_SIZE } from "../domain/grid";
import { artworkSketch, rainbowSketch } from "../test/sketchFixtures";
import { deflate, type Bytes } from "./compression";
import { parseSketch, serializeSketch } from "./sketchFile";

// Re-declared rather than imported, because they are private to the module under
// test: a change to the layout should break these tests instead of moving with it.
const MAGIC = [0x53, 0x4b, 0x50, 0x44];
const HEADER_SIZE = 6;
const PALETTE_MODE = 0;
const RGB_MODE = 1;
const MAX_PALETTE_LENGTH = 255;

/**
 * Wraps an arbitrary payload in a valid header and deflates it. Reaching the
 * payload checks requires getting past the magic, grid size and mode checks
 * first, so the malformed-payload cases are built through here rather than by
 * damaging a real file.
 */
const fileWith = async (
    payload: Bytes,
    { gridSize = 4, mode = RGB_MODE } = {}
): Promise<Bytes> => {
    const body = await deflate(payload);
    const file = new Uint8Array(HEADER_SIZE + body.length);

    file.set(MAGIC, 0);
    file[4] = gridSize;
    file[5] = mode;
    file.set(body, HEADER_SIZE);

    return file;
};

describe("round trip", () => {
    it.each([1, 2, 3, 7, 32, MAX_GRID_SIZE])(
        "restores a %i-cell-wide sketch exactly",
        async (gridSize) => {
            const sketch = artworkSketch(gridSize);

            expect(await parseSketch(await serializeSketch(sketch))).toEqual(sketch);
        }
    );

    it("restores a blank canvas", async () => {
        const sketch = { gridSize: 16, colors: createBlankGrid(16) };

        expect(await parseSketch(await serializeSketch(sketch))).toEqual(sketch);
    });

    it("restores a sketch where every cell is a different color", async () => {
        const sketch = rainbowSketch(32);

        expect(await parseSketch(await serializeSketch(sketch))).toEqual(sketch);
    });

    it("preserves colors a lossy encoder would round", async () => {
        // Chosen adversarially rather than arbitrarily: off-by-one channels, both
        // greys straddling the 0x7F/0x80 midpoint, and near-black against black
        // and near-white against white. A format that quantized colors would
        // still pass every other round-trip case in this file.
        const sketch = {
            gridSize: 4,
            colors: [
                "#010101", "#FEFEFE", "#7F7F7F", "#FF0001",
                "#00FF01", "#0100FF", "#123456", "#ABCDEF",
                "#000000", "#FFFFFF", "#808080", "#7E7F80",
                "#010203", "#FDFEFF", "#0F1011", "#EFF0F1",
            ],
        };

        expect(await parseSketch(await serializeSketch(sketch))).toEqual(sketch);
    });
});

describe("header", () => {
    it("starts with the magic bytes and grid size", async () => {
        const file = await serializeSketch(artworkSketch(12));

        expect([...file.subarray(0, 4)]).toEqual(MAGIC);
        expect(file[4]).toBe(12);
    });

    it("reads a hand-built file, pinning the byte layout", async () => {
        const payload = Uint8Array.of(
            0x00, 0x00, 0x00, 0xff, 0xff, 0xff,
            0x3e, 0xa6, 0xff, 0x12, 0x34, 0x56
        );
        const file = await fileWith(payload, { gridSize: 2, mode: RGB_MODE });

        expect(await parseSketch(file)).toEqual({
            gridSize: 2,
            colors: ["#000000", "#FFFFFF", "#3EA6FF", "#123456"],
        });
    });
});

describe("payload mode", () => {
    it("uses palette mode for art with few colors, and round-trips it", async () => {
        const sketch = artworkSketch(64, 6);
        const file = await serializeSketch(sketch);

        expect(file[5]).toBe(PALETTE_MODE);
        expect(await parseSketch(file)).toEqual(sketch);
    });

    it("falls back to RGB mode when a palette cannot address the colors, and round-trips it", async () => {
        const sketch = rainbowSketch(64);
        const file = await serializeSketch(sketch);

        expect(file[5]).toBe(RGB_MODE);
        expect(await parseSketch(file)).toEqual(sketch);
    });

    it("picks RGB mode when it measures smaller, though a palette would fit", async () => {
        // The branch the two-step choice exists for. This sketch has around
        // seventeen distinct colors — far inside the 255 a one-byte palette
        // length can address, so palette mode is eligible — and deflate still
        // makes the RGB layout the smaller of the two. A rule that picked by
        // counting colors would get this one wrong, which is why both payloads
        // are compressed and compared.
        const sketch = artworkSketch(64, 16);
        const file = await serializeSketch(sketch);

        expect(new Set(sketch.colors).size).toBeLessThan(MAX_PALETTE_LENGTH);
        expect(file[5]).toBe(RGB_MODE);
        expect(await parseSketch(file)).toEqual(sketch);
    });

    it("picks whichever mode is actually smaller", async () => {
        const noisy = await serializeSketch(rainbowSketch(64));
        const flat = await serializeSketch(artworkSketch(64, 4));

        expect(flat.length).toBeLessThan(noisy.length);
    });
});

describe("size", () => {
    it("stores ordinary pixel art in well under a kilobyte", async () => {
        const file = await serializeSketch(artworkSketch(64, 8));

        expect(file.length).toBeLessThan(1024);
    });

    it("stores a blank 64x64 canvas in a few dozen bytes", async () => {
        const file = await serializeSketch({
            gridSize: 64,
            colors: createBlankGrid(64),
        });

        expect(file.length).toBeLessThan(64);
    });

    it("stays smaller than three bytes per cell even in the worst case", async () => {
        const sketch = rainbowSketch(64);
        const file = await serializeSketch(sketch);

        expect(file.length).toBeLessThan(sketch.colors.length * 3 + 512);
    });
});

describe("rejects malformed input", () => {
    it("rejects an empty file", async () => {
        expect(await parseSketch(new Uint8Array(0))).toBeNull();
    });

    it("rejects a file shorter than the header", async () => {
        expect(await parseSketch(Uint8Array.of(0x53, 0x4b, 0x50))).toBeNull();
    });

    it("rejects the wrong magic bytes", async () => {
        const file = await serializeSketch(artworkSketch(4));
        file[0] = 0x00;

        expect(await parseSketch(file)).toBeNull();
    });

    it("rejects an unknown payload mode", async () => {
        const file = await serializeSketch(artworkSketch(4));
        file[5] = 9;

        expect(await parseSketch(file)).toBeNull();
    });

    it.each([0, MAX_GRID_SIZE + 1, 255])(
        "rejects an out-of-range grid size of %i",
        async (gridSize) => {
            const file = await serializeSketch(artworkSketch(4));
            file[4] = gridSize;

            expect(await parseSketch(file)).toBeNull();
        }
    );

    it("rejects a truncated body", async () => {
        const file = await serializeSketch(artworkSketch(16));

        expect(await parseSketch(file.subarray(0, file.length - 4) as Bytes)).toBeNull();
    });

    it("rejects a corrupted body", async () => {
        const file = await serializeSketch(artworkSketch(16));
        file[file.length - 3] ^= 0xff;

        expect(await parseSketch(file)).toBeNull();
    });

    it("rejects a body that is not deflate data at all", async () => {
        const file = new Uint8Array(HEADER_SIZE + 6);
        file.set(MAGIC, 0);
        file[4] = 4;
        file[5] = RGB_MODE;
        file.set([1, 2, 3, 4, 5, 6], HEADER_SIZE);

        expect(await parseSketch(file)).toBeNull();
    });

    it("rejects an RGB payload whose length does not match the grid", async () => {
        expect(
            await parseSketch(await fileWith(new Uint8Array(27), { gridSize: 4 }))
        ).toBeNull();
    });

    it("rejects a palette payload of the wrong length", async () => {
        const payload = Uint8Array.of(2, 0, 0, 0, 255, 255, 255, 0b10101010);

        expect(
            await parseSketch(
                await fileWith(payload, { gridSize: 4, mode: PALETTE_MODE })
            )
        ).toBeNull();
    });

    it("rejects a palette payload with no bytes at all", async () => {
        expect(
            await parseSketch(
                await fileWith(new Uint8Array(0), {
                    gridSize: 4,
                    mode: PALETTE_MODE,
                })
            )
        ).toBeNull();
    });

    it("rejects an empty palette", async () => {
        expect(
            await parseSketch(
                await fileWith(Uint8Array.of(0), { gridSize: 4, mode: PALETTE_MODE })
            )
        ).toBeNull();
    });

    it("rejects an index pointing past the end of the palette", async () => {
        const paletteLength = 3;
        const payload = new Uint8Array(1 + paletteLength * 3 + 1);
        payload[0] = paletteLength;
        payload[payload.length - 1] = 0b11000000;

        expect(
            await parseSketch(
                await fileWith(payload, { gridSize: 2, mode: PALETTE_MODE })
            )
        ).toBeNull();
    });

    it("rejects a one-color palette payload that carries no index bits", async () => {
        // A one-color palette still spends a bit per cell. At zero bits the
        // packed section would be empty whatever the cell count, so the length
        // check would stop depending on the declared grid size and this 4-byte
        // payload would fabricate a full 64x64 sketch.
        const payload = Uint8Array.of(1, 0x3e, 0xa6, 0xff);

        expect(
            await parseSketch(
                await fileWith(payload, {
                    gridSize: MAX_GRID_SIZE,
                    mode: PALETTE_MODE,
                })
            )
        ).toBeNull();
    });

    it("does not allocate on a declared grid size a tiny body cannot fill", async () => {
        const file = await fileWith(new Uint8Array(3), {
            gridSize: MAX_GRID_SIZE,
            mode: RGB_MODE,
        });

        expect(await parseSketch(file)).toBeNull();
    });
});
