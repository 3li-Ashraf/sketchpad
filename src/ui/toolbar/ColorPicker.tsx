/** @file The pen color swatch, wrapping the platform color picker. */

import { Tooltip } from "../common/Tooltip";

interface ColorPickerProps {
    color: string;
    onChange: (color: string) => void;
}

/**
 * The native color input behind a swatch of the current color. It is
 * transparent rather than `display: none`, so it stays clickable and focusable.
 */
export const ColorPicker: React.FC<ColorPickerProps> = ({
    color,
    onChange,
}) => (
    <Tooltip label="Color">
        <label
            style={{ backgroundColor: color }}
            className="control cursor-pointer"
        >
            <input
                type="color"
                aria-label="Color"
                value={color}
                className="h-9 w-9 cursor-pointer opacity-0"
                onChange={(event) => onChange(event.target.value)}
            />
        </label>
    </Tooltip>
);
