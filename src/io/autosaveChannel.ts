/**
 * @file How tabs tell each other they have autosaved. Every tab shares the one
 * record in `autosave`, so a tab that hears of a save knows its own copy may be
 * out of date.
 */

const CHANNEL_NAME = "sketchpad-autosave";

/** How a tab tells the others it has saved, and hears when they have. */
export interface AutosaveChannel {
    /** Tells every other tab a save has been written. */
    announce: () => void;
    close: () => void;
}

/**
 * Opens this tab's line to the others: `onSavedElsewhere` hears each save
 * another tab announces, never one this channel announced itself. With no
 * `BroadcastChannel`, nothing is heard and announcing does nothing, as with a
 * single tab.
 */
export const openAutosaveChannel = (
    onSavedElsewhere: () => void
): AutosaveChannel => {
    if (typeof BroadcastChannel === "undefined") {
        return { announce: () => {}, close: () => {} };
    }

    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = onSavedElsewhere;

    return {
        announce: () => channel.postMessage("saved"),
        close: () => channel.close(),
    };
};
