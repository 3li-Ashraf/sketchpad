/**
 * @file Covers `domain/color`: the two conversions and the uppercase
 * convention.
 */

import { describe, expect, it } from "vitest";
import { hexToRgb, normalizeHexColor, randomHexColor, rgbToHex } from "./color";

const HEX_COLOR = /^#[0-9A-F]{6}$/;

describe("normalizeHexColor", () => {
    it("uppercases so colors compare by value", () => {
        expect(normalizeHexColor("#3ea6ff")).toBe("#3EA6FF");
    });

    it("leaves an already normalized color alone", () => {
        expect(normalizeHexColor("#3EA6FF")).toBe("#3EA6FF");
    });
});

describe("randomHexColor", () => {
    it("always produces a valid uppercase hex color", () => {
        for (let attempt = 0; attempt < 500; attempt++) {
            expect(randomHexColor()).toMatch(HEX_COLOR);
        }
    });

    it("produces more than one value", () => {
        const colors = new Set(Array.from({ length: 50 }, randomHexColor));

        expect(colors.size).toBeGreaterThan(1);
    });
});

describe("hexToRgb", () => {
    it("splits a color into its three channels", () => {
        expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
        expect(hexToRgb("#FFFFFF")).toEqual([255, 255, 255]);
        expect(hexToRgb("#3EA6FF")).toEqual([62, 166, 255]);
    });

    // Lowercase reaches the app only from the native color input, and
    // `setPenColor` normalizes it before it is stored, so nothing in production
    // relies on this. A `.skpd` file cannot carry hex text of either case: it
    // holds raw RGB bytes, and every color out of the decoder is built by
    // `rgbToHex`.
    it("reads lowercase digits too, as a loaded file may carry them", () => {
        expect(hexToRgb("#3ea6ff")).toEqual([62, 166, 255]);
    });
});

describe("rgbToHex", () => {
    it("pads each channel to two uppercase digits", () => {
        expect(rgbToHex(0, 0, 0)).toBe("#000000");
        expect(rgbToHex(1, 2, 3)).toBe("#010203");
        expect(rgbToHex(62, 166, 255)).toBe("#3EA6FF");
    });
});

describe("hex and rgb together", () => {
    it("round-trips every channel value, with the three kept distinct", () => {
        // The 85 and 170 offsets are a third of 256 apart, so red, green and
        // blue hold three different values on every iteration and a conversion
        // that read or wrote the wrong channel could not pass unnoticed. The
        // assertion on the set size guards that property of the fixture itself.
        for (let channel = 0; channel <= 255; channel++) {
            const rgb: [number, number, number] = [
                channel,
                (channel + 85) % 256,
                (channel + 170) % 256,
            ];
            const color = rgbToHex(...rgb);

            expect(new Set(rgb).size).toBe(3);
            expect(color).toMatch(HEX_COLOR);
            expect(hexToRgb(color)).toEqual(rgb);
        }
    });
});
