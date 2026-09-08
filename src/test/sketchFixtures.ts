/**
 * @file Sketches to measure the save format against. They are deterministic, so
 * the size assertions in `sketchFile.test` cannot become flaky.
 */

import { createBlankGrid, type Sketch } from "../domain/grid";

/** A seeded linear congruential generator, so every fixture is reproducible. */
const seededRandom = (seed: number) => () =>
    (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

/**
 * A stand-in for hand-drawn pixel art: irregular blobs of a few flat colors.
 * Regular, highly repetitive fill patterns would not be representative, because
 * deflate alone already compresses those to almost nothing and either payload
 * layout would look equally good.
 */
export const artworkSketch = (gridSize: number, paletteSize = 6): Sketch => {
    const random = seededRandom(7);

    const palette = Array.from(
        { length: paletteSize },
        () =>
            `#${Math.floor(random() * 0x1000000)
                .toString(16)
                .padStart(6, "0")
                .toUpperCase()}`
    );
    const colors = createBlankGrid(gridSize);

    for (let blob = 0; blob < gridSize; blob++) {
        const centerX = Math.floor(random() * gridSize);
        const centerY = Math.floor(random() * gridSize);
        const radius = 1 + Math.floor(random() * (gridSize / 8 + 1));
        const color = palette[Math.floor(random() * palette.length)];

        const fromY = Math.max(0, centerY - radius);
        const toY = Math.min(gridSize, centerY + radius);
        const fromX = Math.max(0, centerX - radius);
        const toX = Math.min(gridSize, centerX + radius);

        for (let y = fromY; y < toY; y++) {
            for (let x = fromX; x < toX; x++) {
                if ((x - centerX) ** 2 + (y - centerY) ** 2 <= radius ** 2) {
                    colors[y * gridSize + x] = color;
                }
            }
        }
    }

    return { gridSize, colors };
};

/**
 * Every cell a different color — the worst case for the save format, and past
 * 255 colors the case that forces RGB mode. It is also roughly what the colorful
 * pen produces.
 */
export const rainbowSketch = (gridSize: number): Sketch => ({
    gridSize,
    colors: Array.from(
        { length: gridSize * gridSize },
        (_, index) => `#${index.toString(16).padStart(6, "0").toUpperCase()}`
    ),
});
