/**
 * @file The `.skpd` save file: a small binary container, and the only definition
 * of that format. It owns the byte layout and the choice between the two payload
 * modes; compressing the payload is `compression`'s job.
 *
 *   byte  size  field
 *   0     4     magic "SKPD"
 *   4     1     grid size, 1..64
 *   5     1     payload mode
 *   6     ..    zlib-deflated payload
 *
 * Palette mode payload: palette length (1 byte, 1..255), that many RGB triples,
 * then one bit-packed palette index per cell, most significant bit first, at
 * `max(1, ceil(log2(length)))` bits each.
 *
 * RGB mode payload: one RGB triple per cell.
 *
 * Cells are row-major in both modes, and the palette is built from the sketch
 * itself, so the two are layouts of the same data rather than a trade in
 * fidelity: a saved file always reloads pixel-identical.
 *
 * The mode is settled in two steps. Palette mode is *eligible* only when the
 * sketch has at most 255 distinct colors, since the palette length is one byte.
 * When it is eligible, both payloads are deflated and the smaller one wins.
 *
 * Comparing the two compressed payloads, rather than counting colors, is
 * deliberate: deflate has already removed the redundancy by the time they are
 * compared, so the color count does not predict the winner. On flat areas both
 * layouts collapse to almost nothing and the margin is a few bytes either way,
 * while palette mode pulls well ahead — roughly 35–55% — on variety without
 * repetition, where RGB mode offers the compressor no repeated sequence to point
 * at. Blobby artwork with more than about sixteen colors goes the other way and
 * RGB wins, which is exactly why the choice is measured rather than guessed.
 */

import { hexToRgb, rgbToHex } from "../domain/color";
import { isSupportedGridSize, type Sketch } from "../domain/grid";
import { deflate, inflate, type Bytes } from "./compression";

export const SKETCH_FILE_EXTENSION = ".skpd";
export const SKETCH_FILE_MIME_TYPE = "application/octet-stream";

const MAGIC = Uint8Array.of(0x53, 0x4b, 0x50, 0x44);
const HEADER_SIZE = 6;

const GRID_SIZE_OFFSET = 4;
const MODE_OFFSET = 5;

const PALETTE_MODE = 0;
const RGB_MODE = 1;

const MAX_PALETTE_LENGTH = 255;
const BYTES_PER_COLOR = 3;

// The floor of one bit is load-bearing security, not defensive rounding.
// `ceil(log2(1))` is zero, and at zero bits the packed section is empty whatever
// the cell count, so the decoder's length check would stop depending on the
// declared grid size: a four-byte payload — a length byte and one RGB triple —
// would satisfy it against a header claiming 64x64 and fabricate 4096 cells. The
// floor keeps the packed length proportional to the cell count, which is the only
// thing tying that check to the header.
const indexBitWidth = (paletteLength: number): number =>
    Math.max(1, Math.ceil(Math.log2(paletteLength)));

const packedIndexBytes = (cellCount: number, bitWidth: number): number =>
    Math.ceil((cellCount * bitWidth) / 8);

const encodeRgbPayload = (colors: readonly string[]): Bytes => {
    const payload = new Uint8Array(colors.length * BYTES_PER_COLOR);

    for (let cell = 0; cell < colors.length; cell++) {
        payload.set(hexToRgb(colors[cell]), cell * BYTES_PER_COLOR);
    }

    return payload;
};

/**
 * Eligibility, not selection: null means the sketch has more distinct colors
 * than a one-byte palette length can address, leaving RGB mode as the only
 * option. A returned payload is still only a candidate — `serializeSketch`
 * decides whether it is the smaller of the two.
 */
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

export const serializeSketch = async ({
    gridSize,
    colors,
}: Sketch): Promise<Bytes> => {
    const palettePayload = encodePalettePayload(colors);

    const [rgbBody, paletteBody] = await Promise.all([
        deflate(encodeRgbPayload(colors)),
        palettePayload ? deflate(palettePayload) : null,
    ]);

    const usePalette = paletteBody !== null && paletteBody.length < rgbBody.length;
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
    if (payload.length < 1) return null;

    const paletteLength = payload[0];
    if (paletteLength < 1) return null;

    const paletteEnd = 1 + paletteLength * BYTES_PER_COLOR;
    const bitWidth = indexBitWidth(paletteLength);

    // Exact, so neither a truncated nor a padded payload is accepted, and so a
    // header claiming a large grid cannot be satisfied by a small body.
    if (payload.length !== paletteEnd + packedIndexBytes(cellCount, bitWidth)) {
        return null;
    }

    const palette = new Array<string>(paletteLength);
    for (let index = 0; index < paletteLength; index++) {
        const at = 1 + index * BYTES_PER_COLOR;
        palette[index] = rgbToHex(payload[at], payload[at + 1], payload[at + 2]);
    }

    const colors = new Array<string>(cellCount);
    let bit = 0;

    for (let cell = 0; cell < cellCount; cell++) {
        let index = 0;

        for (let read = 0; read < bitWidth; read++) {
            const isSet = payload[paletteEnd + (bit >> 3)] & (0x80 >> (bit & 7));
            index = (index << 1) | (isSet ? 1 : 0);
            bit++;
        }

        // A bit width rounded up to a whole number of bits can encode indices
        // past the end of the palette, so every one is range-checked.
        if (index >= paletteLength) return null;

        colors[cell] = palette[index];
    }

    return colors;
};

/**
 * Reads a save file, returning null for anything that is not a sketch this app
 * can render.
 *
 * The input is a user-chosen file and is treated as hostile: the magic bytes are
 * checked, the grid size is range-checked before it is used to size anything,
 * each decoder requires the payload length to match the cell count exactly, and
 * palette indices are checked against the palette length. Corruption is caught
 * by the zlib checksum. Every failure returns null rather than throwing, so the
 * caller has one thing to handle.
 *
 * Takes `Bytes` rather than an `ArrayBuffer` so the caller owns the single copy
 * the decode needs. Those bytes must not be mutated while the promise is
 * pending.
 */
export const parseSketch = async (file: Bytes): Promise<Sketch | null> => {
    if (file.length < HEADER_SIZE) return null;
    if (MAGIC.some((byte, at) => file[at] !== byte)) return null;

    const gridSize = file[GRID_SIZE_OFFSET];
    if (!isSupportedGridSize(gridSize)) return null;

    const mode = file[MODE_OFFSET];
    if (mode !== PALETTE_MODE && mode !== RGB_MODE) return null;

    let payload: Bytes;
    try {
        payload = await inflate(file.subarray(HEADER_SIZE) as Bytes);
    } catch {
        return null;
    }

    const cellCount = gridSize * gridSize;
    const colors =
        mode === PALETTE_MODE
            ? decodePalettePayload(payload, cellCount)
            : decodeRgbPayload(payload, cellCount);

    return colors && { gridSize, colors };
};
