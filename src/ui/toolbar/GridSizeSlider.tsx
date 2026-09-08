/** @file The grid size control: a restyled native range input and its caption. */

import { MAX_GRID_SIZE, MIN_GRID_SIZE } from "../../domain/grid";

interface GridSizeSliderProps {
    gridSize: number;
    onChange: (gridSize: number) => void;
}

/**
 * A native range input, so it is keyboard operable and exposes the slider role
 * and its range without any code. Its track and thumb are restyled in
 * `.grid-size-slider`; how far along the track the fill runs is the one thing CSS
 * cannot work out on its own, so it is handed over as a 0..1 ratio.
 *
 * The visible caption is hidden from assistive technology and the slider carries
 * the same value as `aria-valuetext`, so the size is announced once, as "32 by
 * 32" rather than as a bare number.
 */
export const GridSizeSlider: React.FC<GridSizeSliderProps> = ({
    gridSize,
    onChange,
}) => (
    <div className="flex flex-col gap-3">
        <p className="text-lg text-center font-pixeled" aria-hidden="true">
            {gridSize} X {gridSize}
        </p>
        <input
            type="range"
            aria-label="Grid size"
            aria-valuetext={`${gridSize} by ${gridSize}`}
            min={MIN_GRID_SIZE}
            max={MAX_GRID_SIZE}
            step={1}
            value={gridSize}
            onChange={(event) => onChange(event.target.valueAsNumber)}
            className="grid-size-slider"
            style={
                {
                    "--slider-progress":
                        (gridSize - MIN_GRID_SIZE) / (MAX_GRID_SIZE - MIN_GRID_SIZE),
                } as React.CSSProperties
            }
        />
    </div>
);
