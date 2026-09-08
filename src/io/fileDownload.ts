/**
 * @file Handing a URL or a blob to the browser as a file download. It does not
 * know what is being downloaded.
 */

/**
 * Starts a download from a URL. The anchor is never attached to the document —
 * a detached `click()` is enough — so there is nothing to clean up afterwards.
 */
export const downloadUrl = (url: string, fileName: string): void => {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
};

/**
 * Wraps `downloadUrl` in an object URL.
 *
 * Revoking immediately after `click()` returns does not cancel the download: the
 * browser has already taken the blob by then, so no timeout or unload handler is
 * needed. The `finally` makes it unconditional, because a click that throws
 * would otherwise leak a URL, and a leaked one keeps its blob alive for the life
 * of the document.
 */
export const downloadBlob = (blob: Blob, fileName: string): void => {
    const url = URL.createObjectURL(blob);

    try {
        downloadUrl(url, fileName);
    } finally {
        URL.revokeObjectURL(url);
    }
};
