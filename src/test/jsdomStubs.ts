/**
 * @file Browser APIs jsdom lacks, stubbed just far enough to observe what the
 * code asks of them. None is a faithful implementation; the browser project
 * runs against the real ones.
 */

import { vi } from "vitest";

/** What the stubbed canvas encodes every image as. */
export const STUB_PNG = new Blob(["stub png"], { type: "image/png" });
// An arbitrary sentinel, not a shape any browser produces.
export const STUB_OBJECT_URL = "blob:sketchpad/1";

interface RecordedDownload {
    fileName: string;
    href: string;
}

export interface DownloadRecording {
    downloads: RecordedDownload[];
    blobs: Blob[];
    revoked: string[];
}

/** Records the anchor click that starts a download, and its object URL. */
export const recordDownloads = (): DownloadRecording => {
    const recording: DownloadRecording = {
        downloads: [],
        blobs: [],
        revoked: [],
    };

    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
        this: HTMLAnchorElement
    ) {
        recording.downloads.push({
            fileName: this.download,
            href: this.getAttribute("href") ?? "",
        });
    });

    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
        recording.blobs.push(blob as Blob);
        return STUB_OBJECT_URL;
    });

    vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => {
        recording.revoked.push(url);
    });

    return recording;
};

interface PutImageDataCall {
    pixels: Uint8ClampedArray;
    width: number;
    height: number;
}

interface DrawImageCall {
    sourceWidth: number;
    sourceHeight: number;
    destinationWidth: number;
    destinationHeight: number;
    smoothing: boolean;
}

interface Canvas2dRecording {
    canvases: HTMLCanvasElement[];
    putImageData: PutImageDataCall[];
    drawImage: DrawImageCall[];
}

class StubImageData {
    constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number
    ) {}
}

interface Canvas2dOptions {
    /**
     * How many contexts to hand out before returning null, standing in for a
     * browser that refuses to allocate a very large canvas. Unlimited by default.
     */
    contextsAvailable?: number;
    /** Whether `toBlob` produces an image, or reports failure with null. */
    encodes?: boolean;
}

/** A 2D context that records the calls the PNG export makes. */
export const stubCanvas2d = ({
    contextsAvailable = Infinity,
    encodes = true,
}: Canvas2dOptions = {}): Canvas2dRecording => {
    const recording: Canvas2dRecording = {
        canvases: [],
        putImageData: [],
        drawImage: [],
    };

    vi.stubGlobal("ImageData", StubImageData);

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
        function (this: HTMLCanvasElement) {
            recording.canvases.push(this);
            if (recording.canvases.length > contextsAvailable) return null;

            const context = {
                canvas: this,
                imageSmoothingEnabled: true,
                putImageData(image: StubImageData) {
                    recording.putImageData.push({
                        pixels: image.data,
                        width: image.width,
                        height: image.height,
                    });
                },
                drawImage(
                    source: HTMLCanvasElement,
                    _x: number,
                    _y: number,
                    width: number,
                    height: number
                ) {
                    recording.drawImage.push({
                        sourceWidth: source.width,
                        sourceHeight: source.height,
                        destinationWidth: width,
                        destinationHeight: height,
                        smoothing: context.imageSmoothingEnabled,
                    });
                },
            };

            return context as unknown as CanvasRenderingContext2D;
        }
    );

    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
        (callback) => callback(encodes ? STUB_PNG : null)
    );

    return recording;
};

/** An environment with no 2D canvas at all. */
export const stubCanvas2dUnavailable = (): void => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
};

/**
 * jsdom lacks `showModal` and `close`. This toggles the `open` attribute and
 * nothing else: no top layer, no inert page, no `cancel` on Escape, which a
 * test dispatches itself when it needs one.
 */
export const installDialog = (): void => {
    Object.assign(HTMLDialogElement.prototype, {
        showModal(this: HTMLDialogElement) {
            this.setAttribute("open", "");
        },
        close(this: HTMLDialogElement) {
            this.removeAttribute("open");
        },
    });
};

/**
 * jsdom has no pointer capture, so every call would throw into the fallback and
 * the capture path would go untested. This is a working in-memory one that
 * tests can spy on or make throw.
 */
export const installPointerCapture = (): void => {
    const captured = new WeakMap<Element, Set<number>>();
    const pointersOf = (element: Element): Set<number> => {
        const pointers = captured.get(element) ?? new Set<number>();
        captured.set(element, pointers);

        return pointers;
    };

    Object.assign(Element.prototype, {
        setPointerCapture(this: Element, pointerId: number) {
            pointersOf(this).add(pointerId);
        },
        releasePointerCapture(this: Element, pointerId: number) {
            pointersOf(this).delete(pointerId);
        },
        hasPointerCapture(this: Element, pointerId: number) {
            return pointersOf(this).has(pointerId);
        },
    });
};
