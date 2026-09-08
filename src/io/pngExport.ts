/**
 * @file Rendering a sketch to a PNG data URL through an off-screen canvas. It
 * only produces the URL; handing it to the browser is `fileDownload`'s job.
 */

import { hexToRgb } from "../domain/color";
import type { Sketch } from "../domain/grid";

/** Edge length, in image pixels, of one grid cell in an exported PNG. */
export const DEFAULT_EXPORT_CELL_SIZE = 50;

const OPAQUE = 255;
const BYTES_PER_PIXEL = 4;

/**
 * Paints the sketch into an RGBA buffer at one image pixel per cell. Hex parsing
 * is memoized against the distribution real sketches have — a handful of distinct
 * colors across up to 4096 cells — so `hexToRgb` runs a few times rather than
 * once per cell.
 */
const toPixels = ({
    gridSize,
    colors,
}: Sketch): Uint8ClampedArray<ArrayBuffer> => {
    const pixels = new Uint8ClampedArray(gridSize * gridSize * BYTES_PER_PIXEL);
    const rgbOfColor = new Map<string, [number, number, number]>();

    for (let cell = 0; cell < colors.length; cell++) {
        const color = colors[cell];
        let rgb = rgbOfColor.get(color);

        if (rgb === undefined) {
            rgb = hexToRgb(color);
            rgbOfColor.set(color, rgb);
        }

        const at = cell * BYTES_PER_PIXEL;
        pixels[at] = rgb[0];
        pixels[at + 1] = rgb[1];
        pixels[at + 2] = rgb[2];
        pixels[at + 3] = OPAQUE;
    }

    return pixels;
};

const createCanvas = (
    width: number,
    height: number
): [HTMLCanvasElement, CanvasRenderingContext2D | null] => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    return [canvas, canvas.getContext("2d")];
};

/**
 * Renders the sketch at `cellSize` image pixels per cell and returns it as a PNG
 * data URL, or null when a 2D context cannot be had. Null is an ordinary outcome,
 * not an error path: it is what the test suite sees, since jsdom ships no 2D
 * canvas, and the caller turns it into a message rather than an assertion. Both
 * contexts are checked separately because a browser can grant the small surface
 * and refuse the full-size one.
 *
 * The sketch is drawn once at one pixel per cell and then blitted up in a single
 * scaled draw with image smoothing off, which keeps cells square-edged instead of
 * blurring them into each other. That is an exact nearest-neighbour scale only
 * when the factor is a whole number; nothing enforces an integer `cellSize`, so
 * the guarantee rests on callers passing one.
 */
export const sketchToPngDataUrl = (
    sketch: Sketch,
    cellSize: number = DEFAULT_EXPORT_CELL_SIZE
): string | null => {
    const { gridSize } = sketch;

    const [source, sourceContext] = createCanvas(gridSize, gridSize);
    if (!sourceContext) return null;

    sourceContext.putImageData(
        new ImageData(toPixels(sketch), gridSize, gridSize),
        0,
        0
    );

    const [output, outputContext] = createCanvas(
        gridSize * cellSize,
        gridSize * cellSize
    );
    if (!outputContext) return null;

    outputContext.imageSmoothingEnabled = false;
    outputContext.drawImage(source, 0, 0, output.width, output.height);

    return output.toDataURL("image/png");
};
