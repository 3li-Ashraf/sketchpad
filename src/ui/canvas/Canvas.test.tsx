/**
 * @file Covers `Canvas` together with `usePaintGestures`: what a press and drag
 * paint, and what the DOM does while they do it.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BLANK_CELL_COLOR } from "../../domain/grid";
import { paintStroke, store } from "../../test/storeHelpers";
import { Canvas } from "./Canvas";

const GRID_SIZE = 8;
const SURFACE_SIZE = 400;
const CELL_SIZE = SURFACE_SIZE / GRID_SIZE;
const PEN = "#000000";

/**
 * jsdom performs no layout, so `getBoundingClientRect` returns an all-zero rect
 * and `usePaintGestures` bails out on it — without this the pointer tests would
 * silently paint nothing rather than fail. The spy sits on `Element.prototype`,
 * so every element reports the same geometry; `SURFACE_SIZE` and `CELL_SIZE`
 * exist only to give the pointer arithmetic something to resolve against.
 */
const stubSurfaceRect = () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: SURFACE_SIZE,
        bottom: SURFACE_SIZE,
        width: SURFACE_SIZE,
        height: SURFACE_SIZE,
        toJSON: () => ({}),
    });
};

/** The center of a cell, in the client coordinates a pointer event carries. */
const cellPoint = (row: number, column: number) => ({
    clientX: column * CELL_SIZE + CELL_SIZE / 2,
    clientY: row * CELL_SIZE + CELL_SIZE / 2,
});

const surface = () => screen.getByTestId("canvas-surface");

const cells = () => Array.from(surface().children);

const colorAt = (index: number) =>
    (cells()[index] as HTMLElement).style.backgroundColor;

const isBlank = () =>
    store().colors.every((color) => color === BLANK_CELL_COLOR);

const press = (row: number, column: number, button = 0) =>
    fireEvent.pointerDown(surface(), {
        pointerId: 1,
        button,
        ...cellPoint(row, column),
    });

const drag = (row: number, column: number) =>
    fireEvent.pointerMove(surface(), { pointerId: 1, ...cellPoint(row, column) });

const release = () => fireEvent.pointerUp(window, { pointerId: 1 });

/**
 * Watches what the DOM actually does to the cells, which is where the cost of a
 * stroke lands: which cells are written to, and whether any are recreated rather
 * than updated in place. Filtering to `style` is what makes the grid-line case
 * meaningful — toggling those changes a class on the surface, and the stylesheet
 * reaches the cells through a descendant rule, so a cell-level filter should see
 * nothing at all.
 */
const observeCells = (target: Element) => {
    const observer = new MutationObserver(() => {});
    observer.observe(target, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["style"],
    });

    return {
        take: () => {
            const records = observer.takeRecords();
            observer.disconnect();

            return {
                styled: new Set(
                    records
                        .filter((record) => record.type === "attributes")
                        .map((record) => record.target)
                ),
                structural: records.filter((record) => record.type === "childList")
                    .length,
            };
        },
    };
};

beforeEach(() => {
    store().setGridSize(GRID_SIZE);
    stubSurfaceRect();
});

