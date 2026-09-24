/**
 * @file What the toolbar suite cannot see through the real panel: a button
 * that is not a toggle says so, and a disabled one still shows its tooltip.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ToolbarButton } from "./ToolbarButton";

const button = () => screen.getByRole("button", { name: "Pen" });

describe("ToolbarButton", () => {
    it("is not a toggle when no active state is given", () => {
        render(
            <ToolbarButton label="Pen" onClick={vi.fn()}>
                <svg />
            </ToolbarButton>
        );

        expect(button()).not.toHaveAttribute("aria-pressed");
    });

    it("hangs the tooltip on the wrapper, which a disabled button cannot host", () => {
        render(
            <ToolbarButton label="Pen" isDisabled onClick={vi.fn()}>
                <svg />
            </ToolbarButton>
        );

        const tooltip = button().closest(".tooltip");

        expect(tooltip).toHaveAttribute("data-tooltip", "Pen");
    });
});
