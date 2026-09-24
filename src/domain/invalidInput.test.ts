import { describe, it } from "vitest";

import { expectLogged } from "../test/logCapture";
import { reportInvalidInput } from "./invalidInput";

describe("reportInvalidInput", () => {
    it("logs the refused value as an error, saying where and why", () => {
        reportInvalidInput("paintCells", "not cells", [1.5]);

        expectLogged("error", "validation", "invalid input refused", {
            where: "paintCells",
            problem: "not cells",
            value: [1.5],
        });
    });
});
