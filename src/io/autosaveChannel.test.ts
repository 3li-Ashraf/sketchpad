import { describe, expect, it, onTestFinished, vi } from "vitest";

import { type AutosaveNews, openAutosaveChannel } from "./autosaveChannel";

describe("the autosave channel", () => {
    /** A tab's end of the channel, counting what it hears. */
    const tab = () => {
        const heard = { saves: 0, news: [] as AutosaveNews[] };
        const channel = openAutosaveChannel((news) => {
            heard.news.push(news);
            if (news === "saved") heard.saves++;
        });
        onTestFinished(channel.close);

        return { channel, heard };
    };

    it("tells every other tab of a save, but not itself", async () => {
        const saving = tab();
        const other = tab();
        const another = tab();

        saving.channel.announce("saved");

        await vi.waitFor(() => {
            expect(other.heard.saves).toBe(1);
            expect(another.heard.saves).toBe(1);
        });
        expect(saving.heard.saves).toBe(0);
    });

    it("tells a clear apart from a save", async () => {
        const clearing = tab();
        const other = tab();

        clearing.channel.announce("cleared");

        await vi.waitFor(() => expect(other.heard.news).toEqual(["cleared"]));
    });

    it("hears anything it does not know, as from an older version, as a save", async () => {
        const other = tab();
        const older = new BroadcastChannel("sketchpad-autosave");
        onTestFinished(() => older.close());

        older.postMessage({ from: "a version that posts records" });

        await vi.waitFor(() => expect(other.heard.news).toEqual(["saved"]));
    });

    it("hears nothing once closed", async () => {
        const saving = tab();
        const closed = tab();
        const open = tab();
        closed.channel.close();

        saving.channel.announce("saved");

        await vi.waitFor(() => expect(open.heard.saves).toBe(1));
        expect(closed.heard.saves).toBe(0);
    });

    it("is silent where the browser has no BroadcastChannel", () => {
        vi.stubGlobal("BroadcastChannel", undefined);
        const onSavedElsewhere = vi.fn();

        const channel = openAutosaveChannel(onSavedElsewhere);

        expect(() => {
            channel.announce("saved");
            channel.close();
        }).not.toThrow();
        expect(onSavedElsewhere).not.toHaveBeenCalled();
    });
});
