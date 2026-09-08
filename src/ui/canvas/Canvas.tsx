/**
 * @file The drawing surface: a CSS grid of `CanvasCell`s, sized from the store.
 * The gesture handling it spreads onto that surface lives in `usePaintGestures`.
 */

import { useMemo } from "react";
import { useSketchStore } from "../../state/sketchStore";
import { usePaintGestures } from "./usePaintGestures";
import {
    CANVAS_FRAME_HEIGHT,
    CANVAS_FRAME_PADDING,
    CANVAS_FRAME_WIDTH,
    EDITOR_PANEL_HEIGHT,
} from "../common/panelSize";
import { CanvasCell } from "./CanvasCell";

export const Canvas: React.FC = () => {
    const gridSize = useSketchStore((state) => state.gridSize);
    const showGridLines = useSketchStore((state) => state.showGridLines);
    const { surfaceRef, surfaceProps } = usePaintGestures();

    // The cell elements depend only on the grid size. Memoizing them is what
    // stops a stroke from rebuilding the whole grid on every pointer move.
    // Widening this dependency list breaks a tested contract, not just an
    // optimization: `Canvas.test` asserts that a stroke recreates no cell.
    const cells = useMemo(
        () =>
            Array.from({ length: gridSize * gridSize }, (_, index) => (
                <CanvasCell key={index} index={index} />
            )),
        [gridSize]
    );

    return (
        // `touch-none` suppresses the browser's own touch gestures over the
        // canvas: without it a finger drag is claimed as a pan or pinch-zoom and
        // the pointer stream stops reaching the paint handler, so touch drawing
        // silently fails. jsdom has no touch gesture engine, so no test covers
        // this and the class has to be defended in prose.
        <div
            className={`touch-none rounded-md border border-accent ${CANVAS_FRAME_WIDTH} ${CANVAS_FRAME_HEIGHT} ${EDITOR_PANEL_HEIGHT} ${CANVAS_FRAME_PADDING}`}
        >
            <div
                ref={surfaceRef}
                data-testid="canvas-surface"
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
