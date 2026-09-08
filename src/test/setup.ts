/**
 * @file Runs before every test file: installs the jest-dom matchers, the pointer
 * capture stub, and the per-test cleanup. Spies and stubbed globals are undone by
 * `restoreMocks` and `unstubGlobals` in the Vitest config instead.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { installPointerCapture } from "./browserStubs";
import { resetSketchStore } from "./storeHelpers";

installPointerCapture();

afterEach(() => {
    cleanup();
    resetSketchStore();
});
