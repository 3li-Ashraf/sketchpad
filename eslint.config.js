import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Each layer and the layers it must not import. Together: `log` depends on
 * nothing and everything may log, `domain` depends on nothing else, `io` and
 * `state` only on `domain`, `ui` on all three, and `app` composes `ui`
 * without touching browser I/O. None may import `src/test/`. docs/ARCHITECTURE.md
 * explains why; these rules keep it true.
 */
const LAYER_BOUNDARIES = [
    [
        "log",
        ["domain", "io", "state", "ui", "app"],
        "log/ is the bottom layer: every layer may log, so it may import none of them.",
    ],
    [
        "domain",
        ["io", "state", "ui", "app"],
        "domain/ is the core: it may log, and depends on no other layer.",
    ],
    [
        "io",
        ["state", "ui", "app"],
        "io/ is browser I/O over plain data; it may use domain/ and log/ only, so the file formats work without a store.",
    ],
    [
        "state",
        ["io", "ui", "app"],
        "state/ may use domain/ and log/ only; I/O is reached from ui/, so the store never performs it.",
    ],
    ["ui", ["app"], "ui/ is composed by app/, not the other way round."],
    [
        "app",
        ["io"],
        "app/ is the shell; browser I/O belongs behind a ui/ hook.",
    ],
];

// `no-restricted-imports` matches the literal specifier and its globs do not
// cross a leading `..`, so each depth is spelled out. Two levels reach from
// the deepest source folder (src/ui/<surface>/).
const RELATIVE_PREFIXES = ["..", "../.."];

const importsOf = (targets) =>
    targets.flatMap((target) =>
        RELATIVE_PREFIXES.flatMap((prefix) => [
            `${prefix}/${target}`,
            `${prefix}/${target}/*`,
        ])
    );

const boundaryConfig = ([layer, forbidden, message]) => ({
    files: [`src/${layer}/**/*.{ts,tsx}`],
    // Tests cross layers on purpose, for fixtures and stubs in src/test/.
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
        "no-restricted-imports": [
            "error",
            {
                patterns: [
                    { group: importsOf(forbidden), message },
                    {
                        group: importsOf(["test"]),
                        message:
                            "src/test/ holds helpers for tests; the app must not depend on it.",
                    },
                ],
            },
        ],
    },
});

export default defineConfig(
    globalIgnores(["dist", "coverage"]),
    js.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        // Config files outside every tsconfig project.
        files: ["**/*.js"],
        extends: [tseslint.configs.disableTypeChecked],
    },
    {
        files: ["**/*.{ts,tsx}"],
        extends: [reactRefresh.configs.vite],
        languageOptions: { globals: globals.browser },
        plugins: {
            "react-hooks": reactHooks,
            "simple-import-sort": simpleImportSort,
        },
        rules: {
            // The two classic hook rules only; the plugin's preset also turns
            // on the React Compiler rules, which are an opt-in decision.
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",
            "@typescript-eslint/consistent-type-imports": [
                "error",
                { fixStyle: "inline-type-imports" },
            ],
            "@typescript-eslint/switch-exhaustiveness-check": "error",
            // One order everywhere, fixed by `eslint --fix`: packages, then
            // relative paths from the farthest to the nearest.
            "simple-import-sort/imports": "error",
            "simple-import-sort/exports": "error",
        },
    },
    ...LAYER_BOUNDARIES.map(boundaryConfig)
);
