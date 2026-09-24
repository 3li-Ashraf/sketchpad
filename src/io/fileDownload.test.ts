/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    type DownloadRecording,
    recordDownloads,
    STUB_OBJECT_URL,
} from "../test/jsdomStubs";
import { downloadBlob } from "./fileDownload";

let recording: DownloadRecording;

const blob = () =>
    new Blob([Uint8Array.of(1, 2, 3)], { type: "application/octet-stream" });

beforeEach(() => {
    recording = recordDownloads();
});

describe("downloadBlob", () => {
    it("clicks a link to an object URL for the blob, carrying the file name", () => {
        const contents = blob();

        downloadBlob(contents, "sketch.skpd");

        expect(recording.blobs).toEqual([contents]);
        expect(recording.downloads).toEqual([
            { href: STUB_OBJECT_URL, fileName: "sketch.skpd" },
        ]);
    });

    it("revokes the object URL once the download has started", () => {
        downloadBlob(blob(), "sketch.skpd");

        expect(recording.revoked).toEqual([STUB_OBJECT_URL]);
    });

    it("revokes the object URL even when the click throws", () => {
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
            () => {
                throw new Error("blocked");
            }
        );

        expect(() => downloadBlob(blob(), "sketch.skpd")).toThrow("blocked");
        expect(recording.revoked).toEqual([STUB_OBJECT_URL]);
    });

    it("leaves no link behind in the document", () => {
        downloadBlob(blob(), "sketch.skpd");

        expect(document.querySelector("a")).toBeNull();
    });
});
