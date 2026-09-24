import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { expectLogged } from "../test/logCapture";
import { button } from "../test/queries";
import { ErrorBoundary } from "./ErrorBoundary";
import { reactErrorHandlers } from "./errorReporting";

/** Throws while `broken.now` is set, as a component with a bug would. */
const broken = { now: true };

const Fragile: React.FC = () => {
    if (broken.now) throw new Error("render failed");

    return <p>Drawing</p>;
};

// The root's own handler, as main.tsx installs it, so the test sees exactly
// what the app logs.
const renderGuarded = () =>
    render(
        <ErrorBoundary>
            <Fragile />
        </ErrorBoundary>,
        { onCaughtError: reactErrorHandlers.onCaughtError }
    );

describe("ErrorBoundary", () => {
    it("renders its children while they render", () => {
        broken.now = false;
        renderGuarded();

        expect(screen.getByText("Drawing")).toBeInTheDocument();
    });

    it("shows the error screen instead of a blank page, and logs the crash", () => {
        broken.now = true;
        renderGuarded();

        expect(screen.getByRole("alert")).toHaveTextContent(
            "Something went wrong"
        );
        expect(button("Try again")).toBeInTheDocument();
        expectLogged(
            "error",
            "app",
            "render crashed; showing the error screen",
            {
                error: expect.objectContaining({ message: "render failed" }),
                componentStack: expect.stringContaining("Fragile"),
            }
        );
    });

    it("renders the children afresh on Try again", async () => {
        broken.now = true;
        renderGuarded();
        expectLogged(
            "error",
            "app",
            "render crashed; showing the error screen"
        );

        broken.now = false;
        await userEvent.click(button("Try again"));

        expect(screen.getByText("Drawing")).toBeInTheDocument();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
});
