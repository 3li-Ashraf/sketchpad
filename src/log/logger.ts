/**
 * @file The app's logger: warnings and errors, each from a named source, as a
 * constant message plus structured data, so entries can be searched and
 * grouped rather than parsed.
 *
 * Entries go to sinks. The default one writes to the browser console, the only
 * destination: nothing leaves the device. A new destination is a new sink,
 * with no change to any code that logs. Never log the user's data, such as
 * file names or drawing contents; log what happened and why.
 */

export type LogLevel = "warn" | "error";

export interface LogEntry {
    level: LogLevel;
    /** Where it came from, such as "files" or "validation". */
    source: string;
    /** What happened: a constant, with the particulars in `data`. */
    message: string;
    data?: Record<string, unknown>;
}

export type LogSink = (entry: LogEntry) => void;

export interface Logger {
    warn: (message: string, data?: Record<string, unknown>) => void;
    error: (message: string, data?: Record<string, unknown>) => void;
}

/**
 * Writes through `console.warn` and `console.error`, so the browser's own level
 * filter applies, behind a `[sketchpad/source]` prefix to filter on.
 */
export const consoleSink: LogSink = ({ level, source, message, data }) => {
    const text = `[sketchpad/${source}] ${message}`;

    if (data === undefined) console[level](text);
    else console[level](text, data);
};

let sinks: readonly LogSink[] = [consoleSink];

/**
 * Replaces the sinks, and returns a function that puts the previous ones
 * back. Tests use it to capture entries; a remote destination would use it to
 * join the console.
 */
export const setLogSinks = (next: readonly LogSink[]): (() => void) => {
    const previous = sinks;
    sinks = next;

    return () => {
        sinks = previous;
    };
};

const emit = (entry: LogEntry): void => {
    for (const sink of sinks) {
        try {
            sink(entry);
        } catch {
            // A broken destination must not break the app, nor the others.
        }
    }
};

export const createLogger = (source: string): Logger => ({
    warn: (message, data) => emit({ level: "warn", source, message, data }),
    error: (message, data) => emit({ level: "error", source, message, data }),
});
