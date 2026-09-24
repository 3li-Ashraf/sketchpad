/**
 * @file The canvas and `usePaintGestures` under jsdom: what presses and drags
 * paint, and how little of the DOM a stroke touches. Real layout and real
 * pointer input are in `Canvas.browser.test`.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hexToRgb } from "../../domain/color";
import {
    BLANK_CELL_COLOR,
    type CellPosition,
    toCellIndex,
} from "../../domain/grid";
import { traceLine } from "../../domain/line";
import { useSketchStore } from "../../state/sketchStore";
import { fc } from "../../test/property";
import {
    actions,
    canvasColors,
    paintStroke,
    resetSketchStore,
    store,
} from "../../test/storeHelpers";
import { Canvas } from "./Canvas";
import { CanvasCell } from "./CanvasCell";

const GRID_SIZE = 8;
const SURFACE_SIZE = 400;
const CELL_SIZE = SURFACE_SIZE / GRID_SIZE;
const PEN = "#000000";
/** Where the surface sits in the window: off the origin on both axes. */
const LEFT = 30;
const TOP = 20;

/**
 * jsdom performs no layout, so `getBoundingClientRect` returns an all-zero rect
 * and `usePaintGestures` finds no cell in it — without this the pointer tests
 * would silently paint nothing rather than fail. The spy sits on
 * `Element.prototype`, so every element reports the same geometry; the sizes
 * exist only to give the pointer arithmetic something to resolve against.
 */
const stubSurfaceRect = () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
        x: LEFT,
        y: TOP,
        top: TOP,
        left: LEFT,
        right: LEFT + SURFACE_SIZE,
        bottom: TOP + SURFACE_SIZE,
        width: SURFACE_SIZE,
        height: SURFACE_SIZE,
        toJSON: () => ({}),
    });
};

/** The center of a cell, in the client coordinates a pointer event carries. */
const cellPoint = (row: number, column: number) => ({
    clientX: LEFT + column * CELL_SIZE + CELL_SIZE / 2,
    clientY: TOP + row * CELL_SIZE + CELL_SIZE / 2,
});

const surface = () => screen.getByRole("img", { name: /^Canvas/ });

/** The cells, in order: the surface's grandchildren, a row of them apiece. */
const cells = () => Array.from(surface().querySelectorAll(":scope > * > *"));

const colorAt = (index: number) =>
    (cells()[index] as HTMLElement).style.backgroundColor;

const isBlank = () =>
    canvasColors().every((color) => color === BLANK_CELL_COLOR);

const press = (row: number, column: number, button = 0) =>
    fireEvent.pointerDown(surface(), {
        pointerId: 1,
        button,
        ...cellPoint(row, column),
    });

/** A move with the primary button still held, as during a real drag. */
const drag = (row: number, column: number) =>
    fireEvent.pointerMove(surface(), {
        pointerId: 1,
        buttons: 1,
        ...cellPoint(row, column),
    });

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
                structural: records.filter(
                    (record) => record.type === "childList"
                ).length,
            };
        },
    };
};

beforeEach(() => {
    actions().setGridSize(GRID_SIZE);
    stubSurfaceRect();
});

