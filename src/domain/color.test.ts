import { describe, expect, it, vi } from "vitest";

import {
    hexToNumber,
    hexToRgb,
    isColorNumber,
    isHexColor,
    MAX_COLOR_NUMBER,
    numberToHex,
    parseHexColor,
    randomHexColor,
    rgbToHex,
} from "./color";

const NOT_COLORS = [
    "",
    "red",
    "#fff",
    "#FFF",
    "3EA6FF",
    "#3EA6F",
    "#3EA6FFF",
    "#3EA6FG",
    " #3EA6FF",
    "#3EA6FF ",
    "#3EA6FF80",
];

describe("parseHexColor", () => {
    it("uppercases a six-digit color, so colors compare by value", () => {
        expect(parseHexColor("#3ea6ff")).toBe("#3EA6FF");
        expect(parseHexColor("#3EA6FF")).toBe("#3EA6FF");
    });

    it.each(NOT_COLORS)("refuses %j", (value) => {
        expect(parseHexColor(value)).toBeNull();
    });
});

describe("isHexColor", () => {
    it("accepts the app's form only: # and six uppercase digits", () => {
        expect(isHexColor("#3EA6FF")).toBe(true);
        expect(isHexColor("#3ea6ff")).toBe(false);
    });

    it.each(NOT_COLORS)("refuses %j", (value) => {
        expect(isHexColor(value)).toBe(false);
    });
});

describe("randomHexColor", () => {
    it.each([
        [0, "#000000"],
        [0.0000001, "#000001"],
        [0.5, "#800000"],
        [0.9999999999, "#FFFFFF"],
    ])(
        "maps Math.random() = %d onto the full range as %s, padded and uppercase",
        (random, color) => {
            vi.spyOn(Math, "random").mockReturnValue(random);

            expect(randomHexColor()).toBe(color);
        }
    );
});

describe("hexToRgb", () => {
    it("splits a color into its three channels", () => {
        expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
        expect(hexToRgb("#FFFFFF")).toEqual([255, 255, 255]);
        expect(hexToRgb("#3EA6FF")).toEqual([62, 166, 255]);
    });

    // Nothing in production relies on this: the store normalizes the one
    // lowercase source, the native color input.
    it("reads lowercase digits too, though the app always hands it uppercase", () => {
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

describe("hexToNumber and numberToHex", () => {
    it.each([
        ["#000000", 0],
        ["#00000F", 0xf],
        ["#3EA6FF", 0x3ea6ff],
        ["#FFFFFF", MAX_COLOR_NUMBER],
    ])(
        "hold %s as %i and read it back, padded and uppercase",
        (color, value) => {
            expect(hexToNumber(color)).toBe(value);
            expect(numberToHex(value)).toBe(color);
        }
    );
});

describe("isColorNumber", () => {
    it("accepts every whole number from black to white", () => {
        expect(isColorNumber(0)).toBe(true);
        expect(isColorNumber(MAX_COLOR_NUMBER)).toBe(true);
    });

    it.each([-1, MAX_COLOR_NUMBER + 1, 0.5, Number.NaN])(
        "refuses %d",
        (value) => {
            expect(isColorNumber(value)).toBe(false);
        }
    );
});

describe("hex and rgb together", () => {
    it("round-trips every channel value, with the three kept distinct", () => {
        // Offsets a third of 256 apart keep the three channels different on
        // every iteration, so swapping two of them could not pass unnoticed.
        for (let channel = 0; channel <= 255; channel++) {
            const rgb: [number, number, number] = [
                channel,
                (channel + 85) % 256,
                (channel + 170) % 256,
            ];
            const color = rgbToHex(...rgb);

            expect(new Set(rgb).size).toBe(3);
            expect(isHexColor(color)).toBe(true);
            expect(hexToRgb(color)).toEqual(rgb);
        }
    });
});
