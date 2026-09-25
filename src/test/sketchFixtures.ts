/**
 * @file Sketches and workspaces for tests. The sketches measure the save
 * format, and are deterministic so the size assertions in `sketchFile.test`
 * cannot become flaky.
 */

import { createBlankGrid, type Sketch } from "../domain/grid";
import type { Workspace } from "../domain/workspace";

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
 * Every cell a different color, which past 255 colors is what forces RGB mode.
 * The sequence is a deterministic ramp rather than the independent random color
 * `randomHexColor` gives each cell, so it compresses noticeably better than a
 * canvas the colorful pen actually fills — real per-cell randomness would make
 * the size assertions in `sketchFile.test` flaky, which matters more here than
 * matching that tool's output byte for byte.
 */
export const rainbowSketch = (gridSize: number): Sketch => ({
    gridSize,
    colors: Array.from(
        { length: gridSize * gridSize },
        (_, index) => `#${index.toString(16).padStart(6, "0").toUpperCase()}`
    ),
});

/**
 * A 2×2 workspace with one step to undo and one to redo, and settings apart
 * from the defaults, so that each part of it is seen to survive storage.
 */
export const smallWorkspace = (): Workspace => {
    const pen = "#123456";
    const colors = createBlankGrid(2);
    colors[0] = pen;

    return {
        document: {
            gridSize: 2,
            colors,
            undoStack: [[{ index: 0, before: "#FFFFFF", after: pen }]],
            redoStack: [
                [
                    { index: 1, before: "#FFFFFF", after: "#ABCDEF" },
                    { index: 3, before: "#FFFFFF", after: "#ABCDEF" },
                ],
            ],
        },
        settings: {
            tool: "eraser",
            penColor: pen,
            symmetry: { topBottom: true, leftRight: false },
            showGridLines: false,
        },
    };
};
