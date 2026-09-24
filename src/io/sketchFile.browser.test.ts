/**
 * @file The save format on the browser's own Compression Streams. The unit
 * suite runs on Node's, so this is what shows a file is portable: saved by
 * one implementation, opened by another.
 */

import { describe, expect, it } from "vitest";

import { MAX_GRID_SIZE } from "../domain/grid";
import { GOLDEN_FILES } from "../test/goldenFiles";
import { artworkSketch, rainbowSketch } from "../test/sketchFixtures";
import { deflate } from "./compression";
import { decodeSketch, encodeSketch, readSketchFile } from "./sketchFile";

describe("in a real browser", () => {
    it.each(GOLDEN_FILES)("opens $name, written by Node", async (golden) => {
        expect(await decodeSketch(golden.bytes)).toEqual({
            ok: true,
            sketch: golden.sketch,
        });
    });

    it.each([
        ["pixel art", artworkSketch(MAX_GRID_SIZE)],
        ["a canvas of distinct colors", rainbowSketch(MAX_GRID_SIZE)],
    ])("round-trips %s", async (_, sketch) => {
        expect(await decodeSketch(await encodeSketch(sketch))).toEqual({
            ok: true,
            sketch,
        });
    });

    it("rejects a body that fails the checksum", async () => {
        const file = await encodeSketch(artworkSketch(16));
        file[file.length - 3] ^= 0xff;

        expect(await decodeSketch(file)).toEqual({
            ok: false,
            reason: "damaged",
        });
    });

    it("stops a body built to inflate far past its grid", async () => {
        const body = await deflate(new Uint8Array(4 * 1024 * 1024));
        const file = Uint8Array.of(0x53, 0x4b, 0x50, 0x44, 2, 1, ...body);

        expect(await decodeSketch(file)).toEqual({
            ok: false,
            reason: "damaged",
        });
    });

    it("reads a picked file", async () => {
        const sketch = artworkSketch(8);
        const file = new File([await encodeSketch(sketch)], "art.skpd");

        expect(await readSketchFile(file)).toEqual({ ok: true, sketch });
    });
});
