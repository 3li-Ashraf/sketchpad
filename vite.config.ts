import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

import { browserCommands } from "./browserCommands.ts";

/** The three engines behind every major browser. */
const ENGINES = ["chromium", "firefox", "webkit"] as const;

/**
 * The engines the browser tests run in: all three, unless `TEST_BROWSERS`
 * (from the environment or an untracked `.env.local`) names fewer, for a
 * machine where one of them cannot run.
 */
const testedEngines = (mode: string) => {
    const wanted = loadEnv(mode, process.cwd(), "TEST_").TEST_BROWSERS;

    return wanted
        ? ENGINES.filter((engine) => wanted.split(",").includes(engine))
        : ENGINES;
};

export default defineConfig(({ mode }) => ({
    // Served from a GitHub Pages project path, not a domain root. Keep in step
    // with `homepage` in package.json.
    base: "/sketchpad/",
    plugins: [react(), tailwindcss()],
    build: {
        rollupOptions: {
            output: {
                // React and the icons change only on a dependency upgrade, so
                // splitting them out lets a returning visitor keep the cached
                // vendor chunk across app-only deploys. `codeSplitting` is
                // Rolldown's declarative replacement for `manualChunks`.
                codeSplitting: {
                    groups: [{ name: "vendor", test: /node_modules/ }],
                },
            },
        },
    },
    test: {
        restoreMocks: true,
        unstubGlobals: true,
        projects: [
            {
                // Plain modules in Node: fast, and proof they need no DOM. A
                // file that does opts in with `@vitest-environment jsdom`.
                extends: true,
                test: {
                    name: "unit",
                    environment: "node",
                    include: ["src/**/*.test.ts"],
                    exclude: ["src/**/*.browser.test.ts"],
                    setupFiles: ["./src/test/setup.ts"],
                },
            },
            {
                extends: true,
                test: {
                    name: "dom",
                    environment: "jsdom",
                    include: ["src/**/*.test.tsx"],
                    exclude: ["src/**/*.browser.test.tsx"],
                    setupFiles: [
                        "./src/test/setup.ts",
                        "./src/test/setupDom.ts",
                        "./src/test/setupJsdom.ts",
                    ],
                },
            },
            {
                // What jsdom cannot show: real image decoding, the browser's
                // own compression, the top layer and focus, and layout.
                extends: true,
                test: {
                    name: "browser",
                    include: ["src/**/*.browser.test.{ts,tsx}"],
                    setupFiles: [
                        "./src/test/setup.ts",
                        "./src/test/setupDom.ts",
                    ],
                    browser: {
                        enabled: true,
                        provider: playwright(),
                        headless: true,
                        instances: testedEngines(mode).map((browser) => ({
                            browser,
                        })),
                        commands: browserCommands,
                    },
                },
            },
        ],
        coverage: {
            include: ["src/**/*.{ts,tsx}"],
            exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/main.tsx"],
            // All of it, which the suite reaches, so a change that leaves
            // new code untested fails `npm run check`.
            thresholds: {
                lines: 100,
                functions: 100,
                statements: 100,
                branches: 100,
            },
        },
    },
}));
