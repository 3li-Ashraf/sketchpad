/**
 * @file The drawing surface: a CSS grid of `CanvasCell`s, driven by
 * `usePaintGestures`.
 */

import { useMemo } from "react";

import { useSketchStore } from "../../state/sketchStore";
import {
    CANVAS_FRAME_HEIGHT,
    CANVAS_FRAME_PADDING,
    CANVAS_FRAME_WIDTH,
    EDITOR_PANEL_HEIGHT,
} from "../common/panelSize";
import { CanvasCell } from "./CanvasCell";
import { usePaintGestures } from "./usePaintGestures";

export const Canvas: React.FC = () => {
    const gridSize = useSketchStore((state) => state.document.gridSize);
    const showGridLines = useSketchStore((state) => state.showGridLines);
    const { surfaceRef, surfaceProps } = usePaintGestures();

    // The cells depend on the grid size alone, so a stroke never rebuilds
    // them. `Canvas.test` pins this: widening the dependencies fails it.
    const cells = useMemo(
        () =>
            Array.from({ length: gridSize * gridSize }, (_, index) => (
                <CanvasCell key={index} index={index} />
            )),
        [gridSize]
    );

    return (
        // `touch-none` keeps the browser from claiming a finger drag as a pan
        // or pinch-zoom, which would stop the pointer events drawing relies
        // on. `Canvas.browser.test` drags a finger across it in Chromium.
        <div
            className={`touch-none rounded-md border border-accent ${CANVAS_FRAME_WIDTH} ${CANVAS_FRAME_HEIGHT} ${EDITOR_PANEL_HEIGHT} ${CANVAS_FRAME_PADDING}`}
        >
            <div
                ref={surfaceRef}
                // An image to assistive technology, which then skips the
                // thousands of empty cells inside it.
                role="img"
                aria-label={`Canvas, ${gridSize} by ${gridSize}`}
                className={`grid h-full ${showGridLines ? "canvas-surface--lined" : ""}`}
                style={{
                    gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
                    gridTemplateRows: `repeat(${gridSize}, 1fr)`,
                }}
                {...surfaceProps}
            >
                {cells}
            </div>
        </div>
    );
};
