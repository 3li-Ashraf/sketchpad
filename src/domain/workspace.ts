/**
 * @file The workspace: everything kept between visits. That is the drawing as
 * last committed, with its whole undo and redo history, and the editor
 * settings.
 *
 * The "Don't ask again" choices are deliberately left out. Nothing in the app
 * can turn those questions back on, so keeping them would make them
 * permanent; they last until the page is reloaded.
 */

import { NO_SYMMETRY, type Symmetry } from "./grid";
import type { CommittedDocument } from "./sketchDocument";
import { DEFAULT_PEN_COLOR, DEFAULT_TOOL, type DrawingTool } from "./tools";

/** How the next stroke paints, and whether the grid lines show. */
export interface EditorSettings {
    readonly tool: DrawingTool;
    /** Uppercase `#RRGGBB`, like every color in the app. */
    readonly penColor: string;
    readonly symmetry: Symmetry;
    readonly showGridLines: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
    tool: DEFAULT_TOOL,
    penColor: DEFAULT_PEN_COLOR,
    symmetry: NO_SYMMETRY,
    showGridLines: true,
};

export interface Workspace {
    document: CommittedDocument;
    settings: EditorSettings;
}
