/**
 * @file The whole app laid out by a real browser, with the real fonts: at
 * phone widths nothing may push the page sideways and the canvas has to stay
 * square and on screen, and at every width the settings panel has to hold
 * its controls.
 */

import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/press-start-2p/latin-400.css";
import "../styles/index.css";

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";

import { App } from "./App";

afterEach(async () => {
    await page.viewport(414, 896);
});

describe("App on a narrow screen", () => {
    it.each([320, 360, 375])(
        "fits %i px without scrolling sideways, canvas square and on screen",
        async (width) => {
            await page.viewport(width, 700);
            document.documentElement.style.height = "100%";
            render(<App />);
            await document.fonts.ready;

            const canvas = screen
                .getByRole("img", { name: /^Canvas/ })
                .parentElement!.getBoundingClientRect();

            expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
                width
            );
            expect(canvas.left).toBeGreaterThanOrEqual(0);
            expect(canvas.right).toBeLessThanOrEqual(width);
            expect(Math.abs(canvas.width - canvas.height)).toBeLessThan(1);
        }
    );
});

describe("the settings panel", () => {
    // Its heights are fixed to match the canvas, so a control added to it
    // could spill past its border with nothing else failing.
    it.each([375, 768, 1024, 1280, 1536])(
        "holds every control at %i px",
        async (width) => {
            await page.viewport(width, 900);
            render(<App />);
            await document.fonts.ready;
            // Below the md breakpoint it is a popover, closed until asked for.
            if (width < 768) {
                await userEvent.click(
                    screen.getByRole("button", { name: "Settings" })
                );
            }

            const panel = screen.getByRole("complementary", {
                name: "Settings",
            });

            expect(panel.scrollHeight).toBeLessThanOrEqual(panel.clientHeight);
        }
    );
});

describe("on a laptop screen", () => {
    // Viewports as a browser leaves them on common laptop screens, beneath
    // its tabs and toolbar.
    it.each([
        ["1366×768", 1366, 657],
        ["1536×864 at 125%", 1536, 730],
        ["1280×800", 1280, 689],
        ["1440×900", 1440, 789],
        ["iPad in landscape", 1024, 700],
    ])(
        "keeps the whole canvas in view on %s, square, with every control in the panel",
        async (_, width, height) => {
            await page.viewport(width, height);
            render(<App />);
            await document.fonts.ready;

            const canvas = screen
                .getByRole("img", { name: /^Canvas/ })
                .parentElement!.getBoundingClientRect();
            const panel = screen.getByRole("complementary", {
                name: "Settings",
            });

            expect(canvas.bottom).toBeLessThanOrEqual(height);
            expect(Math.abs(canvas.width - canvas.height)).toBeLessThan(1);
            expect(panel.scrollHeight).toBeLessThanOrEqual(panel.clientHeight);
        }
    );

    it("scrolls, rather than shrink the panel past holding its controls", async () => {
        await page.viewport(1280, 480);
        render(<App />);
        await document.fonts.ready;

        const canvas = screen
            .getByRole("img", { name: /^Canvas/ })
            .parentElement!.getBoundingClientRect();
        const panel = screen.getByRole("complementary", { name: "Settings" });

        expect(Math.round(canvas.height)).toBe(540);
        expect(panel.scrollHeight).toBeLessThanOrEqual(panel.clientHeight);
        expect(document.documentElement.scrollHeight).toBeGreaterThan(480);
    });
});

describe("motion and focus", () => {
    afterEach(async () => {
        await commands.setMotionPreference("default");
    });

    it("keeps the settings icon still for a user who asks for less motion", async () => {
        await page.viewport(375, 700);
        await commands.setMotionPreference("reduce");
        render(<App />);

        const icon = screen.getByRole("button", {
            name: "Settings",
        }).firstElementChild!;

        expect(getComputedStyle(icon).animationName).toBe("none");
    });

    it("spins the settings icon for everyone else", async () => {
        await page.viewport(375, 700);
        await commands.setMotionPreference("no-preference");
        render(<App />);

        const icon = screen.getByRole("button", {
            name: "Settings",
        }).firstElementChild!;

        expect(getComputedStyle(icon).animationName).not.toBe("none");
    });

    it("rings the color swatch when the keyboard reaches it, as every other control", async () => {
        await page.viewport(1280, 950);
        render(<App />);
        const color = screen.getByLabelText("Color");

        while (document.activeElement !== color) await userEvent.tab();

        expect(getComputedStyle(color.closest("label")!).outlineStyle).not.toBe(
            "none"
        );
    });
});
