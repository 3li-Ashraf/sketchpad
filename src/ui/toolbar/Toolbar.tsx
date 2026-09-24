/**
 * @file The settings panel: every control the editor offers, wired to the
 * store. It holds no logic of its own; the grid size and file operations are
 * features of their own, in `ui/gridSize` and `ui/files`.
 */

import { FaRedo, FaUndo } from "react-icons/fa";
import {
    FiDownload,
    FiFilePlus,
    FiImage,
    FiTrash2,
    FiUpload,
} from "react-icons/fi";
import { TbBorderAll, TbFlipHorizontal, TbFlipVertical } from "react-icons/tb";

import { SKETCH_FILE_EXTENSION } from "../../io/sketchFile";
import {
    selectCanRedo,
    selectCanUndo,
    useSketchActions,
    useSketchStore,
} from "../../state/sketchStore";
import { ConfirmDialog, NoticeDialog } from "../common/Dialog";
import { EDITOR_PANEL_HEIGHT, TOOLBAR_PANEL_HEIGHT } from "../common/layout";
import { useSketchFiles } from "../files/useSketchFiles";
import { GridSizeControl } from "../gridSize/GridSizeControl";
import { ColorPicker } from "./ColorPicker";
import { RotateRightIcon } from "./RotateRightIcon";
import { ToolbarButton } from "./ToolbarButton";
import { ToolButton } from "./ToolButton";
import { useNewSketch } from "./useNewSketch";

interface ToolbarProps {
    ref?: React.Ref<HTMLElement>;
    id?: string;
    /** Whether the panel shows below the `md` breakpoint, where it collapses. */
    isOpen: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({ ref, id, isOpen }) => {
    const penColor = useSketchStore((state) => state.penColor);
    const symmetry = useSketchStore((state) => state.symmetry);
    const showGridLines = useSketchStore((state) => state.showGridLines);
    const canUndo = useSketchStore(selectCanUndo);
    const canRedo = useSketchStore(selectCanRedo);

    const {
        undo,
        redo,
        setPenColor,
        clearCanvas,
        rotateCanvas,
        toggleSymmetry,
        toggleGridLines,
    } = useSketchActions();

    const {
        fileInputRef,
        saveSketch,
        exportPng,
        openSketch,
        openChosenFile,
        failureDialog,
        replaceDialog,
    } = useSketchFiles();

    const { requestNewSketch, newSketchDialog } = useNewSketch();

    return (
        <aside
            ref={ref}
            id={id}
            aria-label="Settings"
            className={`${isOpen ? "flex" : "hidden"} absolute left-[2vw] flex-col justify-between md:static md:flex 2xl:absolute ${TOOLBAR_PANEL_HEIGHT} ${EDITOR_PANEL_HEIGHT} rounded-md border border-accent bg-surface p-6 lg:p-8`}
        >
            <h2 className="text-center font-pixeled text-lg">Settings</h2>

            <GridSizeControl />

            {/* Two controls to a row, in the order the owner chose;
                `Toolbar.test` pins it, so a change is deliberate. */}
            <div className="toolbar-grid grid grid-cols-2 place-items-center gap-x-4 gap-y-3 lg:gap-5 xl:gap-8">
                <ToolButton tool="pen" />

                <ToolButton tool="eraser" />

                <ToolButton tool="fill" />

                <ColorPicker color={penColor} onChange={setPenColor} />

                <ToolButton tool="colorfulPen" />

                <ToolbarButton
                    label="Grid lines"
                    isActive={showGridLines}
                    onClick={toggleGridLines}
                >
                    <TbBorderAll />
                </ToolbarButton>

                <ToolbarButton label="Clear canvas" onClick={clearCanvas}>
                    <FiTrash2 />
                </ToolbarButton>

                <ToolbarButton label="New sketch" onClick={requestNewSketch}>
                    <FiFilePlus />
                </ToolbarButton>

                <ToolbarButton
                    label="Top–bottom symmetry"
                    isActive={symmetry.topBottom}
                    onClick={() => toggleSymmetry("topBottom")}
                >
                    <TbFlipHorizontal />
                </ToolbarButton>

                <ToolbarButton
                    label="Left–right symmetry"
                    isActive={symmetry.leftRight}
                    onClick={() => toggleSymmetry("leftRight")}
                >
                    <TbFlipVertical />
                </ToolbarButton>

                <ToolbarButton
                    label="Rotate 90° clockwise"
                    onClick={rotateCanvas}
                >
                    <RotateRightIcon />
                </ToolbarButton>

                <ToolbarButton label="Export PNG" onClick={exportPng}>
                    <FiImage />
                </ToolbarButton>

                <ToolbarButton
                    label="Undo"
                    isDisabled={!canUndo}
                    onClick={undo}
                >
                    <FaUndo />
                </ToolbarButton>

                <ToolbarButton
                    label="Redo"
                    isDisabled={!canRedo}
                    onClick={redo}
                >
                    <FaRedo />
                </ToolbarButton>

                <ToolbarButton label="Save sketch" onClick={saveSketch}>
                    <FiDownload />
                </ToolbarButton>

                <ToolbarButton label="Open sketch" onClick={openSketch}>
                    <FiUpload />
                </ToolbarButton>
            </div>

            <input
                ref={fileInputRef}
                type="file"
                aria-label="Sketch file"
                className="hidden"
                accept={SKETCH_FILE_EXTENSION}
                onChange={openChosenFile}
            />

            {/* Rendered where their state lives; each portals itself out. */}
            {replaceDialog && <ConfirmDialog {...replaceDialog} />}
            {newSketchDialog && <ConfirmDialog {...newSketchDialog} />}
            {failureDialog && <NoticeDialog {...failureDialog} />}
        </aside>
    );
};
