/**
 * @file Covers `ToolbarButton`: its accessible name, pressed state and tooltip.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToolbarButton } from "./ToolbarButton";

const button = () => screen.getByRole("button", { name: "Pen" });

describe("ToolbarButton", () => {
    it("names itself from its label, since the icon carries no text", () => {
        render(
            <ToolbarButton label="Pen" onClick={vi.fn()}>
                <svg />
            </ToolbarButton>
        );

        expect(button()).toBeInTheDocument();
    });

    it("calls its handler when pressed", async () => {
        const onClick = vi.fn();
        render(
            <ToolbarButton label="Pen" onClick={onClick}>
                <svg />
            </ToolbarButton>
        );

        await userEvent.click(button());

        expect(onClick).toHaveBeenCalledOnce();
    });

    it("reports its pressed state to assistive technology and to CSS", () => {
        const { rerender } = render(
            <ToolbarButton label="Pen" isActive onClick={vi.fn()}>
                <svg />
            </ToolbarButton>
        );

        expect(button()).toHaveAttribute("aria-pressed", "true");
        expect(button()).toHaveAttribute("data-active", "true");

        rerender(
            <ToolbarButton label="Pen" isActive={false} onClick={vi.fn()}>
                <svg />
            </ToolbarButton>
        );

        expect(button()).toHaveAttribute("aria-pressed", "false");
    });

    it("is not a toggle when no active state is given", () => {
        render(
            <ToolbarButton label="Pen" onClick={vi.fn()}>
                <svg />
            </ToolbarButton>
        );

        expect(button()).not.toHaveAttribute("aria-pressed");
    });

    it("does not fire while disabled", async () => {
        const onClick = vi.fn();
        render(
            <ToolbarButton label="Pen" isDisabled onClick={onClick}>
                <svg />
            </ToolbarButton>
        );

        expect(button()).toBeDisabled();

        await userEvent.click(button());

        expect(onClick).not.toHaveBeenCalled();
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
