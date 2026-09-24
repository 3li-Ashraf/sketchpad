/**
 * @file Commands the browser tests run in Node, beside Playwright, for what a
 * test inside the page cannot do itself: catch the file a download writes to
 * disk, touch the screen, and set the user's motion preference.
 * `src/test/browserCommands.d.ts` types them for
 * the tests.
 */

import { readFile } from "node:fs/promises";

import type { Download, Page } from "playwright";
import type { BrowserCommand } from "vitest/node";

interface Point {
    x: number;
    y: number;
}

const downloads = new WeakMap<Page, Download[]>();

/** Starts keeping every download the page begins, until taken. */
const recordDownloads: BrowserCommand = ({ page }) => {
    if (downloads.has(page)) return;

    const recorded: Download[] = [];
    downloads.set(page, recorded);
    page.on("download", (download) => recorded.push(download));
};

/**
 * The next recorded download once the browser has finished writing it: its
 * file name, and its bytes as base64 for the trip back into the page.
 */
const takeDownload: BrowserCommand<
    [timeout?: number],
    { fileName: string; base64: string }
> = async ({ page }, timeout = 5000) => {
    const deadline = Date.now() + timeout;

    for (;;) {
        const download = downloads.get(page)?.shift();
        if (download) {
            const path = await download.path();

            return {
                fileName: download.suggestedFilename(),
                base64: (await readFile(path)).toString("base64"),
            };
        }
        if (Date.now() > deadline) throw new Error("No download started");

        await new Promise((resolve) => setTimeout(resolve, 50));
    }
};

/**
 * A finger drag from one point to another over the element, both relative to
 * its top-left corner. Chromium only: it goes through the DevTools protocol,
 * which Firefox and WebKit do not offer.
 */
const touchDrag: BrowserCommand<
    [selector: string, from: Point, to: Point, steps?: number]
> = async (context, selector, from, to, steps = 8) => {
    const box = await (await context.frame()).locator(selector).boundingBox();
    if (!box) throw new Error(`Nothing to touch at ${selector}`);

    const at = (fraction: number) => ({
        x: box.x + from.x + (to.x - from.x) * fraction,
        y: box.y + from.y + (to.y - from.y) * fraction,
    });

    const session = await context.page.context().newCDPSession(context.page);
    await session.send("Emulation.setTouchEmulationEnabled", {
        enabled: true,
        maxTouchPoints: 1,
    });

    await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [at(0)],
    });
    for (let step = 1; step <= steps; step++) {
        await session.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [at(step / steps)],
        });
    }
    await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
    });

    await session.detach();
};

/**
 * Sets the motion preference the page sees, as the operating system's setting
 * would; "default" goes back to the browser's own. A string, since the first
 * argument of a command must not be null.
 */
const setMotionPreference: BrowserCommand<
    [preference: "reduce" | "no-preference" | "default"]
> = async ({ page }, preference) => {
    await page.emulateMedia({
        reducedMotion: preference === "default" ? null : preference,
    });
};

export const browserCommands = {
    recordDownloads,
    takeDownload,
    touchDrag,
    setMotionPreference,
};
