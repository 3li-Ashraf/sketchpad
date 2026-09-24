/**
 * @file The `.skpd` save file, and the only definition of its format:
 *
 *   byte  size  field
 *   0     4     magic "SKPD"
 *   4     1     grid size, 1..64
 *   5     1     payload mode
 *   6     ..    zlib-deflated payload
 *
 * Palette mode payload: palette length (1 byte, 1..255), that many RGB triples,
 * then one palette index per cell, bit-packed most significant bit first at
 * `max(1, ceil(log2(length)))` bits each. RGB mode payload: one RGB triple per
 * cell. Cells are row-major in both, and both are lossless.
 *
 * Palette mode is eligible only with at most 255 distinct colors; when it is,
 * both payloads are deflated and the smaller one is written. Color count does
 * not predict the winner once deflate has run, so the choice is measured.
 */

import { hexToRgb, rgbToHex } from "../domain/color";
import {
    isSupportedGridSize,
    isValidSketch,
    type Sketch,
} from "../domain/grid";
import { reportInvalidInput } from "../domain/invalidInput";
import { createLogger } from "../log/logger";
import { type Bytes, deflate, inflate } from "./compression";

const log = createLogger("files");

export const SKETCH_FILE_EXTENSION = ".skpd";
export const SKETCH_FILE_MIME_TYPE = "application/octet-stream";

/**
 * Well above the largest valid file — a 64×64 RGB payload deflate cannot
 * shrink is about 12 kB — and small enough that reading one byte past it
 * costs nothing, whatever size of file was picked.
 */
export const MAX_SKETCH_FILE_SIZE = 64 * 1024;

const MAGIC = Uint8Array.of(0x53, 0x4b, 0x50, 0x44);
const HEADER_SIZE = 6;
const GRID_SIZE_OFFSET = 4;
const MODE_OFFSET = 5;

const PALETTE_MODE = 0;
const RGB_MODE = 1;

const MAX_PALETTE_LENGTH = 255;
const BYTES_PER_COLOR = 3;

// The one-bit floor is a security check, not rounding. At zero bits the packed
// section would be empty for any cell count, so the decoder's exact-length
// check would stop depending on the declared grid size, and a four-byte
// payload could claim to be a full 64×64 sketch.
const indexBitWidth = (paletteLength: number): number =>
    Math.max(1, Math.ceil(Math.log2(paletteLength)));

const packedIndexBytes = (cellCount: number, bitWidth: number): number =>
    Math.ceil((cellCount * bitWidth) / 8);

/** The most a payload of this mode can hold for this many cells. */
const maxPayloadLength = (mode: number, cellCount: number): number =>
    mode === RGB_MODE
        ? cellCount * BYTES_PER_COLOR
        : 1 +
          MAX_PALETTE_LENGTH * BYTES_PER_COLOR +
          packedIndexBytes(cellCount, indexBitWidth(MAX_PALETTE_LENGTH));

const encodeRgbPayload = (colors: readonly string[]): Bytes => {
    const payload = new Uint8Array(colors.length * BYTES_PER_COLOR);

    for (let cell = 0; cell < colors.length; cell++) {
        payload.set(hexToRgb(colors[cell]), cell * BYTES_PER_COLOR);
    }

    return payload;
};

/** Null when the sketch has more colors than a one-byte length can count. */
const encodePalettePayload = (colors: readonly string[]): Bytes | null => {
    const palette = [...new Set(colors)];
    if (palette.length > MAX_PALETTE_LENGTH) return null;

    const indexOfColor = new Map(palette.map((color, index) => [color, index]));
    const bitWidth = indexBitWidth(palette.length);
    const paletteEnd = 1 + palette.length * BYTES_PER_COLOR;

    const payload = new Uint8Array(
        paletteEnd + packedIndexBytes(colors.length, bitWidth)
    );

    payload[0] = palette.length;
    palette.forEach((color, index) =>
        payload.set(hexToRgb(color), 1 + index * BYTES_PER_COLOR)
    );

    let bit = 0;
    for (const color of colors) {
        const index = indexOfColor.get(color)!;

        for (let shift = bitWidth - 1; shift >= 0; shift--) {
            if ((index >> shift) & 1) {
                payload[paletteEnd + (bit >> 3)] |= 0x80 >> (bit & 7);
            }
            bit++;
        }
    }

    return payload;
};

/** Rejects a sketch that does not hold together, rather than write it. */
export const encodeSketch = async (sketch: Sketch): Promise<Bytes> => {
    if (!isValidSketch(sketch)) {
        reportInvalidInput("encodeSketch", "not a valid sketch", sketch);
        throw new TypeError("Not a valid sketch");
    }

    const { gridSize, colors } = sketch;
    const palettePayload = encodePalettePayload(colors);

    const [rgbBody, paletteBody] = await Promise.all([
        deflate(encodeRgbPayload(colors)),
        palettePayload ? deflate(palettePayload) : null,
    ]);

    const usePalette =
        paletteBody !== null && paletteBody.length < rgbBody.length;
    const body = usePalette ? paletteBody : rgbBody;

    const file = new Uint8Array(HEADER_SIZE + body.length);
    file.set(MAGIC, 0);
    file[GRID_SIZE_OFFSET] = gridSize;
    file[MODE_OFFSET] = usePalette ? PALETTE_MODE : RGB_MODE;
    file.set(body, HEADER_SIZE);

    return file;
};

