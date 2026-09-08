/**
 * @file Turns pointer input over the canvas into store actions. It owns the
 * gesture — which pointer is drawing, where it was last, when the stroke ends —
 * and none of the drawing rules, which stay in the store and the domain layer.
 */

import { useCallback, useEffect, useRef } from "react";
import { toCellIndex, type CellPosition } from "../../domain/grid";
import { traceLine } from "../../domain/line";
import { isStrokeTool } from "../../domain/tools";
import { useSketchStore } from "../../state/sketchStore";

// Pointer capture is an enhancement, not a requirement, and is unavailable in
// some environments — jsdom implements none of it, so every call throws there.
const tryPointerCapture = (
    surface: HTMLElement,
    pointerId: number,
    capture: boolean
): void => {
    try {
        if (capture) surface.setPointerCapture(pointerId);
        else if (surface.hasPointerCapture(pointerId))
            surface.releasePointerCapture(pointerId);
    } catch {
        // Swallowed: without capture the stroke still works, because the
        // window-level listeners below are what end it.
    }
};

interface PaintGestures {
    surfaceRef: React.RefObject<HTMLDivElement | null>;
    surfaceProps: {
        onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
        onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
        onContextMenu: (event: React.MouseEvent) => void;
    };
}

/**
 * Pointer events cover mouse, touch and pen in one path, so there is no separate
 * touch handling. The cell under the pointer is derived arithmetically from the
 * surface rectangle rather than from the DOM, which is what lets the cells
 * themselves be inert divs with no listeners of their own.
 */
export const usePaintGestures = (): PaintGestures => {
    const surfaceRef = useRef<HTMLDivElement>(null);
    const activePointerRef = useRef<number | null>(null);
    const lastPositionRef = useRef<CellPosition | null>(null);

    const beginStroke = useSketchStore((state) => state.beginStroke);
    const paintCells = useSketchStore((state) => state.paintCells);
    const endStroke = useSketchStore((state) => state.endStroke);
    const fillFrom = useSketchStore((state) => state.fillFrom);

    const cellPositionAt = useCallback(
        (event: React.PointerEvent<HTMLDivElement>): CellPosition | null => {
            const surface = surfaceRef.current;
            if (!surface) return null;

            const rect = surface.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return null;

            const { gridSize } = useSketchStore.getState();
            const column = Math.floor(
                ((event.clientX - rect.left) / rect.width) * gridSize
            );
            const row = Math.floor(
                ((event.clientY - rect.top) / rect.height) * gridSize
            );

            const inBounds =
                row >= 0 && row < gridSize && column >= 0 && column < gridSize;

            return inBounds ? { row, column } : null;
        },
        []
    );

    const finishStroke = useCallback(
        (pointerId: number) => {
            if (activePointerRef.current !== pointerId) return;

            activePointerRef.current = null;
            lastPositionRef.current = null;

            const surface = surfaceRef.current;
            if (surface) tryPointerCapture(surface, pointerId, false);

            endStroke();
        },
        [endStroke]
    );

    const handlePointerDown = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            // Primary button only, and one pointer at a time: a second finger
            // arriving mid-stroke would otherwise paint a second, interleaved
            // line into the same undo step.
            if (event.button !== 0 || activePointerRef.current !== null) return;

            const position = cellPositionAt(event);
            if (!position) return;

            event.preventDefault();

            const { gridSize, tool } = useSketchStore.getState();
            const index = toCellIndex(position, gridSize);

            if (!isStrokeTool(tool)) {
                fillFrom(index);
                return;
            }

            const surface = surfaceRef.current;
            if (surface) tryPointerCapture(surface, event.pointerId, true);

            activePointerRef.current = event.pointerId;
            lastPositionRef.current = position;

            beginStroke();
            paintCells([index]);
        },
        [beginStroke, cellPositionAt, fillFrom, paintCells]
    );

    const handlePointerMove = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            if (activePointerRef.current !== event.pointerId) return;

            const position = cellPositionAt(event);
            if (!position) {
                // Leaving the canvas pauses the stroke. Forgetting the last
                // position means coming back starts a new segment instead of
                // drawing a line across the gap.
                lastPositionRef.current = null;
                return;
            }

            const previous = lastPositionRef.current;
            if (
                previous &&
                previous.row === position.row &&
                previous.column === position.column
            ) {
                return;
            }

            const { gridSize } = useSketchStore.getState();
            const indices: number[] = [];

            if (previous) {
                traceLine(previous, position, (traced) =>
                    indices.push(toCellIndex(traced, gridSize))
                );
            } else {
                indices.push(toCellIndex(position, gridSize));
            }

            lastPositionRef.current = position;
            paintCells(indices);
        },
        [cellPositionAt, paintCells]
    );

    // Release and cancel are watched on the window, not the surface, so the
    // stroke is still committed when the pointer comes up off-canvas or the
    // gesture is cancelled outright.
    useEffect(() => {
        const handleRelease = (event: PointerEvent) => finishStroke(event.pointerId);

        window.addEventListener("pointerup", handleRelease);
        window.addEventListener("pointercancel", handleRelease);

        return () => {
            window.removeEventListener("pointerup", handleRelease);
            window.removeEventListener("pointercancel", handleRelease);
        };
    }, [finishStroke]);

    // A long press on touch, or a right-drag with a mouse, would otherwise open
    // the context menu over the drawing and cut the stroke short.
    const preventContextMenu = useCallback(
        (event: React.MouseEvent) => event.preventDefault(),
        []
    );

    return {
        surfaceRef,
        surfaceProps: {
            onPointerDown: handlePointerDown,
            onPointerMove: handlePointerMove,
            onContextMenu: preventContextMenu,
        },
    };
};
