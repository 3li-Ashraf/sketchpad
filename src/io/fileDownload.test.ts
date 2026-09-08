/**
 * @file Covers `io/fileDownload`. jsdom performs no navigation, so the anchor
 * click and the object-URL pair are intercepted by `recordDownloads` and the
 * assertions are about what the browser was asked to do.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    recordDownloads,
    STUB_OBJECT_URL,
    type DownloadRecording,
} from "../test/browserStubs";
import { downloadBlob, downloadUrl } from "./fileDownload";

let recording: DownloadRecording;

beforeEach(() => {
    recording = recordDownloads();
});

describe("downloadUrl", () => {
    it("clicks a link carrying the URL and file name", () => {
        downloadUrl("data:image/png;base64,AAAA", "sketch.png");

        expect(recording.downloads).toEqual([
            { href: "data:image/png;base64,AAAA", fileName: "sketch.png" },
        ]);
    });

    it("never attaches the link to the document", () => {
        downloadUrl("data:text/plain,hi", "note.txt");

        expect(document.querySelectorAll("a")).toHaveLength(0);
    });
});

describe("downloadBlob", () => {
    const blob = () =>
        new Blob([Uint8Array.of(1, 2, 3)], { type: "application/octet-stream" });

    it("downloads the blob through an object URL", () => {
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
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
            throw new Error("blocked");
        });

        expect(() => downloadBlob(blob(), "sketch.skpd")).toThrow("blocked");
        expect(recording.revoked).toEqual([STUB_OBJECT_URL]);
    });
});