describe("rendering", () => {
    it("renders one element per grid cell", () => {
        render(<Canvas />);

        expect(cells()).toHaveLength(GRID_SIZE * GRID_SIZE);
    });

    it("rebuilds the cells when the grid size changes", () => {
        render(<Canvas />);

        act(() => store().setGridSize(4));

        expect(cells()).toHaveLength(16);
    });

    it("lays the surface out as a square grid of the right size", () => {
        render(<Canvas />);

        expect(surface()).toHaveStyle({
            gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
            gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`,
        });
    });

    it("shows the color the store holds for each cell", () => {
        render(<Canvas />);

        act(() => paintStroke(3));

        expect(colorAt(3)).toBe("rgb(0, 0, 0)");
        expect(colorAt(4)).toBe("rgb(255, 255, 255)");
    });

    it("toggles the grid line class on the container", () => {
        render(<Canvas />);

        expect(surface()).toHaveClass("canvas-surface--lined");

        act(() => store().toggleGridLines());

        expect(surface()).not.toHaveClass("canvas-surface--lined");
    });
});

describe("render cost", () => {
    it("updates the painted cells in place without rebuilding the grid", () => {
        render(<Canvas />);
        const observer = observeCells(surface());

        act(() => paintStroke(10, 11));

        const { styled, structural } = observer.take();

        // The 2 also depends on both mirror axes defaulting to off; with one on,
        // a single painted cell would legitimately write up to four elements.
        expect(styled.size).toBe(2);
        expect(structural).toBe(0);
    });

    it("keeps grid lines off the cells so toggling them touches none", () => {
        render(<Canvas />);
        const observer = observeCells(surface());

        act(() => store().toggleGridLines());

        const { styled, structural } = observer.take();

        expect(styled.size).toBe(0);
        expect(structural).toBe(0);
    });

    it("touches no cell when a drag repaints the color already there", () => {
        render(<Canvas />);
        press(1, 1);
        const observer = observeCells(surface());

        drag(1, 1);

        expect(observer.take().styled.size).toBe(0);
    });
});

describe("pointer painting", () => {
    it("paints the cell under the pointer on press", () => {
        render(<Canvas />);

        press(1, 2);

        expect(store().colors[10]).toBe(PEN);
    });

    it("interpolates cells across a fast drag", () => {
        render(<Canvas />);

        press(0, 0);
        drag(0, 4);

        expect(store().colors.slice(0, 5)).toEqual(Array(5).fill(PEN));
        expect(store().colors[5]).toBe(BLANK_CELL_COLOR);
    });

    it("commits a whole drag as one undo step", () => {
        render(<Canvas />);

        press(0, 0);
        drag(0, 3);
        release();

        expect(store().undoStack).toHaveLength(1);

        act(() => store().undo());

        expect(isBlank()).toBe(true);
    });

    it("starts a new segment rather than bridging a gap off-canvas", () => {
        render(<Canvas />);

        press(0, 0);
        fireEvent.pointerMove(surface(), {
            pointerId: 1,
            clientX: SURFACE_SIZE * 2,
            clientY: SURFACE_SIZE * 2,
        });
        drag(7, 7);

        expect(store().colors[0]).toBe(PEN);
        expect(store().colors[63]).toBe(PEN);
        expect(store().colors[9]).toBe(BLANK_CELL_COLOR);
    });

    it("ignores pointer movement that never started on the canvas", () => {
        render(<Canvas />);

        drag(2, 2);

        expect(isBlank()).toBe(true);
    });

    it("ignores a second pointer while a stroke is in progress", () => {
        render(<Canvas />);

        press(0, 0);
        fireEvent.pointerDown(surface(), {
            pointerId: 2,
            button: 0,
            ...cellPoint(4, 4),
        });

        expect(store().colors[36]).toBe(BLANK_CELL_COLOR);
    });

    it("ignores non-primary buttons", () => {
        render(<Canvas />);

        press(1, 1, 2);

        expect(isBlank()).toBe(true);
    });

    it("commits the stroke when the pointer is released off-canvas", () => {
        render(<Canvas />);

        press(0, 0);
        release();

        expect(store().undoStack).toHaveLength(1);
        expect(store().strokeBaseline).toBeNull();
    });

    it("captures the pointer for the stroke and releases it at the end", () => {
        const capture = vi
            .spyOn(Element.prototype, "setPointerCapture")
            .mockImplementation(() => {});
        const release = vi
            .spyOn(Element.prototype, "releasePointerCapture")
            .mockImplementation(() => {});
        vi.spyOn(Element.prototype, "hasPointerCapture").mockReturnValue(true);

        render(<Canvas />);

        press(0, 0);
        expect(capture).toHaveBeenCalledWith(1);

        fireEvent.pointerUp(window, { pointerId: 1 });
        expect(release).toHaveBeenCalledWith(1);
    });

    it("draws even where pointer capture is unavailable", () => {
        vi.spyOn(Element.prototype, "setPointerCapture").mockImplementation(() => {
            throw new Error("unsupported");
        });

        render(<Canvas />);

        press(0, 0);

        expect(store().colors[0]).toBe(PEN);
    });

    it("commits the stroke when the gesture is cancelled", () => {
        render(<Canvas />);

        press(0, 0);
        fireEvent.pointerCancel(window, { pointerId: 1 });

        expect(store().undoStack).toHaveLength(1);
    });

    it("suppresses the context menu so a right-drag does not interrupt drawing", () => {
        render(<Canvas />);

        // fireEvent returns false when a handler called preventDefault.
        expect(fireEvent.contextMenu(surface())).toBe(false);
    });

    it("ignores a release from a pointer that is not the one drawing", () => {
        render(<Canvas />);

        press(0, 0);
        fireEvent.pointerUp(window, { pointerId: 99 });

        // Still mid-stroke, so the drag goes on painting and commits as one step.
        drag(0, 2);
        release();

        expect(store().undoStack).toHaveLength(1);
        expect(store().colors.slice(0, 3)).toEqual(Array(3).fill(PEN));
    });

    it("paints nothing while the surface has no size yet", () => {
        // The rect is all zeroes before the first layout, and dividing by it
        // would put the pointer in cell NaN. This is also jsdom's default, which
        // is why every other pointer test has to stub the rect.
        vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: 0,
            height: 0,
            toJSON: () => ({}),
        });
        render(<Canvas />);

        press(1, 1);

        expect(isBlank()).toBe(true);
        expect(store().strokeBaseline).toBeNull();
    });

    it("mirrors a pointer stroke across both axes", () => {
        render(<Canvas />);
        act(() => {
            store().toggleMirrorX();
            store().toggleMirrorY();
        });

        press(0, 0);
        release();

        // The pressed corner and its three reflections, in one undo step.
        expect([0, 7, 56, 63].map((index) => store().colors[index])).toEqual(
            Array(4).fill(PEN)
        );
        expect(store().undoStack).toHaveLength(1);
        expect(store().undoStack[0]).toHaveLength(4);
    });

    it("floods on press when the fill tool is active", () => {
        render(<Canvas />);
        act(() => store().setTool("fill"));

        press(3, 3);

        expect(store().colors.every((color) => color === PEN)).toBe(true);
        expect(store().undoStack).toHaveLength(1);
    });
});
