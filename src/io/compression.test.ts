import { describe, expect, it, vi } from "vitest";

import { type Bytes, deflate, inflate } from "./compression";

const bytesOf = (...values: number[]): Bytes => Uint8Array.from(values);

const repeated = (byte: number, length: number): Bytes =>
    new Uint8Array(length).fill(byte);

/**
 * Deterministic bytes deflate cannot shrink: an xorshift32, whose low byte
 * has no repeat for the compressor to point at.
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

// A zlib stream is a two-byte header, the deflate data, then an adler32.
const ZLIB_HEADER_SIZE = 2;
const ADLER32_SIZE = 4;

describe("deflate and inflate", () => {
    it("round-trips a payload", async () => {
        const payload = bytesOf(1, 2, 3, 4, 5);

        expect(await inflate(await deflate(payload), Infinity)).toEqual(
            payload
        );
    });

    it("round-trips an empty payload", async () => {
        expect(
            await inflate(await deflate(new Uint8Array(0)), Infinity)
        ).toHaveLength(0);
    });

    it("reassembles output that arrives in many chunks", async () => {
        // 256 KB of a period-256 cycle deflates to about 1.3 KB and inflates
        // back in sixteen chunks, a size the runtime chooses.
        const payload = new Uint8Array(256 * 1024);
        for (let at = 0; at < payload.length; at++) {
            payload[at] = (at * 2654435761) & 0xff;
        }

        expect(await inflate(await deflate(payload), Infinity)).toEqual(
            payload
        );
    });

    it("round-trips data the compressor cannot shrink", async () => {
        // The only input whose deflate output spans several chunks.
        const payload = incompressible(64 * 1024);
        const compressed = await deflate(payload);

        expect(compressed.length).toBeGreaterThan(payload.length);
        expect(await inflate(compressed, Infinity)).toEqual(payload);
    });

    it("shrinks repetitive data", async () => {
        const payload = repeated(0x42, 4096);

        expect((await deflate(payload)).length).toBeLessThan(
            payload.length / 10
        );
    });
});

describe("inflate", () => {
    it("rejects data that is not deflate output at all", async () => {
        await expect(
            inflate(bytesOf(1, 2, 3, 4, 5, 6), Infinity)
        ).rejects.toThrow();
    });

    it("rejects truncated deflate output", async () => {
        const compressed = await deflate(repeated(0x42, 4096));

        await expect(
            inflate(compressed.subarray(0, compressed.length - 4), Infinity)
        ).rejects.toThrow();
    });

    it("rejects corruption inside the compressed body", async () => {
        const compressed = await deflate(repeated(0x42, 4096));
        const inBody = Math.floor(
            (ZLIB_HEADER_SIZE + compressed.length - ADLER32_SIZE) / 2
        );
        compressed[inBody] ^= 0xff;

        await expect(inflate(compressed, Infinity)).rejects.toThrow();
    });

    it("rejects a corrupted checksum, which is what catches a damaged file", async () => {
        const compressed = await deflate(repeated(0x42, 4096));
        compressed[compressed.length - 3] ^= 0xff;

        await expect(inflate(compressed, Infinity)).rejects.toThrow();
    });

    it("accepts output of exactly the limit", async () => {
        const payload = repeated(0x42, 4096);

        expect(await inflate(await deflate(payload), 4096)).toEqual(payload);
    });

    describe("past the limit", () => {
        // Outcomes are reduced to a word, so a regression fails with a message
        // instead of printing megabytes of inflated bytes.
        const outcomeOf = (inflating: Promise<Bytes>) =>
            inflating.then(
                () => "inflated in full",
                (error: unknown) =>
                    error instanceof RangeError ? "stopped" : "failed"
            );

        it("stops at output one byte over the limit", async () => {
            const compressed = await deflate(repeated(0x42, 4097));

            expect(await outcomeOf(inflate(compressed, 4096))).toBe("stopped");
        });

        it("stops reading instead of inflating everything first", async () => {
            // 4 MB of zeros deflates to about 4 kB, the shape of a file built
            // to exhaust memory. Unbounded, it inflates in hundreds of chunks.
            const bomb = await deflate(new Uint8Array(4 * 1024 * 1024));
            const read = vi.spyOn(
                ReadableStreamDefaultReader.prototype,
                "read"
            );

            expect(await outcomeOf(inflate(bomb, 4096))).toBe("stopped");
            expect(read.mock.calls.length).toBeLessThan(4);
        });
    });
});