const decodeRgbPayload = (
    payload: Bytes,
    cellCount: number
): string[] | null => {
    if (payload.length !== cellCount * BYTES_PER_COLOR) return null;

    const colors = new Array<string>(cellCount);

    for (let cell = 0; cell < cellCount; cell++) {
        const at = cell * BYTES_PER_COLOR;
        colors[cell] = rgbToHex(payload[at], payload[at + 1], payload[at + 2]);
    }

    return colors;
};

const decodePalettePayload = (
    payload: Bytes,
    cellCount: number
): string[] | null => {
    const paletteLength = payload.length > 0 ? payload[0] : 0;
    if (paletteLength < 1) return null;

    const paletteEnd = 1 + paletteLength * BYTES_PER_COLOR;
    const bitWidth = indexBitWidth(paletteLength);

    // Exact, so neither a truncated nor a padded payload is accepted.
    if (payload.length !== paletteEnd + packedIndexBytes(cellCount, bitWidth)) {
        return null;
    }

    const palette = new Array<string>(paletteLength);
    for (let index = 0; index < paletteLength; index++) {
        const at = 1 + index * BYTES_PER_COLOR;
        palette[index] = rgbToHex(
            payload[at],
            payload[at + 1],
            payload[at + 2]
        );
    }

    const colors = new Array<string>(cellCount);
    let bit = 0;

    for (let cell = 0; cell < cellCount; cell++) {
        let index = 0;

        for (let read = 0; read < bitWidth; read++) {
            const isSet =
                payload[paletteEnd + (bit >> 3)] & (0x80 >> (bit & 7));
            index = (index << 1) | (isSet ? 1 : 0);
            bit++;
        }

        // A whole number of bits can encode indices past the palette's end.
        if (index >= paletteLength) return null;

        colors[cell] = palette[index];
    }

    return colors;
};

/**
 * Why a file could not be opened as a sketch:
 *
 * - `not-a-sketch` — it does not start with the magic bytes.
 * - `unsupported` — the magic is right, but the header declares a grid size or
 *   payload mode this version does not know: a file from another version.
 * - `damaged` — the header is fine but the rest does not hold together:
 *   truncated, failing the checksum, inflating past what the grid holds, the
 *   wrong payload length, or a palette index past the palette.
 * - `unreadable` — the browser could not read the file at all, typically one
 *   moved or deleted since it was picked. Only `readSketchFile` reports it.
 */
export type SketchDecodeFailure = "not-a-sketch" | "unsupported" | "damaged";
export type SketchReadFailure = SketchDecodeFailure | "unreadable";

export type SketchResult<Failure extends SketchReadFailure> =
    { ok: true; sketch: Sketch } | { ok: false; reason: Failure };

const failure = <Failure extends SketchReadFailure>(
    reason: Failure
): SketchResult<Failure> => ({ ok: false, reason });

/**
 * Decodes a save file, treating it as hostile. The grid size is range-checked
 * before it sizes anything, inflation stops at the largest payload that grid
 * can hold, each payload must match its cell count exactly, and palette indices
 * are bounds-checked. Failures are returned, never thrown.
 */
export const decodeSketch = async (
    file: Bytes
): Promise<SketchResult<SketchDecodeFailure>> => {
    // The magic is compared first, so a file cut off inside a genuine header
    // is damaged while a short file of another kind is simply not a sketch.
    if (
        file.length < MAGIC.length ||
        MAGIC.some((byte, at) => file[at] !== byte)
    ) {
        return failure("not-a-sketch");
    }
    if (file.length < HEADER_SIZE) return failure("damaged");

    const gridSize = file[GRID_SIZE_OFFSET];
    const mode = file[MODE_OFFSET];
    if (
        !isSupportedGridSize(gridSize) ||
        (mode !== PALETTE_MODE && mode !== RGB_MODE)
    ) {
        return failure("unsupported");
    }

    const cellCount = gridSize * gridSize;

    let payload: Bytes;
    try {
        payload = await inflate(
            file.subarray(HEADER_SIZE),
            maxPayloadLength(mode, cellCount)
        );
    } catch {
        return failure("damaged");
    }

    const colors =
        mode === PALETTE_MODE
            ? decodePalettePayload(payload, cellCount)
            : decodeRgbPayload(payload, cellCount);

    return colors
        ? { ok: true, sketch: { gridSize, colors } }
        : failure("damaged");
};

/**
 * Reads a file the user picked and decodes it. Only the first
 * `MAX_SKETCH_FILE_SIZE + 1` bytes are read, so a large file picked by mistake
 * is refused without being loaded into memory.
 */
export const readSketchFile = async (
    file: Blob
): Promise<SketchResult<SketchReadFailure>> => {
    let bytes: Bytes;
    try {
        bytes = new Uint8Array(
            await file.slice(0, MAX_SKETCH_FILE_SIZE + 1).arrayBuffer()
        );
    } catch (error) {
        // The user is told the file is unavailable; this keeps the browser's
        // reason, typically a NotFoundError for a file moved since it was
        // picked.
        log.warn("file could not be read", { error });
        return failure("unreadable");
    }

    return decodeSketch(bytes);
};
