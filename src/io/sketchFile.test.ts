import { describe, expect, it, vi } from "vitest";

import {
    createBlankGrid,
    isValidSketch,
    MAX_GRID_SIZE,
    type Sketch,
} from "../domain/grid";
import { GOLDEN_FILES } from "../test/goldenFiles";
import { expectInvalidInput, expectLogged } from "../test/logCapture";
import { artworkSketch, rainbowSketch } from "../test/sketchFixtures";
import { type Bytes, deflate } from "./compression";
import {
    decodeSketch,
    encodeSketch,
    MAX_SKETCH_FILE_SIZE,
    readSketchFile,
    type SketchReadFailure,
    type SketchResult,
} from "./sketchFile";

// Re-declared rather than imported: they are private to the module, and a
// change to the layout should break these tests instead of moving with them.
const MAGIC = [0x53, 0x4b, 0x50, 0x44];
const HEADER_SIZE = 6;
const PALETTE_MODE = 0;
const RGB_MODE = 1;
const MAX_PALETTE_LENGTH = 255;

const decoded = (sketch: Sketch): SketchResult<never> => ({
    ok: true,
    sketch,
});

const rejected = <Reason extends SketchReadFailure>(
    reason: Reason
): SketchResult<Reason> => ({ ok: false, reason });

const roundTrip = async (sketch: Sketch) =>
    decodeSketch(await encodeSketch(sketch));

