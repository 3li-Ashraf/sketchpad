/**
 * @file Runs before every test file in every project: each test starts from
 * the store's initial state, and fails if it logs anything it did not expect.
 */

import { afterEach } from "vitest";

import { watchLogs } from "./logCapture";
import { resetSketchStore } from "./storeHelpers";

afterEach(resetSketchStore);
watchLogs();
