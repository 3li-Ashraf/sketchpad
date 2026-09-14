/** @file The grid size control: a restyled native range input and its caption. */

import { useRef } from "react";
import { MAX_GRID_SIZE, MIN_GRID_SIZE } from "../../domain/grid";

interface GridSizeSliderProps {
    gridSize: number;
    /** While set, the input ignores the pointer; see `onBeforeChange`. */
    isLocked: boolean;
    /** Every step of a drag or a key, once the slider has moved. */
    onChange: (gridSize: number) => void;
    /**
     * A press, or a key that would step the slider, before anything moves.
     * Returning false holds the slider still.
     */
    onBeforeChange: () => boolean;
}

const RAISING_KEYS = new Set(["ArrowRight", "ArrowUp", "PageUp", "End"]);
const LOWERING_KEYS = new Set(["ArrowLeft", "ArrowDown", "PageDown", "Home"]);

/** Whether a key would move the slider from where it stands. */
const keyMovesSlider = (key: string, gridSize: number): boolean =>
    (RAISING_KEYS.has(key) && gridSize < MAX_GRID_SIZE) ||
    (LOWERING_KEYS.has(key) && gridSize > MIN_GRID_SIZE);

/**
 * A native range input, so it is keyboard operable and exposes the slider role
 * and its range without any code. Its track and thumb are restyled in
 * `.grid-size-slider`; how far along the track the fill runs is the one thing CSS
 * cannot work out on its own, so it is handed over as a 0..1 ratio.
 *
 * The visible caption is hidden from assistive technology and the slider carries
 * the same value as `aria-valuetext`, so the size is announced once, as "32 by
 * 32" rather than as a bare number.
 *
 * Locked, the input ignores the pointer, so a press cannot start a drag that the
 * browser would carry on with underneath a dialog. The press lands on the track
 * around it instead, and a key that would step the slider is caught before it
 * does; either is reported through `onBeforeChange`, and moves nothing unless the
 * answer lets it.
 */
export const GridSizeSlider: React.FC<GridSizeSliderProps> = ({
    gridSize,
    isLocked,
    onChange,
    onBeforeChange,
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || onBeforeChange()) return;

        // Prevented so the press does not go on to move focus to wherever the
        // pointer came down, which under the dialog it has just opened is not
        // the dialog. The slider takes focus, as it would for a press it had
        // handled itself, so closing the dialog hands focus back to it.
        event.preventDefault();
        inputRef.current!.focus();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (!keyMovesSlider(event.key, gridSize) || onBeforeChange()) return;

        event.preventDefault();
    };

    return (
        <div className="flex flex-col gap-3">
            <p className="text-lg text-center font-pixeled" aria-hidden="true">
                {gridSize} X {gridSize}
            </p>
            <div
                className="grid-size-track flex cursor-pointer"
                onPointerDown={handlePointerDown}
            >
                <input
                    ref={inputRef}
                    type="range"
                    aria-label="Grid size"
                    aria-valuetext={`${gridSize} by ${gridSize}`}
                    min={MIN_GRID_SIZE}
                    max={MAX_GRID_SIZE}
                    step={1}
                    value={gridSize}
                    onChange={(event) => onChange(event.target.valueAsNumber)}
                    onKeyDown={handleKeyDown}
                    className={`grid-size-slider${isLocked ? " pointer-events-none" : ""}`}
                    style={
                        {
                            "--slider-progress":
                                (gridSize - MIN_GRID_SIZE) /
                                (MAX_GRID_SIZE - MIN_GRID_SIZE),
                        } as React.CSSProperties
                    }
                />
            </div>
        </div>
    );
};
