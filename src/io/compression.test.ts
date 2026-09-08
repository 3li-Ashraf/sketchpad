/**
 * @file Covers `io/compression`: that a round trip is lossless at several sizes,
 * that the multi-chunk reassembly in `collect` is exercised, and that damaged
 * input is rejected rather than quietly returning garbage.
 */

import { describe, expect, it } from "vitest";
import { deflate, inflate, type Bytes } from "./compression";

const bytesOf = (...values: number[]): Bytes => Uint8Array.from(values);

const repeated = (byte: number, length: number): Bytes =>
    new Uint8Array(length).fill(byte);

/**
 * Deterministic bytes that deflate cannot shrink. A plain counter or a short
 * cycle will not do — those compress away — so this is an xorshift32, whose low
 * byte passes through all 256 values with no repeat deflate can point at.
 */
const incompressible = (length: number): Bytes => {
    const bytes = new Uint8Array(length);
    let state = 0x9e3779b9;

    for (let at = 0; at < length; at++) {
        state ^= state << 13;
        state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        bytes[at] = state & 0xff;
    }

    return bytes;
};

// A zlib stream is a two-byte header, the deflate data, then a four-byte
// adler32 of the original bytes.
const ZLIB_HEADER_SIZE = 2;
const ADLER32_SIZE = 4;

describe("deflate and inflate", () => {
    it("round-trips a payload", async () => {
        const payload = bytesOf(1, 2, 3, 4, 5);

        expect([...(await inflate(await deflate(payload)))]).toEqual([...payload]);
    });

    it("round-trips an empty payload", async () => {
        expect(await inflate(await deflate(new Uint8Array(0)))).toHaveLength(0);
    });

    it("round-trips a payload larger than one stream chunk", async () => {
        // The fill is a period-256 cycle through all 256 byte values, so it is
        // varied enough not to be a single run yet still compresses hard: 256 KB
        // deflates to about 1.3 KB. The reassembly this covers is on the inflate
        // side, where the 256 KB result arrives as sixteen 16 KB chunks — a chunk
        // size the runtime chooses, not one either side declares.
        const payload = new Uint8Array(256 * 1024);
        for (let at = 0; at < payload.length; at++) {
            payload[at] = (at * 2654435761) & 0xff;
        }

        const restored = await inflate(await deflate(payload));

        expect(restored).toHaveLength(payload.length);
        expect(restored).toEqual(payload);
    });

    it("round-trips data the compressor cannot shrink", async () => {
        // The neighbouring case covers reassembly on the inflate side only: its
        // payload collapses to about 1.3 KB, which deflate hands over in a
        // single chunk after the header. Reaching the same loop on the deflate
        // side needs output too large for one chunk, which only incompressible
        // input produces — this arrives as six.
        const payload = incompressible(64 * 1024);
        const compressed = await deflate(payload);

        expect(compressed.length).toBeGreaterThan(payload.length);
        expect(await inflate(compressed)).toEqual(payload);
    });

    it("shrinks repetitive data", async () => {
        const payload = repeated(0x42, 4096);

        expect((await deflate(payload)).length).toBeLessThan(payload.length / 10);
    });
});

describe("inflate", () => {
    it("rejects data that is not deflate output at all", async () => {
        await expect(inflate(bytesOf(1, 2, 3, 4, 5, 6))).rejects.toThrow();
    });

    it("rejects truncated deflate output", async () => {
        const compressed = await deflate(repeated(0x42, 4096));

        await expect(
            inflate(compressed.subarray(0, compressed.length - 4) as Bytes)
        ).rejects.toThrow();
    });

    it("rejects corruption inside the compressed body", async () => {
        // Aimed between the header and the trailer, so this damages the deflate
        // data itself rather than the adler32 the next case flips. Both are
        // rejected, but by different machinery.
        const compressed = await deflate(repeated(0x42, 4096));
        const inBody = Math.floor(
            (ZLIB_HEADER_SIZE + compressed.length - ADLER32_SIZE) / 2
        );
        compressed[inBody] ^= 0xff;

        await expect(inflate(compressed)).rejects.toThrow();
    });

    it("rejects a corrupted checksum, which is what catches a damaged file", async () => {
        // `length - 3` lands inside the adler32 trailer rather than in the
        // deflate data. This is the half that costs the format nothing: a
        // damaged file is caught without any checksum of this project's own.
        const compressed = await deflate(repeated(0x42, 4096));
        compressed[compressed.length - 3] ^= 0xff;

        await expect(inflate(compressed)).rejects.toThrow();
    });
});
