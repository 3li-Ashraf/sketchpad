import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
    // The app is served from a GitHub Pages project path rather than a domain
    // root, so assets have to be requested under the repository name. Keep this
    // in step with `homepage` in package.json.
    base: "/sketchpad/",
    plugins: [react()],
    build: {
        rollupOptions: {
            output: {
                // React and the icon set are most of the bundle and change only
                // when a dependency is upgraded, while the app around them
                // changes with every deploy. Splitting them apart means a
                // returning visitor re-downloads the app chunk alone: file names
                // are content-hashed, so the vendor chunk's name — and the
                // cached copy of it — stays put across an app-only change.
                //
                // `advancedChunks` rather than a `manualChunks` map: Vite 8
                // bundles with Rolldown, where `manualChunks` accepts only a
                // function and this is the declarative form.
                advancedChunks: {
                    groups: [{ name: "vendor", test: /node_modules/ }],
                },
            },
        },
    },
    test: {
        environment: "jsdom",
        setupFiles: ["./src/test/setup.ts"],
        include: ["src/**/*.test.{ts,tsx}"],
        // Spies and stubbed globals are undone between tests, so no test has to
        // remember to clean up after itself.
        restoreMocks: true,
        unstubGlobals: true,
        coverage: {
            include: ["src/**/*.{ts,tsx}"],
            exclude: [
                "src/**/*.test.{ts,tsx}",
                "src/test/**",
                "src/vite-env.d.ts",
                // The bootstrap: it mounts the app and holds no logic of its own.
                "src/main.tsx",
            ],
        },
    },
});
