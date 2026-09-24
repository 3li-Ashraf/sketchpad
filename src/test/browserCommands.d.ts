/**
 * @file How the browser tests see the commands in `browserCommands.ts`, which
 * run in Node beside Playwright.
 */

export {};

declare module "vitest/browser" {
    interface BrowserCommands {
        recordDownloads: () => Promise<void>;
        takeDownload: (
            timeout?: number
        ) => Promise<{ fileName: string; base64: string }>;
        touchDrag: (
            selector: string,
            from: { x: number; y: number },
            to: { x: number; y: number },
            steps?: number
        ) => Promise<void>;
        setMotionPreference: (
            preference: "reduce" | "no-preference" | "default"
        ) => Promise<void>;
    }
}
