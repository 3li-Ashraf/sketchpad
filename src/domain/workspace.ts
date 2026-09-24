/**
 * @file The workspace: everything kept between visits. That is the drawing as
 * last committed, with its whole undo and redo history, and the editor
 * settings.
 *
 * The "Don't ask again" choices are deliberately left out. Nothing in the app
 * can turn those questions back on, so keeping them would make them
 * permanent; they last until the page is reloaded.
 */

import type { Symmetry } from "./grid";
import type { CommittedDocument } from "./sketchDocument";
import type { DrawingTool } from "./tools";

export interface Workspace {
    document: CommittedDocument;
    settings: {
        tool: DrawingTool;
        penColor: string;
        symmetry: Symmetry;
        showGridLines: boolean;
    };
}
