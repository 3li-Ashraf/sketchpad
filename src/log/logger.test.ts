import { describe, expect, it, vi } from "vitest";

import {
    consoleSink,
    createLogger,
    type LogEntry,
    setLogSinks,
} from "./logger";

const collect = () => {
    const entries: LogEntry[] = [];

    return { entries, sink: (entry: LogEntry) => void entries.push(entry) };
};

describe("createLogger", () => {
    it("hands every sink each entry, with its level, source and data", () => {
        const first = collect();
        const second = collect();
        const restore = setLogSinks([first.sink, second.sink]);

        const log = createLogger("files");
        log.warn("file could not be read", { name: "NotFoundError" });
        log.error("save failed");
        restore();

        const expected: LogEntry[] = [
            {
                level: "warn",
                source: "files",
                message: "file could not be read",
                data: { name: "NotFoundError" },
            },
            {
                level: "error",
                source: "files",
                message: "save failed",
                data: undefined,
            },
        ];
        expect(first.entries).toEqual(expected);
        expect(second.entries).toEqual(expected);
    });

    it("keeps logging, and never throws, when a sink does", () => {
        const working = collect();
        const restore = setLogSinks([
            () => {
                throw new Error("sink offline");
            },
            working.sink,
        ]);

        expect(() => createLogger("app").error("uncaught error")).not.toThrow();
        restore();

        expect(working.entries).toHaveLength(1);
    });
});

describe("setLogSinks", () => {
    it("returns a function that puts the previous sinks back", () => {
        const outer = collect();
        const restoreOuter = setLogSinks([outer.sink]);
        const restoreInner = setLogSinks([]);

        createLogger("app").error("dropped");
        restoreInner();
        createLogger("app").error("kept");
        restoreOuter();

        expect(outer.entries.map(({ message }) => message)).toEqual(["kept"]);
    });
});

describe("consoleSink", () => {
    it.each(["warn", "error"] as const)(
        "writes %s entries through the console method of the same level",
        (level) => {
            const write = vi
                .spyOn(console, level)
                .mockImplementation(() => undefined);

            consoleSink({
                level,
                source: "files",
                message: "save failed",
                data: { status: 1 },
            });
            expect(write).toHaveBeenCalledExactlyOnceWith(
                "[sketchpad/files] save failed",
                { status: 1 }
            );
            write.mockRestore();
        }
    );

    it("writes the text alone when an entry has no data", () => {
        const write = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);

        consoleSink({
            level: "error",
            source: "app",
            message: "render crashed",
        });
        expect(write).toHaveBeenCalledExactlyOnceWith(
            "[sketchpad/app] render crashed"
        );
        write.mockRestore();
    });
});
