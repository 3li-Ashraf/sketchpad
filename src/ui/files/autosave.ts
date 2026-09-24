/**
 * @file Autosave: the workspace is written to the device after every change,
 * and read back when the page opens, so a reload, a closed tab or a crash
 * loses nothing.
 */

import { useEffect } from "react";

import { isStrokeOpen } from "../../domain/sketchDocument";
import type { Workspace } from "../../domain/workspace";
import { readAutosave, writeAutosave } from "../../io/autosave";
import { createLogger } from "../../log/logger";
import {
    selectWorkspace,
    type SketchStore,
    useSketchStore,
} from "../../state/sketchStore";

const log = createLogger("autosave");

/** How long edits settle before they are written: a burst writes once. */
export const AUTOSAVE_DELAY = 500;

/** How long opening waits for storage before starting without it. */
export const RESTORE_TIMEOUT = 2000;

const timeout = (ms: number): Promise<never> =>
    new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`No answer in ${ms} ms`)), ms)
    );

/**
 * Puts back the workspace an earlier visit saved. It never rejects: with
 * nothing saved, a record it cannot use, or storage that does not answer in
 * time, the page simply opens blank, as it would have without autosave.
 */
export const restoreAutosave = async (): Promise<void> => {
    let workspace: Workspace | null;
    try {
        workspace = await Promise.race([
            readAutosave(),
            timeout(RESTORE_TIMEOUT),
        ]);
    } catch (error) {
        log.warn("autosave could not be read", { error });
        return;
    }

    if (workspace)
        useSketchStore.getState().actions.restoreWorkspace(workspace);
};

/**
 * Every part of the workspace, to compare by identity, since an edit replaces
 * what it changes. Read through `selectWorkspace`, so a part added there is
 * watched too, and a stroke's paint is no change until the stroke commits.
 */
const partsOf = (state: SketchStore): unknown[] => {
    const { document, settings } = selectWorkspace(state);

    return [...Object.values(document), ...Object.values(settings)];
};

const workspaceChanged = (next: SketchStore, previous: SketchStore) => {
    const before = partsOf(previous);

    return partsOf(next).some((part, at) => part !== before[at]);
};

/**
 * Saves the workspace a moment after it changes, and at once when the page is
 * hidden or unloaded: a phone can end a background tab without warning.
 *
 * A save that falls due during a stroke waits for it to end rather than
 * stall the drag. Leaving the page mid-stroke saves the drawing as last
 * committed, without the stroke.
 */
export const useAutosave = (): void => {
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let isPending = false;
        // One warning per run of failures, not one per save.
        let isFailing = false;

        const save = () => {
            clearTimeout(timer);
            if (!isPending) return;
            isPending = false;

            writeAutosave(selectWorkspace(useSketchStore.getState())).then(
                () => {
                    isFailing = false;
                },
                (error: unknown) => {
                    if (!isFailing) log.warn("autosave failed", { error });
                    isFailing = true;
                }
            );
        };

        const unsubscribe = useSketchStore.subscribe((next, previous) => {
            if (workspaceChanged(next, previous)) isPending = true;
            if (!isPending) return;

            clearTimeout(timer);
            if (!isStrokeOpen(next.document)) {
                timer = setTimeout(save, AUTOSAVE_DELAY);
            }
        });

        const saveIfHidden = () => {
            if (document.visibilityState === "hidden") save();
        };

        document.addEventListener("visibilitychange", saveIfHidden);
        window.addEventListener("pagehide", save);

        return () => {
            unsubscribe();
            document.removeEventListener("visibilitychange", saveIfHidden);
            window.removeEventListener("pagehide", save);
            save();
        };
    }, []);
};
