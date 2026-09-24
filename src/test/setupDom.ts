/**
 * @file Runs before component tests, under jsdom or in a real browser: the
 * jest-dom matchers, and unmounting whatever a test rendered. Hooks run in
 * reverse order, so this unmounts before `setup` resets the store.
 */

import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);
