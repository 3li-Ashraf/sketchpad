import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

/**
 * The layers, and what each one is not allowed to reach into. Read together
 * these say: `domain` depends on nothing, `io` and `state` depend only on
 * `domain` and never on each other, `ui` draws on all three, and `app` composes
 * `ui` without touching browser I/O directly.
 *
 * The README describes this arrangement; these rules are what keep it true.
 */
const LAYER_BOUNDARIES = [
  [
    "domain",
    ["io", "state", "ui", "app", "test"],
    "domain/ is the pure core: grid rules, colors, tools, history. It must not depend on any other layer, which is what lets it be reasoned about on its own.",
  ],
  [
    "io",
    ["state", "ui", "app"],
    "io/ is browser I/O over plain data. It may use domain/ and nothing else — in particular it must not read the store, so the save format stays usable without one.",
  ],
  [
    "state",
    ["io", "ui", "app"],
    "state/ holds the store and may use domain/ only. Saving, loading and exporting belong to io/, reached from ui/, so the store never performs I/O.",
  ],
  ["ui", ["app"], "ui/ is composed by app/, not the other way round."],
  [
    "app",
    ["io"],
    "app/ is the shell. Browser I/O belongs behind a ui/ hook (useSketchFiles), not in the shell itself.",
  ],
];

// `no-restricted-imports` matches the literal specifier, and its globs do not
// reliably cross a leading `..` segment, so each depth is spelled out. Two
// levels covers the deepest source file (src/ui/canvas/Canvas.tsx).
const RELATIVE_PREFIXES = ["..", "../.."];

const boundaryConfig = ([layer, forbidden, message]) => ({
  files: [`src/${layer}/**/*.{ts,tsx}`],
  // Tests reach across layers on purpose: they import fixtures and stubs from
  // src/test/, and a decoder test needs the sketches it decodes.
  ignores: ["**/*.test.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: forbidden.flatMap((target) =>
              RELATIVE_PREFIXES.flatMap((prefix) => [
                `${prefix}/${target}`,
                `${prefix}/${target}/*`,
              ]),
            ),
            message,
          },
        ],
      },
    ],
  },
});

export default [
  { ignores: ["dist", "coverage"] },
  js.configs.recommended,
  ...tseslint.configs["flat/recommended"],
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
    },
    plugins: {
      ...reactHooks.configs.flat.recommended.plugins,
      ...reactRefresh.configs.vite.plugins,
    },
    rules: {
      // Only the two classic hook rules are on. The plugin's `flat.recommended`
      // turns on sixteen; the other fourteen are the React Compiler rules
      // (immutability, purity, set-state-in-effect, refs, and so on), which are
      // an opt-in decision rather than something to inherit by spreading the
      // preset.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      ...reactRefresh.configs.vite.rules,
      // The codebase marks type-only imports throughout; this is what keeps a
      // new one from being missed and left in the emitted module graph.
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
    },
  },
  ...LAYER_BOUNDARIES.map(boundaryConfig),
];
