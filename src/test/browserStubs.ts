/**
 * @file Browser APIs jsdom does not implement, stubbed just far enough to observe
 * what the code asks of them. They live in one place so the download, canvas and
 * gesture tests agree on how those APIs behave; none of them tries to be a
 * faithful implementation.
 */

import { vi } from "vitest";

export const STUB_PNG_DATA_URL = "data:image/png;base64,STUB";
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

/**
 * Intercepts the anchor click that starts a download, and the object-URL pair
 * around it, so a download can be asserted on without the browser performing one.
 */
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
}

/**
 * A 2D context that records the calls the PNG export makes, and an `ImageData` to
 * go with it. jsdom implements neither without the native `canvas` package.
 */
export const stubCanvas2d = ({
    contextsAvailable = Infinity,
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

    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
        STUB_PNG_DATA_URL
    );

    return recording;
};

/**
 * Stands in for an environment with no 2D canvas at all, such as a server
 * renderer.
 */
export const stubCanvas2dUnavailable = (): void => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
};

/**
 * jsdom implements no pointer capture at all, so every call throws and the
 * production fallback swallows it — which would mean the capture path was never
 * exercised. A real browser captures, so the suite installs a working in-memory
 * implementation once and lets individual tests spy on it or make it throw.
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
