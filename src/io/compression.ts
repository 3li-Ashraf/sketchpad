/**
 * @file Deflate and inflate over the browser's Compression Streams. It knows
 * nothing of the save format that uses it — only bytes in, bytes out.
 */

/**
 * A byte buffer backed by a plain `ArrayBuffer`. Pinning the backing type is
 * what lets a value be handed to `BufferSource` APIs such as `CompressionStream`
 * and the `Blob` constructor, which do not accept a possibly-shared buffer.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

// zlib-wrapped deflate rather than `deflate-raw`. The wrapper costs six bytes
// and carries an adler32, so a damaged file is caught at decompression without
// a checksum of this project's own.
const FORMAT = "deflate";

// Built by hand rather than with `Blob.stream()`, which is missing under jsdom —
// where `ReadableStream` and `CompressionStream` come from Node but `Blob` comes
// from jsdom — so the obvious one-liner would take the whole suite down with it.
//
// The element type is widened to `BufferSource` to match what
// `CompressionStream` accepts. Narrowing it to `Bytes` looks like a tightening
// and would break the `pipeThrough` calls below.
const streamOf = (bytes: Bytes): ReadableStream<BufferSource> =>
    new ReadableStream({
        start(controller) {
            controller.enqueue(bytes);
            controller.close();
        },
    });

// Either direction arrives in several chunks once the data is large enough, so
// the pieces are gathered first and their total length is known before the one
// output buffer is allocated.
const collect = async (stream: ReadableStream<Uint8Array>): Promise<Bytes> => {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        length += value.length;
    }

    const bytes = new Uint8Array(length);
    let at = 0;

    for (const chunk of chunks) {
        bytes.set(chunk, at);
        at += chunk.length;
    }

    return bytes;
};

export const deflate = (bytes: Bytes): Promise<Bytes> =>
    collect(streamOf(bytes).pipeThrough(new CompressionStream(FORMAT)));

/**
 * Rejects on input that is corrupted or not deflate output at all. Callers are
 * expected to treat a rejection as "not a readable file" rather than let it
 * escape — `parseSketch` catches it and returns null, which `useSketchFiles`
 * turns into a message in the page. `deflate` carries no such contract; its own
 * failures are caught separately, where the sketch is saved.
 */
export const inflate = (bytes: Bytes): Promise<Bytes> =>
    collect(streamOf(bytes).pipeThrough(new DecompressionStream(FORMAT)));
