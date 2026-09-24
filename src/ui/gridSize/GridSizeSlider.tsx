/** @file The grid size slider: a restyled native range input and its caption. */

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
 * A native range input, so keyboard use and the slider role come for free;
 * `.grid-size-slider` restyles it, and the fill's extent is passed in as a 0..1
 * ratio because CSS cannot compute it. The caption is hidden from screen
 * readers, which hear `aria-valuetext` ("32 by 32") instead.
 *
 * Locked, the input ignores the pointer, so a press cannot start a drag the
 * browser would continue beneath a dialog. The press lands on the track
 * instead, and a key that would step it is caught first; both go through
 * `onBeforeChange`.
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

        // Prevented so the press does not move focus to wherever it landed.
        // The slider takes focus instead, so closing the dialog returns it here.
        event.preventDefault();
        inputRef.current!.focus();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (!keyMovesSlider(event.key, gridSize) || onBeforeChange()) return;

        event.preventDefault();
    };

    return (
        <div className="flex flex-col gap-3">
            <p className="text-center font-pixeled text-lg" aria-hidden="true">
                {gridSize} × {gridSize}
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
                    className={`grid-size-slider ${isLocked ? "pointer-events-none" : ""}`}
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
