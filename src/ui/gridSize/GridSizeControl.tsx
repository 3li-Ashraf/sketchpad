/**
 * @file The grid size slider, wired to the resize rules, with the question it
 * asks before a resize would erase a drawing.
 */

import { ConfirmDialog } from "../common/Dialog";
import { GridSizeSlider } from "./GridSizeSlider";
import { useGridResize } from "./useGridResize";

export const GridSizeControl: React.FC = () => {
    const { gridSize, isLocked, resize, allowResize, resizeDialog } =
        useGridResize();

    return (
        <>
            <GridSizeSlider
                gridSize={gridSize}
                isLocked={isLocked}
                onChange={resize}
                onBeforeChange={allowResize}
            />
            {resizeDialog && <ConfirmDialog {...resizeDialog} />}
        </>
    );
};