describe("rendering", () => {
    it("presents the surface as one image named with its size", () => {
        render(<Canvas />);

        expect(
            screen.getByRole("img", { name: "Canvas, 8 by 8" })
        ).toBeInTheDocument();
    });

    it("groups the cells into one element per row", () => {
        render(<Canvas />);

        const rows = Array.from(surface().childNodes);

        expect(rows).toHaveLength(GRID_SIZE);
        // Nodes, not elements: a row holds its cells and nothing else.
        rows.forEach((row) => expect(row.childNodes).toHaveLength(GRID_SIZE));
    });

    it("shows the new colors in cells a resize keeps", () => {
        // Cell 0 keeps its element across the resize, so it has to be told
        // its color changed even though the grid is a different length.
        render(<Canvas />);
        act(() => paintStroke(0, 1));

        act(() => actions().setGridSize(4));

        expect(colorAt(0)).toBe("rgb(255, 255, 255)");
        expect(colorAt(1)).toBe("rgb(255, 255, 255)");

        // Growing again: new cells too, which have no element yet to wake.
        act(() => paintStroke(0));
        act(() => actions().setGridSize(GRID_SIZE));

        expect(cells()).toHaveLength(GRID_SIZE ** 2);
        expect(colorAt(0)).toBe("rgb(255, 255, 255)");
    });

    it("keeps every canvas mounted at once up to date", () => {
        render(<Canvas />);
        render(<Canvas />);
        const [first, second] = screen.getAllByRole("img", { name: /^Canvas/ });
        const colorIn = (canvas: HTMLElement) =>
            (canvas.querySelector(":scope > * > *") as HTMLElement).style
                .backgroundColor;

        act(() => paintStroke(0));

        expect([colorIn(first), colorIn(second)]).toEqual([
            "rgb(0, 0, 0)",
            "rgb(0, 0, 0)",
        ]);
    });

    it("lays the surface out as a square grid of the right size", () => {
        render(<Canvas />);

        expect(surface()).toHaveStyle({
            gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
            gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`,
        });
    });

    it("toggles the grid line class on the container", () => {
        render(<Canvas />);

        expect(surface()).toHaveClass("canvas-surface--lined");

        act(() => actions().toggleGridLines());

        expect(surface()).not.toHaveClass("canvas-surface--lined");
    });
});

describe("rendering any sequence of changes", () => {
    type Change =
        | { kind: "paint"; cells: number[] }
        | { kind: "penColor"; color: string }
        | { kind: "fill"; cell: number }
        | { kind: "symmetry"; axis: "topBottom" | "leftRight" }
        | { kind: "clear" | "rotate" | "undo" | "redo" }
        | { kind: "resize"; gridSize: number }
        | { kind: "mount" }
        | { kind: "unmount" };

    const anyChange: fc.Arbitrary<Change> = fc.oneof(
        {
            arbitrary: fc.record({
                kind: fc.constant("paint" as const),
                cells: fc.array(fc.nat(63), { minLength: 1, maxLength: 4 }),
            }),
            weight: 6,
        },
        {
            arbitrary: fc.record({
                kind: fc.constant("penColor" as const),
                color: fc.constantFrom("#000000", "#123456", BLANK_CELL_COLOR),
            }),
            weight: 2,
        },
        {
            arbitrary: fc.record({
                kind: fc.constant("fill" as const),
                cell: fc.nat(63),
            }),
            weight: 2,
        },
        {
            arbitrary: fc.record({
                kind: fc.constant("symmetry" as const),
                axis: fc.constantFrom(
                    "topBottom" as const,
                    "leftRight" as const
                ),
            }),
            weight: 1,
        },
        {
            arbitrary: fc.record({
                kind: fc.constantFrom(
                    "clear" as const,
                    "rotate" as const,
                    "undo" as const,
                    "redo" as const
                ),
            }),
            weight: 4,
        },
        {
            arbitrary: fc.record({
                kind: fc.constant("resize" as const),
                gridSize: fc.integer({ min: 1, max: GRID_SIZE }),
            }),
            weight: 2,
        },
        {
            arbitrary: fc.record({
                kind: fc.constantFrom("mount" as const, "unmount" as const),
            }),
            weight: 1,
        }
    );

    const apply = (
        change: Exclude<Change, { kind: "mount" } | { kind: "unmount" }>,
        cellCount: number
    ) => {
        const edit = actions();
        switch (change.kind) {
            case "paint":
                return paintStroke(...change.cells.map((at) => at % cellCount));
            case "penColor":
                return edit.setPenColor(change.color);
            case "fill":
                return edit.fillFrom(change.cell % cellCount);
            case "symmetry":
                return edit.toggleSymmetry(change.axis);
            case "clear":
                return edit.clearCanvas();
            case "rotate":
                return edit.rotateCanvas();
            case "undo":
                return edit.undo();
            case "redo":
                return edit.redo();
            case "resize":
                return edit.setGridSize(change.gridSize);
        }
    };

    const rgb = (color: string) => `rgb(${hexToRgb(color).join(", ")})`;

    // Each cell wakes only when its own color changes, so a change the
    // shared listener missed would leave a cell showing an old color.
    it(
        "shows the store's color in every cell of every canvas mounted",
        { timeout: 15_000 },
        () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: GRID_SIZE }),
                    fc.array(anyChange, { maxLength: 25 }),
                    (gridSize, changes) => {
                        resetSketchStore();
                        actions().setGridSize(gridSize);
                        const mounted = [render(<Canvas />)];

                        try {
                            for (const change of changes) {
                                if (change.kind === "mount") {
                                    mounted.push(render(<Canvas />));
                                } else if (change.kind === "unmount") {
                                    if (mounted.length > 1)
                                        mounted.pop()!.unmount();
                                } else {
                                    act(() =>
                                        apply(change, canvasColors().length)
                                    );
                                }

                                const expected = canvasColors().map(rgb);
                                for (const canvas of screen.getAllByRole(
                                    "img",
                                    {
                                        name: /^Canvas/,
                                    }
                                )) {
                                    const shown = Array.from(
                                        canvas.querySelectorAll<HTMLElement>(
                                            ":scope > * > *"
                                        ),
                                        (cell) => cell.style.backgroundColor
                                    );
                                    expect(shown).toEqual(expected);
                                }
                            }
                        } finally {
                            for (const canvas of mounted) canvas.unmount();
                        }
                    }
                ),
                { numRuns: 60 }
            );
        }
    );
});

describe("render cost", () => {
    it("lets go of the store once the last canvas unmounts", () => {
        const subscribe = useSketchStore.subscribe;
        let listening = 0;
        vi.spyOn(useSketchStore, "subscribe").mockImplementation((listener) => {
            listening++;
            const stop = subscribe(listener);
            return () => {
                listening--;
                stop();
            };
        });
        const first = render(<Canvas />);
        const second = render(<Canvas />);

        first.unmount();
        expect(listening).toBeGreaterThan(0);
        second.unmount();

        expect(listening).toBe(0);
    });

    it("wakes the cells on screen, with only some of them there", () => {
        // A change to a cell nothing shows has no one to wake.
        const { container } = render(<CanvasCell index={0} />);
        const shown = () =>
            (container.firstElementChild as HTMLElement).style.backgroundColor;

        act(() => paintStroke(1));
        expect(shown()).toBe("rgb(255, 255, 255)");

        act(() => paintStroke(0));
        expect(shown()).toBe("rgb(0, 0, 0)");
    });

    it("subscribes to the store once for all its cells, not once per cell", () => {
        const subscribe = vi.spyOn(useSketchStore, "subscribe");

        render(<Canvas />);

        // The canvas's own few, and one for every cell together.
        expect(subscribe.mock.calls.length).toBeLessThan(GRID_SIZE);
    });

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

        act(() => actions().toggleGridLines());

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
    it("paints the cell under the pointer on press, keeping the press from the browser", () => {
        render(<Canvas />);

        // fireEvent returns false when a handler called preventDefault.
        expect(press(1, 2)).toBe(false);

        expect(canvasColors()[10]).toBe(PEN);
    });

    it("interpolates cells across a fast drag", () => {
        render(<Canvas />);

        press(0, 0);
        drag(0, 4);

        expect(canvasColors().slice(0, 5)).toEqual(Array(5).fill(PEN));
        expect(canvasColors()[5]).toBe(BLANK_CELL_COLOR);
    });

    it("commits a whole drag as one undo step", () => {
        render(<Canvas />);

        press(0, 0);
        drag(0, 3);
        release();

        expect(store().document.undoStack).toHaveLength(1);

        act(() => actions().undo());

        expect(isBlank()).toBe(true);
    });

    it("starts a new segment rather than bridging a gap off-canvas", () => {
        render(<Canvas />);

        press(0, 0);
        fireEvent.pointerMove(surface(), {
            pointerId: 1,
            buttons: 1,
            clientX: SURFACE_SIZE * 2,
            clientY: SURFACE_SIZE * 2,
        });
        drag(7, 7);

        expect(canvasColors()[0]).toBe(PEN);
        expect(canvasColors()[63]).toBe(PEN);
        expect(canvasColors()[9]).toBe(BLANK_CELL_COLOR);
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
        fireEvent.pointerMove(surface(), {
            pointerId: 2,
            buttons: 1,
            ...cellPoint(4, 6),
        });

        expect(canvasColors()[36]).toBe(BLANK_CELL_COLOR);
        expect(canvasColors()[38]).toBe(BLANK_CELL_COLOR);
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

        expect(store().document.undoStack).toHaveLength(1);
        expect(store().document.strokeBaseline).toBeNull();
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
        vi.spyOn(Element.prototype, "setPointerCapture").mockImplementation(
            () => {
                throw new Error("unsupported");
            }
        );

        render(<Canvas />);

        press(0, 0);

        expect(canvasColors()[0]).toBe(PEN);
    });

    it("commits the stroke when the gesture is cancelled", () => {
        render(<Canvas />);

        press(0, 0);
        fireEvent.pointerCancel(window, { pointerId: 1 });

        expect(store().document.undoStack).toHaveLength(1);
    });

    it("suppresses the context menu so a right-drag does not interrupt drawing", () => {
        render(<Canvas />);

        // fireEvent returns false when a handler called preventDefault.
        expect(fireEvent.contextMenu(surface())).toBe(false);
    });

    it("commits the stroke when the canvas goes away mid-drag", () => {
        // As it does when a crash swaps the app for the error screen. Nothing
        // would hear the release, and the open stroke would go on refusing
        // undo, fill, clear and rotate, and holding back the autosave.
        const { unmount } = render(<Canvas />);
        press(0, 0);
        drag(0, 2);

        unmount();

        expect(store().document.strokeBaseline).toBeNull();
        expect(store().document.undoStack).toHaveLength(1);
        act(() => actions().undo());
        expect(isBlank()).toBe(true);
    });

    it("leaves a stroke it did not begin open when it unmounts", () => {
        // As when another canvas is drawing: only its own stroke is this one's
        // to commit.
        const { unmount } = render(<Canvas />);
        act(() => {
            actions().beginStroke();
            actions().paintCells([0]);
        });

        unmount();

        expect(store().document.strokeBaseline).not.toBeNull();
    });

    it("stops hearing releases once unmounted", () => {
        const added = vi.spyOn(window, "addEventListener");
        const removed = vi.spyOn(window, "removeEventListener");
        const { unmount } = render(<Canvas />);

        unmount();

        for (const type of ["pointerup", "pointercancel"]) {
            const listener = added.mock.calls.find(
                ([addedType]) => addedType === type
            )?.[1];
            expect(listener).toBeDefined();
            expect(removed).toHaveBeenCalledWith(type, listener);
        }
    });

    it("ends the stroke, painting nothing, when a move comes with no button held", () => {
        // The release was never delivered, as when the window loses focus
        // mid-drag. Painting on would draw wherever the pointer hovered.
        render(<Canvas />);
        press(0, 0);

        fireEvent.pointerMove(surface(), {
            pointerId: 1,
            buttons: 0,
            ...cellPoint(0, 3),
        });
        drag(0, 5);

        expect(canvasColors().slice(0, 6)).toEqual([
            PEN,
            ...new Array<string>(5).fill(BLANK_CELL_COLOR),
        ]);
        expect(store().document.strokeBaseline).toBeNull();
        expect(store().document.undoStack).toHaveLength(1);
    });

    it("ignores a release from a pointer that is not the one drawing", () => {
        render(<Canvas />);

        press(0, 0);
        fireEvent.pointerUp(window, { pointerId: 99 });

        // Still mid-stroke, so the drag goes on painting and commits as one step.
        drag(0, 2);
        release();

        expect(store().document.undoStack).toHaveLength(1);
        expect(canvasColors().slice(0, 3)).toEqual(Array(3).fill(PEN));
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
        expect(store().document.strokeBaseline).toBeNull();
    });

    it("mirrors a pointer stroke across both axes", () => {
        render(<Canvas />);
        act(() => {
            actions().toggleSymmetry("topBottom");
            actions().toggleSymmetry("leftRight");
        });

        press(0, 0);
        release();

        // The pressed corner and its three reflections, in one undo step.
        expect([0, 7, 56, 63].map((index) => canvasColors()[index])).toEqual(
            Array(4).fill(PEN)
        );
        expect(store().document.undoStack).toHaveLength(1);
        expect(store().document.undoStack[0]).toHaveLength(4);
    });

    it("floods on press when the fill tool is active", () => {
        render(<Canvas />);
        act(() => actions().setTool("fill"));

        press(3, 3);

        expect(canvasColors().every((color) => color === PEN)).toBe(true);
        expect(store().document.undoStack).toHaveLength(1);
    });
});

describe("pointer painting, along any path", () => {
    /**
     * A whole pixel from a cell and a half off the canvas to a cell and a
     * half past it, on either axis, weighted to the pixels either side of
     * each edge. Whole pixels keep the model's arithmetic exact.
     */
    const anyOffset = fc.oneof(
        fc.integer({
            min: -1.5 * CELL_SIZE,
            max: SURFACE_SIZE + 1.5 * CELL_SIZE,
        }),
        fc.constantFrom(
            -1,
            0,
            CELL_SIZE - 1,
            CELL_SIZE,
            SURFACE_SIZE - 1,
            SURFACE_SIZE
        )
    );
    const anyPoint = fc.record({ x: anyOffset, y: anyOffset });

    const cellAt = ({
        x,
        y,
    }: {
        x: number;
        y: number;
    }): CellPosition | null => {
        const row = Math.floor(y / CELL_SIZE);
        const column = Math.floor(x / CELL_SIZE);
        const isOnCanvas =
            row >= 0 && row < GRID_SIZE && column >= 0 && column < GRID_SIZE;

        return isOnCanvas ? { row, column } : null;
    };

    // What the pointer crosses, worked out a second way: each run of samples
    // on the canvas joined up, and nothing across a stretch off it.
    it(
        "paints the cells a drag crosses, joined within each stretch on the canvas",
        { timeout: 15_000 },
        () => {
            // Mounted once: each run starts over on the same canvas, and always
            // releases the pointer, so a failed run leaves no stroke open.
            render(<Canvas />);

            fc.assert(
                fc.property(
                    anyPoint,
                    fc.array(anyPoint, { maxLength: 8 }),
                    (start, moves) => {
                        act(() => actions().startNewSketch());
                        const at = ({ x, y }: { x: number; y: number }) => ({
                            pointerId: 1,
                            clientX: LEFT + x,
                            clientY: TOP + y,
                        });

                        try {
                            const expected = new Set<number>();
                            let last = cellAt(start);
                            const isDrawing = last !== null;
                            if (last)
                                expected.add(toCellIndex(last, GRID_SIZE));

                            fireEvent.pointerDown(surface(), {
                                ...at(start),
                                button: 0,
                            });
                            for (const point of moves) {
                                fireEvent.pointerMove(surface(), {
                                    ...at(point),
                                    buttons: 1,
                                });
                                const cell = isDrawing ? cellAt(point) : null;
                                if (cell && last) {
                                    traceLine(last, cell, (traced) =>
                                        expected.add(
                                            toCellIndex(traced, GRID_SIZE)
                                        )
                                    );
                                } else if (cell) {
                                    expected.add(toCellIndex(cell, GRID_SIZE));
                                }
                                last = cell;
                            }
                            release();

                            const painted = canvasColors().flatMap(
                                (color, index) => (color === PEN ? [index] : [])
                            );
                            expect(painted).toEqual(
                                [...expected].sort((a, b) => a - b)
                            );
                            expect(store().document.undoStack).toHaveLength(
                                expected.size > 0 ? 1 : 0
                            );
                            expect(store().document.strokeBaseline).toBeNull();
                        } finally {
                            release();
                        }
                    }
                ),
                { numRuns: 200 }
            );
        }
    );
});
