import { describe, expect, it, onTestFinished, vi } from "vitest";

import { openAutosaveChannel } from "./autosaveChannel";

describe("the autosave channel", () => {
    /** A tab's end of the channel, counting what it hears. */
    const tab = () => {
        const heard = { saves: 0 };
        const channel = openAutosaveChannel(() => heard.saves++);
        onTestFinished(channel.close);

        return { channel, heard };
    };

    it("tells every other tab of a save, but not itself", async () => {
        const saving = tab();
        const other = tab();
        const another = tab();

        saving.channel.announce();

        await vi.waitFor(() => {
            expect(other.heard.saves).toBe(1);
            expect(another.heard.saves).toBe(1);
        });
        expect(saving.heard.saves).toBe(0);
    });

    it("hears nothing once closed", async () => {
        const saving = tab();
        const closed = tab();
        const open = tab();
        closed.channel.close();

        saving.channel.announce();

        await vi.waitFor(() => expect(open.heard.saves).toBe(1));
        expect(closed.heard.saves).toBe(0);
    });

    it("is silent where the browser has no BroadcastChannel", () => {
        vi.stubGlobal("BroadcastChannel", undefined);
        const onSavedElsewhere = vi.fn();

        const channel = openAutosaveChannel(onSavedElsewhere);

        expect(() => {
            channel.announce();
            channel.close();
        }).not.toThrow();
        expect(onSavedElsewhere).not.toHaveBeenCalled();
    });
});
