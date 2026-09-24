/**
 * @file What the file dialogs say. The dialog tests compare against these
 * same messages, so it is here that each is checked to say something: which
 * file, what went wrong, and what can be done.
 */

import { describe, expect, it } from "vitest";

import type { SketchReadFailure } from "../../io/sketchFile";
import { LOAD_FAILED, replaceQuestion } from "./fileMessages";

const REASONS = Object.keys(LOAD_FAILED) as SketchReadFailure[];

describe("the messages for a file that could not be opened", () => {
    it.each(REASONS)(
        "name the %s file, and offer to choose another",
        (reason) => {
            const copy = LOAD_FAILED[reason]("cat.skpd");

            expect(copy.title).not.toBe("");
            expect(copy.message).toContain("cat.skpd");
            expect(copy.dismissLabel).toBe("Close");
            expect(copy.actionLabel).toBe("Choose another file");
        }
    );

    it("tell each failure apart by its title and its explanation", () => {
        const copies = REASONS.map((reason) => LOAD_FAILED[reason]("cat.skpd"));

        expect(new Set(copies.map(({ title }) => title)).size).toBe(4);
        expect(new Set(copies.map(({ message }) => message)).size).toBe(4);
    });
});

describe("the question before a file replaces the drawing", () => {
    it("names the file, and the size of the sketch it holds", () => {
        const question = replaceQuestion("cat.skpd", {
            gridSize: 4,
            colors: [],
        });

        expect(question.title).toBe("Open cat.skpd?");
        expect(question.message).toContain("4 × 4");
        expect(question.confirmLabel).toBe("Replace drawing");
    });
});
