/**
 * @file The harness itself: an unexpected log fails a test, and an expected
 * one has to be the one that was asked for.
 */

import { describe, expect, it } from "vitest";

import { reportInvalidInput } from "../domain/invalidInput";
import { createLogger } from "../log/logger";
import { expectInvalidInput, expectLogged } from "./logCapture";

describe("the log watcher", () => {
    it.fails("fails a test that logs an entry it did not expect", () => {
        createLogger("app").error("uncaught error");
    });

    it.fails("fails a test that writes to the console directly", () => {
        console.error("an error nobody expected");
    });

    it("lets a test that expects its entry pass", () => {
        createLogger("files").warn("file could not be read");

        expectLogged("warn", "files", "file could not be read");
    });

    it("rejects an expected entry that never came", () => {
        expect(() => expectInvalidInput("fillFrom")).toThrow();
    });

    it("rejects an entry from a different function", () => {
        reportInvalidInput("paintCells", "not cells", [99]);

        expect(() => expectInvalidInput("fillFrom")).toThrow();
    });
});
