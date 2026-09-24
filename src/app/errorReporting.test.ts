/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import { expectLogged, takeLogs } from "../test/logCapture";
import {
    installGlobalErrorHandlers,
    reactErrorHandlers,
} from "./errorReporting";

const uncaughtError = (error: Error) =>
    new ErrorEvent("error", {
        error,
        message: error.message,
        filename: "app.js",
        lineno: 12,
        colno: 7,
        cancelable: true,
    });

// jsdom has no PromiseRejectionEvent, so the reason rides on a plain event.
const unhandledRejection = (reason: unknown) =>
    Object.assign(new Event("unhandledrejection", { cancelable: true }), {
        reason,
    });

describe("installGlobalErrorHandlers", () => {
    it("logs an uncaught error with where it was thrown", () => {
        const target = new EventTarget() as Window;
        const uninstall = installGlobalErrorHandlers(target);
        const error = new Error("boom");

        const event = uncaughtError(error);
        target.dispatchEvent(event);
        uninstall();

        expectLogged("error", "app", "uncaught error", {
            error,
            location: "app.js:12:7",
        });
        // Otherwise the browser prints the same error a second time.
        expect(event.defaultPrevented).toBe(true);
    });

    it("logs the message alone when an error carries no object", () => {
        // What a browser reports for an error in a cross-origin script.
        const target = new EventTarget() as Window;
        const uninstall = installGlobalErrorHandlers(target);

        target.dispatchEvent(
            new ErrorEvent("error", {
                message: "Script error.",
                cancelable: true,
            })
        );
        uninstall();

        expectLogged("error", "app", "uncaught error", {
            error: "Script error.",
        });
    });

    it("logs an unhandled rejection with its reason", () => {
        const target = new EventTarget() as Window;
        const uninstall = installGlobalErrorHandlers(target);

        const event = unhandledRejection("network down");
        target.dispatchEvent(event);
        uninstall();

        expectLogged("error", "app", "unhandled promise rejection", {
            reason: "network down",
        });
        expect(event.defaultPrevented).toBe(true);
    });

    it("stops once uninstalled", () => {
        const target = new EventTarget() as Window;
        installGlobalErrorHandlers(target)();

        target.dispatchEvent(uncaughtError(new Error("boom")));
        target.dispatchEvent(unhandledRejection("network down"));

        expect(takeLogs()).toEqual([]);
    });

    it("listens on the window by default", () => {
        const uninstall = installGlobalErrorHandlers();

        window.dispatchEvent(unhandledRejection("network down"));
        uninstall();

        expectLogged("error", "app", "unhandled promise rejection");
    });
});

describe("reactErrorHandlers", () => {
    const error = new Error("render failed");
    const info = { componentStack: "\n    at Canvas" };

    it.each([
        ["onUncaughtError", "error", "render crashed"],
        ["onCaughtError", "error", "render crashed; showing the error screen"],
        ["onRecoverableError", "warn", "render recovered from an error"],
    ] as const)("logs %s with the component stack", (hook, level, message) => {
        reactErrorHandlers[hook](error, info);

        expectLogged(level, "app", message, {
            error,
            componentStack: info.componentStack,
        });
    });
});
