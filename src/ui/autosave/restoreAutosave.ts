/**
 * @file Opening: puts back the workspace an earlier visit autosaved, and
 * reports what it learned of the device, which `useAutosave` goes on from.
 */

import type { Workspace } from "../../domain/workspace";
import { readAutosave } from "../../io/autosave";
import { createLogger } from "../../log/logger";
import { useSketchStore } from "../../state/sketchStore";

const log = createLogger("autosave");

/** How long opening waits for storage before starting without it. */
export const RESTORE_TIMEOUT = 2000;

export const RESTORE_DIALOG_TITLE = "Restore your saved drawing?";

export const RESTORE_WARNING =
    "Sketchpad has just found the drawing saved on this device, and you've drawn since the page opened. Restoring it replaces what you've drawn; keeping yours erases the saved one. This can't be undone.";

/**
 * What the page knows of the workspace saved on the device. `restoreAutosave`
 * makes one per page and `useAutosave` keeps it up to date. It lives outside
 * React so that it outlasts the app being mounted afresh after a crash.
 */
export interface Restored {
    /**
     * Whether the page has seen what the device holds: it restored it, found
     * nothing this version can use, or was told by the user to write over it.
     * Until then a write could erase a drawing the page never showed.
     */
    isKnown: boolean;
    /** The read opening stopped waiting for, until it has been taken up. */
    answer: Promise<Workspace | null> | null;
}

/** For an app mounted without `restoreAutosave`, as tests do. */
export const RESTORE_SKIPPED: Restored = { isKnown: true, answer: null };

/**
 * Puts back the workspace an earlier visit saved. It never rejects: with
 * nothing saved, a record it cannot use, or storage that does not answer in
 * time, the page opens blank, as it would have without autosave. What it
 * learned is handed on to `useAutosave`.
 */
export const restoreAutosave = async (): Promise<Restored> => {
    const reading = readAutosave();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let isLate = false;

    let workspace: Workspace | null;
    try {
        workspace = await Promise.race([
            reading,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                    isLate = true;
                    reject(new Error(`No answer in ${RESTORE_TIMEOUT} ms`));
                }, RESTORE_TIMEOUT);
            }),
        ]);
    } catch (error) {
        log.warn("autosave could not be read", { error });
        // A read that is late may still answer; one that failed will not.
        return { isKnown: false, answer: isLate ? reading : null };
    } finally {
        clearTimeout(timer);
    }

    if (workspace)
        useSketchStore.getState().actions.restoreWorkspace(workspace);

    return { isKnown: true, answer: null };
};
