/**
 * @file Routing every error nothing else handled to the logger: render errors
 * through React's root hooks, and anything else through the window's `error`
 * and `unhandledrejection` events.
 */

import type { RootOptions } from "react-dom/client";

import { createLogger } from "../log/logger";

const log = createLogger("app");

type ReactErrorHandlers = Required<
    Pick<
        RootOptions,
        "onUncaughtError" | "onCaughtError" | "onRecoverableError"
    >
>;

/**
 * Passed to `createRoot`. Providing them also replaces React's own console
 * reports, so each error is logged once, by the logger.
 */
export const reactErrorHandlers: ReactErrorHandlers = {
    onUncaughtError: (error, { componentStack }) =>
        log.error("render crashed", { error, componentStack }),
    onCaughtError: (error, { componentStack }) =>
        log.error("render crashed; showing the error screen", {
            error,
            componentStack,
        }),
    onRecoverableError: (error, { componentStack }) =>
        log.warn("render recovered from an error", { error, componentStack }),
};

/**
 * Logs uncaught errors and unhandled rejections, and returns a function that
 * stops. Each event's default is prevented because the browser would
 * otherwise print the same error to the console a second time.
 */
export const installGlobalErrorHandlers = (
    target: Pick<Window, "addEventListener" | "removeEventListener"> = window
): (() => void) => {
    const handleError = (event: ErrorEvent) => {
        event.preventDefault();
        log.error("uncaught error", {
            error: event.error ?? event.message,
            location: `${event.filename}:${event.lineno}:${event.colno}`,
        });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
        event.preventDefault();
        log.error("unhandled promise rejection", { reason: event.reason });
    };

    target.addEventListener("error", handleError);
    target.addEventListener("unhandledrejection", handleRejection);

    return () => {
        target.removeEventListener("error", handleError);
        target.removeEventListener("unhandledrejection", handleRejection);
    };
};
