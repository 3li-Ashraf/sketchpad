/**
 * @file Conversion between the `#RRGGBB` strings the app holds and the RGB bytes
 * the save format and the PNG export need. Pure: no DOM, no React, no store.
 *
 * Every color in the app is an uppercase `#RRGGBB` string, which is what lets
 * colors be compared with `===` rather than parsed. Nothing here enforces that
 * on arriving values; `state/sketchStore` normalizes the one path that can carry
 * another case, the native color input.
 */

export const normalizeHexColor = (color: string): string => color.toUpperCase();

export const randomHexColor = (): string =>
    `#${Math.floor(Math.random() * 0x1000000)
        .toString(16)
        .padStart(6, "0")
        .toUpperCase()}`;

/**
 * Splits a color into its three channels. The argument must be exactly a `#`
 * followed by six hex digits: the channels are read from fixed offsets, and
 * nothing validates the shape, so any other string yields `NaN` channels.
 * Digit case does not matter — `parseInt` accepts either — but the length and
 * the leading `#` do.
 */
export const hexToRgb = (color: string): [number, number, number] => [
    parseInt(color.slice(1, 3), 16),
    parseInt(color.slice(3, 5), 16),
    parseInt(color.slice(5, 7), 16),
];

/**
 * Builds a color from three channel bytes. This is the only step between a
 * loaded file and the store, and `loadSketch` does not normalize, so the
 * uppercasing here is what keeps a decoded sketch inside the app-wide
 * convention.
 */
export const rgbToHex = (red: number, green: number, blue: number): string =>
    `#${[red, green, blue]
        .map((channel) => channel.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase()}`;
