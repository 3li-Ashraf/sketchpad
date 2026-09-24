/**
 * @file The autosave session: writing the workspace to the device as it
 * changes, with no React in it; `useAutosave` starts and stops it.
 *
 * A page never writes over a saved workspace it has not seen. When opening
 * could not read the device in time, the first write waits until the page has
 * read it, and when the drawing found there and one drawn since would erase
 * each other, the user chooses. Tabs also tell each other when they save, and
 * a tab with nothing of its own waiting to be written takes up what another
 * saved, so a tab left behind cannot later write its older drawing over the
 * newer one.
 */

import { isStrokeOpen } from "../../domain/sketchDocument";
import type { Workspace } from "../../domain/workspace";
import { readAutosave, writeAutosave } from "../../io/autosave";
import { openAutosaveChannel } from "../../io/autosaveChannel";
import { createLogger } from "../../log/logger";
import {
    selectHasWorkToLose,
    type SketchStore,
    useSketchStore,
    workspaceOf,
} from "../../state/sketchStore";
import type { Restored } from "./restoreAutosave";

const log = createLogger("autosave");

/** How long edits settle before they are written: a burst writes once. */
export const AUTOSAVE_DELAY = 500;

/**
 * Every part of the workspace, to compare by identity, since an edit replaces
 * what it changes. Read through `workspaceOf`, so a part added there is
 * watched too, and a stroke's paint is no change until the stroke commits.
 */
const partsOf = (state: SketchStore): unknown[] => {
    const { document, settings } = workspaceOf(state);

    return [...Object.values(document), ...Object.values(settings)];
};

const workspaceChanged = (next: SketchStore, previous: SketchStore) => {
    const before = partsOf(previous);

    return partsOf(next).some((part, at) => part !== before[at]);
};

/** The choice between the drawing on the device and the one drawn since. */
export interface Question {
    restore: () => void;
    keep: () => void;
}

/**
 * Saves as `useAutosave` describes, until the returned function stops it. The
 * page's knowledge of the device is kept on `restored`; everything else here
 * starts afresh each time.
 */
export const startAutosave = (
    restored: Restored,
    ask: (question: Question | null) => void
): (() => void) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Changed since it was last written or taken from the device. Mounted
    // afresh after a crash while the device could not be read, the drawing
    // held back so far is still waiting.
    let isPending =
        !restored.isKnown && selectHasWorkToLose(useSketchStore.getState());
    // One warning per run of failures, not one per save.
    let isFailing = false;
    let isStopped = false;
    let isReading = false;
    let isAsking = false;
    // Set while the store is given what the device holds, which is no
    // change to write back.
    let isAdopting = false;
    // Saves other tabs have announced, so a read begun before the latest one
    // is known to be out of date.
    let savesHeard = 0;

    const fail = (error: unknown) => {
        if (!isFailing) log.warn("autosave failed", { error });
        isFailing = true;
    };

    const adopt = (workspace: Workspace) => {
        clearTimeout(timer);
        isPending = false;
        isAdopting = true;
        try {
            useSketchStore.getState().actions.restoreWorkspace(workspace);
        } finally {
            isAdopting = false;
        }
    };

    /** Reads the device, and again if another tab saves in the meantime. */
    const readDevice = (
        settle: (workspace: Workspace | null) => void,
        answer = readAutosave()
    ): void => {
        const heard = savesHeard;
        isReading = true;

        answer.then(
            (workspace) => {
                isReading = false;
                if (isStopped) return;
                if (restored.answer === answer) restored.answer = null;

                isFailing = false;
                if (savesHeard === heard) settle(workspace);
                else readDevice(settle);
            },
            (error: unknown) => {
                isReading = false;
                if (isStopped) return;
                if (restored.answer === answer) restored.answer = null;

                fail(error);
            }
        );
    };

    const save = () => {
        clearTimeout(timer);
        if (!isPending) return;

        // Held until the page has seen what it would write over.
        if (!restored.isKnown) {
            if (!isStopped && !isReading && !isAsking) readDevice(learn);
            return;
        }

        isPending = false;
        writeAutosave(workspaceOf(useSketchStore.getState())).then(() => {
            isFailing = false;
            if (!isStopped) channel.announce();
        }, fail);
    };

    const know = () => {
        restored.isKnown = true;
        save();
    };

    /** Takes up a save another tab announced, unless this tab has its own. */
    const takeUpSaved = () => {
        if (!restored.isKnown || isPending || isReading) return;

        readDevice((workspace) => {
            // Drawn in the meantime: this tab's own save follows, and the
            // later edit wins.
            const { document } = useSketchStore.getState();
            if (workspace && !isPending && !isStrokeOpen(document)) {
                adopt(workspace);
            }
        });
    };

    /**
     * What the device held when the page could not tell at opening. It goes
     * on the canvas if nothing has been drawn since; otherwise either drawing
     * would erase the other, so the user chooses.
     */
    const learn = (workspace: Workspace | null) => {
        const state = useSketchStore.getState();
        const hasDrawn =
            selectHasWorkToLose(state) || isStrokeOpen(state.document);

        if (!workspace || !hasDrawn) {
            if (workspace) adopt(workspace);
            know();
            return;
        }

        const heard = savesHeard;
        const answered = (choice: () => void) => () => {
            isAsking = false;
            ask(null);
            choice();
        };

        isAsking = true;
        ask({
            restore: answered(() => {
                adopt(workspace);
                know();
                // A tab that saved while the question was up saved later.
                if (savesHeard !== heard) takeUpSaved();
            }),
            // Written at once: this drawing is the one to keep.
            keep: answered(() => {
                isPending = true;
                know();
            }),
        });
    };

    const hearSave = () => {
        if (isStopped) return;

        savesHeard++;
        takeUpSaved();
    };

    const channel = openAutosaveChannel(hearSave);

    const unsubscribe = useSketchStore.subscribe((next, previous) => {
        if (isAdopting) return;
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

    // Back from the back-forward cache, a page may have missed saves made
    // while it was away.
    const catchUp = (event: PageTransitionEvent) => {
        if (event.persisted) hearSave();
    };

    document.addEventListener("visibilitychange", saveIfHidden);
    window.addEventListener("pagehide", save);
    window.addEventListener("pageshow", catchUp);

    if (!restored.isKnown && restored.answer) {
        readDevice(learn, restored.answer);
    }
    if (isPending) timer = setTimeout(save, AUTOSAVE_DELAY);

    return () => {
        unsubscribe();
        document.removeEventListener("visibilitychange", saveIfHidden);
        window.removeEventListener("pagehide", save);
        window.removeEventListener("pageshow", catchUp);
        // Stopped first: the last save is still written, but starts no read,
        // whose answer nothing would be left to act on, and goes unannounced,
        // since the channel closes with it.
        isStopped = true;
        save();
        channel.close();
    };
};
