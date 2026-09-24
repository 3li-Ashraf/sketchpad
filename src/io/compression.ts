/**
 * @file Deflate and inflate over the browser's Compression Streams: bytes in,
 * bytes out, with no knowledge of the save format that uses them.
 */

/**
 * A byte buffer on a plain `ArrayBuffer`, which is what `BufferSource` APIs
 * such as `Blob` and `CompressionStream` accept.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

// zlib-wrapped rather than `deflate-raw`: six bytes buy an adler32, so a
// damaged file is caught at decompression without a checksum of our own.
const FORMAT = "deflate";

// Built by hand because `Blob.stream()` is missing under jsdom.
const streamOf = (bytes: Bytes): ReadableStream<BufferSource> =>
    new ReadableStream({
        start(controller) {
            controller.enqueue(bytes);
            controller.close();
        },
    });

const collect = async (
    stream: ReadableStream<Uint8Array>,
    maxLength: number
): Promise<Bytes> => {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        length += value.length;
        if (length > maxLength) {
            await reader.cancel();
            throw new RangeError(`Output exceeds ${maxLength} bytes`);
        }

        chunks.push(value);
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
    collect(
        streamOf(bytes).pipeThrough(new CompressionStream(FORMAT)),
        Infinity
    );

/**
 * Rejects on input that is corrupt or not deflate data, and stops reading and
 * rejects once the output passes `maxLength`. The limit is required because a
 * few kilobytes of deflate can expand to hundreds of megabytes, so a caller
 * reading untrusted bytes has to say how much it is prepared to hold.
 */
export const inflate = (bytes: Bytes, maxLength: number): Promise<Bytes> =>
    collect(
        streamOf(bytes).pipeThrough(new DecompressionStream(FORMAT)),
        maxLength
    );
