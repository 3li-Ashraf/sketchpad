/** @file The pen color swatch, wrapping the platform color picker. */

import { Tooltip } from "../common/Tooltip";

interface ColorPickerProps {
    color: string;
    onChange: (color: string) => void;
}

/**
 * The native color input, hidden behind a swatch showing the current pen color.
 * The input is transparent rather than `display: none`, so it stays interactive
 * and clicking or focusing the swatch opens the platform picker.
 */
export const ColorPicker: React.FC<ColorPickerProps> = ({ color, onChange }) => (
    <Tooltip label="Color">
        <label
            style={{ backgroundColor: color }}
            className="toolbar-control cursor-pointer"
        >
            <input
                type="color"
                aria-label="Color"
                value={color}
                className="opacity-0 w-9 h-9 cursor-pointer"
                onChange={(event) => onChange(event.target.value)}
            />
        </label>
    </Tooltip>
);
