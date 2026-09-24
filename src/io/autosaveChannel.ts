/**
 * @file How tabs tell each other they have autosaved or cleared. Every tab
 * shares the one record in `autosave`, so a tab that hears of a change to it
 * knows its own copy may be out of date.
 */

const CHANNEL_NAME = "sketchpad-autosave";

/**
 * What a tab did to the record: wrote its workspace, or emptied the store for
 * a new sketch.
 */
export type AutosaveNews = "saved" | "cleared";

/** How a tab tells the others what it did, and hears what they did. */
export interface AutosaveChannel {
    /** Tells every other tab. */
    announce: (news: AutosaveNews) => void;
    close: () => void;
}

/**
 * Opens this tab's line to the others: `onNews` hears what each other tab
 * announces, never what this channel announced itself. With no
 * `BroadcastChannel`, nothing is heard and announcing does nothing, as with a
 * single tab.
 *
 * Anything but "cleared" is heard as "saved", including what an older
 * version of the app posts, since reading the record again is always safe.
 */
export const openAutosaveChannel = (
    onNews: (news: AutosaveNews) => void
): AutosaveChannel => {
    if (typeof BroadcastChannel === "undefined") {
        return { announce: () => {}, close: () => {} };
    }

    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = ({ data }: MessageEvent) =>
        onNews(data === "cleared" ? "cleared" : "saved");

    return {
        announce: (news) => channel.postMessage(news),
        close: () => channel.close(),
    };
};
