/**
 * @file Rendering a sketch to a PNG through off-screen canvases. It only
 * produces the image; handing it to the browser is `fileDownload`'s job.
 */

import { hexToRgb } from "../domain/color";
import { isValidSketch, type Sketch } from "../domain/grid";
import { reportInvalidInput } from "../domain/invalidInput";

/** Edge length, in image pixels, of one grid cell in an exported PNG. */
export const DEFAULT_EXPORT_CELL_SIZE = 50;

const BYTES_PER_PIXEL = 4;
const OPAQUE = 255;

/**
 * One RGBA pixel per cell. Sketches hold few distinct colors across up to 4096
 * cells, so each color is parsed once rather than once per cell.
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

// Each canvas is checked on its own: a browser can grant the small one and
// refuse the full-size one (3200×3200 for a 64×64 sketch).
const create2dContext = (
    width: number,
    height: number
): CanvasRenderingContext2D => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error(`No 2D context for ${width}×${height}`);

    return context;
};

/**
 * Renders the sketch at `cellSize` image pixels per cell. It draws one pixel
 * per cell and scales that up once with smoothing off, which keeps cell edges
 * hard; that is exact only for a whole-number `cellSize`, hence the check.
 *
 * Rejects a sketch that does not hold together, a cell size that is not a
 * positive whole number, and a browser that cannot provide a canvas or encode
 * the image.
 */
export const renderSketchPng = async (
    sketch: Sketch,
    cellSize: number = DEFAULT_EXPORT_CELL_SIZE
): Promise<Blob> => {
    if (!isValidSketch(sketch)) {
        reportInvalidInput("renderSketchPng", "not a valid sketch", sketch);
        throw new TypeError("Not a valid sketch");
    }
    if (!Number.isInteger(cellSize) || cellSize < 1) {
        reportInvalidInput(
            "renderSketchPng",
            "not a whole cell size",
            cellSize
        );
        throw new RangeError("Cell size must be a positive integer");
    }

    const { gridSize } = sketch;

    const source = create2dContext(gridSize, gridSize);
    source.putImageData(
        new ImageData(toPixels(sketch), gridSize, gridSize),
        0,
        0
    );

    const size = gridSize * cellSize;
    const output = create2dContext(size, size);
    output.imageSmoothingEnabled = false;
    output.drawImage(source.canvas, 0, 0, size, size);

    const png = await new Promise<Blob | null>((resolve) =>
        output.canvas.toBlob(resolve, "image/png")
    );
    if (!png) throw new Error("The image could not be encoded");

    return png;
};
