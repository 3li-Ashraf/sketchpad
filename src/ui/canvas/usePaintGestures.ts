/**
 * @file Turns pointer input over the canvas into store actions. It owns the
 * gesture (which pointer is drawing, where it was last, when the stroke ends)
 * and none of the drawing rules.
 */

import { useCallback, useEffect, useRef } from "react";

import { type CellPosition, toCellIndex } from "../../domain/grid";
import { traceLine } from "../../domain/line";
import { isStrokeTool } from "../../domain/tools";
import { useSketchActions, useSketchStore } from "../../state/sketchStore";

// Capture is an enhancement: without it the window listeners below still end
// the stroke, so an environment that refuses it is not an error. Releasing a
// pointer that is not captured, as after a touch ends, is refused the same way.
const tryPointerCapture = (
    surface: HTMLElement,
    pointerId: number,
    capture: boolean
): void => {
    try {
        if (capture) surface.setPointerCapture(pointerId);
        else surface.releasePointerCapture(pointerId);
    } catch {
        // Drawing works without capture.
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
 * Pointer events cover mouse, touch and pen in one path. The cell under the
 * pointer is computed from the surface rectangle, and the cells between two
 * samples are traced, so a fast drag stays connected.
 */
export const usePaintGestures = (): PaintGestures => {
    const surfaceRef = useRef<HTMLDivElement>(null);
    const activePointerRef = useRef<number | null>(null);
    const lastPositionRef = useRef<CellPosition | null>(null);

    const { beginStroke, paintCells, endStroke, fillFrom } = useSketchActions();

    const cellPositionAt = useCallback(
        (event: React.PointerEvent<HTMLDivElement>): CellPosition | null => {
            const rect = event.currentTarget.getBoundingClientRect();
            const { gridSize } = useSketchStore.getState().document;
            const column = Math.floor(
                ((event.clientX - rect.left) / rect.width) * gridSize
            );
            const row = Math.floor(
                ((event.clientY - rect.top) / rect.height) * gridSize
            );

            // A surface not laid out yet has no size, which puts every point
            // at a NaN or infinite cell, and so out of bounds too.
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
            // Primary button, one pointer at a time: a second finger would
            // otherwise interleave another line into the same undo step.
            if (event.button !== 0 || activePointerRef.current !== null) return;

            const position = cellPositionAt(event);
            if (!position) return;

            event.preventDefault();

            const { document, tool } = useSketchStore.getState();
            const index = toCellIndex(position, document.gridSize);

            if (!isStrokeTool(tool)) {
                fillFrom(index);
                return;
            }

            tryPointerCapture(event.currentTarget, event.pointerId, true);

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

            // Nothing is held any more, yet no release came, as when the
            // window loses focus mid-drag. The stroke ends here, rather than
            // go on painting wherever the pointer hovers.
            if (event.buttons === 0) {
                finishStroke(event.pointerId);
                return;
            }

            const position = cellPositionAt(event);
            if (!position) {
                // Leaving the canvas pauses the stroke; coming back starts a
                // new segment rather than drawing a line across the gap.
                lastPositionRef.current = null;
                return;
            }

            const previous = lastPositionRef.current;
            if (
                previous?.row === position.row &&
                previous.column === position.column
            ) {
                return;
            }

            const { gridSize } = useSketchStore.getState().document;
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
        [cellPositionAt, finishStroke, paintCells]
    );

    // On the window, so a stroke still commits when the pointer comes up
    // off the canvas or the gesture is cancelled outright.
    useEffect(() => {
        const handleRelease = (event: PointerEvent) =>
            finishStroke(event.pointerId);

        window.addEventListener("pointerup", handleRelease);
        window.addEventListener("pointercancel", handleRelease);

        return () => {
            window.removeEventListener("pointerup", handleRelease);
            window.removeEventListener("pointercancel", handleRelease);

            // Nothing will hear this stroke's release now, as when a crash
            // unmounts the canvas mid-drag, so it commits here. Left open,
            // it would go on refusing undo and holding back the autosave.
            const pointerId = activePointerRef.current;
            if (pointerId !== null) finishStroke(pointerId);
        };
    }, [finishStroke]);

    // A long press on touch, or a right-drag, would open the context menu
    // over the drawing and cut the stroke short.
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
