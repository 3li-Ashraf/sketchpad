/**
 * @file Conversion between the `#RRGGBB` strings the app holds and the RGB
 * bytes files and images need.
 *
 * Every color in the app is uppercase `#RRGGBB`, so colors compare with `===`.
 * The one source of another case, the native color input, is normalized by the
 * store; colors decoded from files come out of `rgbToHex`.
 */

const CANONICAL_HEX_COLOR = /^#[0-9A-F]{6}$/;
const HEX_COLOR = /^#[0-9A-F]{6}$/i;

/**
 * Whether a value is a color in the app's form: `#` and six uppercase digits.
 * The type is checked first because a pattern test converts its argument to a
 * string, which would pass a `String` object read back from storage.
 */
export const isHexColor = (value: unknown): value is string =>
    typeof value === "string" && CANONICAL_HEX_COLOR.test(value);

/**
 * Reads `#rrggbb` in either case into the app's form, or null for anything
 * else, including the three-digit shorthand.
 */
export const parseHexColor = (value: string): string | null =>
    HEX_COLOR.test(value) ? value.toUpperCase() : null;

/** The largest color as a number, `#FFFFFF`. */
export const MAX_COLOR_NUMBER = 0xffffff;

/**
 * A color as one number, `0xRRGGBB`, which typed arrays can hold. The color
 * must already be valid, as for `hexToRgb`.
 */
export const hexToNumber = (color: string): number =>
    parseInt(color.slice(1), 16);

/** Whether a number holds a color: a whole number from 0 to `#FFFFFF`. */
export const isColorNumber = (value: number): boolean =>
    Number.isInteger(value) && value >= 0 && value <= MAX_COLOR_NUMBER;

/**
 * The color a number holds; it must pass `isColorNumber`. Every color the app
 * builds is written here, so all of them come out the same: uppercase, and
 * padded to six digits.
 */
export const numberToHex = (value: number): string =>
    `#${value.toString(16).padStart(6, "0").toUpperCase()}`;

export const randomHexColor = (): string =>
    numberToHex(Math.floor(Math.random() * (MAX_COLOR_NUMBER + 1)));

/**
 * Splits a color into its channels, read from fixed offsets. The color must
 * already be valid; anything else yields `NaN` channels.
 */
export const hexToRgb = (color: string): [number, number, number] => [
    parseInt(color.slice(1, 3), 16),
    parseInt(color.slice(3, 5), 16),
    parseInt(color.slice(5, 7), 16),
];

/** Builds a color from three channel bytes, each 0 to 255. */
export const rgbToHex = (red: number, green: number, blue: number): string =>
    numberToHex((red << 16) | (green << 8) | blue);
