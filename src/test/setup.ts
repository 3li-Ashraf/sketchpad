/**
 * @file Runs before every test file: installs the jest-dom matchers, the pointer
 * capture and dialog stubs, and the per-test cleanup. Spies and stubbed globals
 * are undone by `restoreMocks` and `unstubGlobals` in the Vitest config instead.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { installDialog, installPointerCapture } from "./browserStubs";
import { resetSketchStore } from "./storeHelpers";

installPointerCapture();
installDialog();

afterEach(() => {
    cleanup();
    resetSketchStore();
});
