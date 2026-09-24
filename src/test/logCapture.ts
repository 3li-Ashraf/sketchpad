/**
 * @file Every test runs with the logger captured rather than printing, and
 * fails if it logged anything it did not ask for: an entry from the app's
 * logger, or a warning or error written to the console directly, as React
 * does on a real problem.
 */

import { afterEach, beforeEach, expect } from "vitest";

import { type LogEntry, type LogLevel, setLogSinks } from "../log/logger";

let entries: LogEntry[] = [];
let consoleOutput: string[] = [];

const originalWarn = console.warn;
const originalError = console.error;

const recordConsole =
    (method: string) =>
    (...args: unknown[]) => {
        consoleOutput.push(`console.${method}: ${args.map(String).join(" ")}`);
    };

/** Installed once, from `setup`. */
export const watchLogs = (): void => {
    let restoreSinks = () => {};

    beforeEach(() => {
        entries = [];
        consoleOutput = [];
        restoreSinks = setLogSinks([(entry) => void entries.push(entry)]);
        console.warn = recordConsole("warn");
        console.error = recordConsole("error");
    });

    afterEach(() => {
        restoreSinks();
        console.warn = originalWarn;
        console.error = originalError;

        const unexpected = [
            ...entries.map(
                ({ level, source, message }) => `${level} ${source}: ${message}`
            ),
            ...consoleOutput,
        ];
        entries = [];
        consoleOutput = [];

        if (unexpected.length > 0) {
            throw new Error(`Unexpected log output:\n${unexpected.join("\n")}`);
        }
    });
};

/** Everything logged since the last check, which counts as expected. */
export const takeLogs = (): LogEntry[] => {
    const logged = entries;
    entries = [];

    return logged;
};

/**
 * Asserts exactly one entry since the last check, as described; `data`, when
 * given, has to be part of the entry's data.
 */
export const expectLogged = (
    level: LogLevel,
    source: string,
    message: string,
    data?: Record<string, unknown>
): void => {
    const logged = takeLogs();

    expect(logged).toEqual([
        expect.objectContaining({ level, source, message }),
    ]);
    if (data) expect(logged[0].data).toEqual(expect.objectContaining(data));
};

/** Asserts that exactly one value was refused since the last check, by `where`. */
export const expectInvalidInput = (where: string): void =>
    expectLogged("error", "validation", "invalid input refused", { where });