/**
 * A valid header over an arbitrary deflated payload, so the payload checks can
 * be reached without first damaging a real file.
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

            expect(await roundTrip(sketch)).toEqual(decoded(sketch));
        }
    );

    it("restores a blank canvas", async () => {
        const sketch = { gridSize: 16, colors: createBlankGrid(16) };

        expect(await roundTrip(sketch)).toEqual(decoded(sketch));
    });

    it("restores a sketch where every cell is a different color", async () => {
        const sketch = rainbowSketch(32);

        expect(await roundTrip(sketch)).toEqual(decoded(sketch));
    });

    it("preserves colors a lossy encoder would round", async () => {
        // Off-by-one channels, greys either side of 0x7F/0x80, and near-black
        // and near-white: a format that quantized would pass every other case.
        const sketch = {
            gridSize: 4,
            colors: [
                "#010101",
                "#FEFEFE",
                "#7F7F7F",
                "#FF0001",
                "#00FF01",
                "#0100FF",
                "#123456",
                "#ABCDEF",
                "#000000",
                "#FFFFFF",
                "#808080",
                "#7E7F80",
                "#010203",
                "#FDFEFF",
                "#0F1011",
                "#EFF0F1",
            ],
        };

        expect(await roundTrip(sketch)).toEqual(decoded(sketch));
    });
});

describe("files already on disk", () => {
    it.each(GOLDEN_FILES)("still open $name", async ({ bytes, sketch }) => {
        const result = await decodeSketch(bytes);

        expect(result).toEqual(decoded(sketch));
        expect(result.ok && isValidSketch(result.sketch)).toBe(true);
    });

    it("cover both payload modes", () => {
        expect(GOLDEN_FILES.map(({ bytes }) => bytes[5]).sort()).toEqual([
            PALETTE_MODE,
            RGB_MODE,
        ]);
    });
});

describe("refusing to write a sketch that does not hold together", () => {
    it.each([
        ["too few colors", { gridSize: 4, colors: createBlankGrid(2) }],
        ["an unsupported size", { gridSize: 65, colors: createBlankGrid(65) }],
        ["a color that is not one", { gridSize: 1, colors: ["not a color"] }],
    ])("rejects a sketch with %s, and reports it", async (_, sketch) => {
        await expect(encodeSketch(sketch)).rejects.toThrow(TypeError);
        expectInvalidInput("encodeSketch");
    });
});

describe("byte layout", () => {
    it("starts with the magic bytes and grid size", async () => {
        const file = await encodeSketch(artworkSketch(12));

        expect([...file.subarray(0, 4)]).toEqual(MAGIC);
        expect(file[4]).toBe(12);
    });

    it("reads a hand-built RGB file", async () => {
        // prettier-ignore
        const payload = Uint8Array.of(
            0x00, 0x00, 0x00,
            0xff, 0xff, 0xff,
            0x3e, 0xa6, 0xff,
            0x12, 0x34, 0x56
        );
        const file = await fileWith(payload, { gridSize: 2, mode: RGB_MODE });

        expect(await decodeSketch(file)).toEqual(
            decoded({
                gridSize: 2,
                colors: ["#000000", "#FFFFFF", "#3EA6FF", "#123456"],
            })
        );
    });

    it("reads a hand-built palette file, most significant bit first", async () => {
        // Two colors pack at one bit per cell: 0b0110 reads as cells 0..3.
        // prettier-ignore
        const payload = Uint8Array.of(
            2,
            0x00, 0x00, 0x00,
            0x3e, 0xa6, 0xff,
            0b0110_0000
        );
        const file = await fileWith(payload, {
            gridSize: 2,
            mode: PALETTE_MODE,
        });

        expect(await decodeSketch(file)).toEqual(
            decoded({
                gridSize: 2,
                colors: ["#000000", "#3EA6FF", "#3EA6FF", "#000000"],
            })
        );
    });
});

describe("payload mode", () => {
    it("uses palette mode for art with few colors", async () => {
        const file = await encodeSketch(artworkSketch(64, 6));

        expect(file[5]).toBe(PALETTE_MODE);
    });

    it("falls back to RGB mode past 255 colors", async () => {
        const file = await encodeSketch(rainbowSketch(64));

        expect(file[5]).toBe(RGB_MODE);
    });

    it("picks RGB mode when it measures smaller, though a palette would fit", async () => {
        // Seventeen colors: palette mode is eligible, and deflate still makes
        // the RGB layout smaller. A rule that counted colors would get it wrong.
        const sketch = artworkSketch(64, 16);
        const file = await encodeSketch(sketch);

        expect(new Set(sketch.colors).size).toBeLessThan(MAX_PALETTE_LENGTH);
        expect(file[5]).toBe(RGB_MODE);
        expect(await decodeSketch(file)).toEqual(decoded(sketch));
    });
});

describe("size", () => {
    it("stores ordinary pixel art in well under a kilobyte", async () => {
        const file = await encodeSketch(artworkSketch(64, 8));

        expect(file.length).toBeLessThan(1024);
    });

    it("stores a blank 64×64 canvas in a few dozen bytes", async () => {
        const file = await encodeSketch({
            gridSize: 64,
            colors: createBlankGrid(64),
        });

        expect(file.length).toBeLessThan(64);
    });

    it("stays far inside the size cap even in the worst case", async () => {
        const file = await encodeSketch(rainbowSketch(64));

        expect(file.length).toBeLessThan(MAX_SKETCH_FILE_SIZE / 4);
    });
});

describe("refusing a file that is not a sketch", () => {
    it.each([
        ["an empty file", []],
        ["a file shorter than the magic", [0x53, 0x4b, 0x50]],
        ["a PNG", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ])("refuses %s", async (_, bytes) => {
        expect(await decodeSketch(Uint8Array.from(bytes))).toEqual(
            rejected("not-a-sketch")
        );
    });

    it("refuses a sketch whose magic bytes are wrong", async () => {
        const file = await encodeSketch(artworkSketch(4));
        file[0] = 0x00;

        expect(await decodeSketch(file)).toEqual(rejected("not-a-sketch"));
    });
});

describe("refusing a sketch from a format this version does not know", () => {
    it("refuses an unknown payload mode", async () => {
        const file = await encodeSketch(artworkSketch(4));
        file[5] = 9;

        expect(await decodeSketch(file)).toEqual(rejected("unsupported"));
    });

    it.each([0, MAX_GRID_SIZE + 1, 255])(
        "refuses an out-of-range grid size of %i",
        async (gridSize) => {
            const file = await encodeSketch(artworkSketch(4));
            file[4] = gridSize;

            expect(await decodeSketch(file)).toEqual(rejected("unsupported"));
        }
    );
});

describe("refusing a damaged sketch", () => {
    it("refuses a file cut off inside the header", async () => {
        expect(await decodeSketch(Uint8Array.of(...MAGIC, 4))).toEqual(
            rejected("damaged")
        );
    });

    it("refuses a truncated body", async () => {
        const file = await encodeSketch(artworkSketch(16));

        expect(await decodeSketch(file.subarray(0, file.length - 4))).toEqual(
            rejected("damaged")
        );
    });

    it("refuses a body that fails the checksum", async () => {
        const file = await encodeSketch(artworkSketch(16));
        file[file.length - 3] ^= 0xff;

        expect(await decodeSketch(file)).toEqual(rejected("damaged"));
    });

    it("refuses a body that is not deflate data at all", async () => {
        const file = Uint8Array.of(...MAGIC, 4, RGB_MODE, 1, 2, 3, 4, 5, 6);

        expect(await decodeSketch(file)).toEqual(rejected("damaged"));
    });

    it.each([
        ["an RGB payload shorter than the grid", new Uint8Array(47), RGB_MODE],
        ["an RGB payload longer than the grid", new Uint8Array(49), RGB_MODE],
        ["an empty palette payload", new Uint8Array(0), PALETTE_MODE],
        ["a palette of no colors", Uint8Array.of(0), PALETTE_MODE],
        [
            "a palette payload of the wrong length",
            Uint8Array.of(2, 0, 0, 0, 255, 255, 255, 0b10101010),
            PALETTE_MODE,
        ],
    ])("refuses %s", async (_, payload, mode) => {
        expect(
            await decodeSketch(await fileWith(payload, { gridSize: 4, mode }))
        ).toEqual(rejected("damaged"));
    });

    it("refuses an index pointing past the end of the palette", async () => {
        // Three colors take two bits per cell, which can also encode 3.
        const payload = new Uint8Array(1 + 3 * 3 + 1);
        payload[0] = 3;
        payload[payload.length - 1] = 0b1100_0000;

        expect(
            await decodeSketch(
                await fileWith(payload, { gridSize: 2, mode: PALETTE_MODE })
            )
        ).toEqual(rejected("damaged"));
    });

    it("refuses a one-color palette that carries no index bits", async () => {
        // Were a single color packed at zero bits, these four bytes would
        // satisfy the length check and fabricate a full 64×64 sketch.
        const payload = Uint8Array.of(1, 0x3e, 0xa6, 0xff);

        expect(
            await decodeSketch(
                await fileWith(payload, {
                    gridSize: MAX_GRID_SIZE,
                    mode: PALETTE_MODE,
                })
            )
        ).toEqual(rejected("damaged"));
    });

    it("stops inflating at the largest payload the declared grid holds", async () => {
        // A 2×2 RGB payload is 12 bytes; this body inflates to 4 MB.
        const bomb = await fileWith(new Uint8Array(4 * 1024 * 1024), {
            gridSize: 2,
        });
        const read = vi.spyOn(ReadableStreamDefaultReader.prototype, "read");

        expect(await decodeSketch(bomb)).toEqual(rejected("damaged"));
        expect(read.mock.calls.length).toBeLessThan(4);
    });
});

describe("readSketchFile", () => {
    it("reads and decodes a picked file", async () => {
        const sketch = artworkSketch(8);
        const file = new File([await encodeSketch(sketch)], "art.skpd");

        expect(await readSketchFile(file)).toEqual(decoded(sketch));
    });

    it("reads no more than one byte past the size cap", async () => {
        const file = new File(
            [new Uint8Array(4 * MAX_SKETCH_FILE_SIZE)],
            "big"
        );
        const slice = vi.spyOn(file, "slice");

        expect(await readSketchFile(file)).toEqual(rejected("not-a-sketch"));
        expect(slice).toHaveBeenCalledWith(0, MAX_SKETCH_FILE_SIZE + 1);
    });

    it("reports a file the browser can no longer read", async () => {
        vi.spyOn(Blob.prototype, "arrayBuffer").mockRejectedValue(
            new DOMException(
                "A requested file could not be found",
                "NotFoundError"
            )
        );

        expect(await readSketchFile(new File(["x"], "gone.skpd"))).toEqual(
            rejected("unreadable")
        );
        expectLogged("warn", "files", "file could not be read", {
            error: expect.objectContaining({ name: "NotFoundError" }),
        });
    });
});
