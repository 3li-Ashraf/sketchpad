/** @file Handing a blob to the browser as a file download. */

/**
 * Downloads through a detached link and an object URL. The URL is revoked as
 * soon as `click()` returns: the browser resolves a blob URL when the link is
 * followed, so the download already holds the blob. `finally` keeps a click
 * that throws from leaking the URL, which would pin the blob in memory.
 */
export const downloadBlob = (blob: Blob, fileName: string): void => {
    const url = URL.createObjectURL(blob);

    try {
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.click();
    } finally {
        URL.revokeObjectURL(url);
    }
};
