/**
 * @file Whether a modal dialog is up. The page behind one is inert to the
 * pointer and to focus, but not to listeners on the window, which ask this
 * before acting under a question.
 */

export const isDialogOpen = (): boolean =>
    document.querySelector("dialog[open]") !== null;
