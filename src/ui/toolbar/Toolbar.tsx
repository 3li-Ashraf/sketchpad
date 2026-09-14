/**
 * @file The settings panel: every control the editor offers, wired to the store.
 * It is a declarative arrangement and holds no logic of its own — the drawing
 * rules are in the store, and saving, loading and exporting are in
 * `useSketchFiles`.
 */

import { BiSolidEraser } from "react-icons/bi";
import { FaRedo, FaUndo } from "react-icons/fa";
import { FiDownload, FiImage, FiTrash2, FiUpload } from "react-icons/fi";
import { HiPencil } from "react-icons/hi2";
import { IoMdColorFill } from "react-icons/io";
import { TbBorderAll, TbFlipHorizontal, TbFlipVertical } from "react-icons/tb";
import { SKETCH_FILE_EXTENSION } from "../../io/sketchFile";
import {
    selectCanRedo,
    selectCanUndo,
    useSketchStore,
} from "../../state/sketchStore";
import { useSketchFiles } from "./useSketchFiles";
import {
    EDITOR_PANEL_HEIGHT,
    TOOLBAR_PANEL_HEIGHT,
} from "../common/panelSize";
import { ColorfulPenIcon } from "./ColorfulPenIcon";
import { ColorPicker } from "./ColorPicker";
import { GridSizeSlider } from "./GridSizeSlider";
import { ToolbarButton } from "./ToolbarButton";

interface ToolbarProps {
    ref?: React.Ref<HTMLElement>;
    isOpen: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({ ref, isOpen }) => {
    const penColor = useSketchStore((state) => state.penColor);
    const tool = useSketchStore((state) => state.tool);
    const gridSize = useSketchStore((state) => state.gridSize);
    const mirrorX = useSketchStore((state) => state.mirrorX);
    const mirrorY = useSketchStore((state) => state.mirrorY);
    const showGridLines = useSketchStore((state) => state.showGridLines);
    const canUndo = useSketchStore(selectCanUndo);
    const canRedo = useSketchStore(selectCanRedo);

    const undo = useSketchStore((state) => state.undo);
    const redo = useSketchStore((state) => state.redo);
    const setPenColor = useSketchStore((state) => state.setPenColor);
    const setTool = useSketchStore((state) => state.setTool);
    const setGridSize = useSketchStore((state) => state.setGridSize);
    const clearGrid = useSketchStore((state) => state.clearGrid);
    const toggleMirrorX = useSketchStore((state) => state.toggleMirrorX);
    const toggleMirrorY = useSketchStore((state) => state.toggleMirrorY);
    const toggleGridLines = useSketchStore((state) => state.toggleGridLines);

    const {
        fileInputRef,
        error,
        saveSketch,
        exportPng,
        openFilePicker,
        loadSelectedFile,
    } = useSketchFiles();

    return (
        <aside
            ref={ref}
            aria-label="Settings"
            className={`${isOpen ? "flex" : "hidden"} md:flex flex-col justify-between absolute md:static 2xl:absolute left-[2vw] ${TOOLBAR_PANEL_HEIGHT} ${EDITOR_PANEL_HEIGHT} bg-surface border border-accent rounded-md p-6 lg:p-8`}
        >
            <h2 className="font-pixeled text-center text-lg">Settings</h2>

            <GridSizeSlider gridSize={gridSize} onChange={setGridSize} />

            <div className="grid grid-cols-2 place-items-center gap-4 lg:gap-5 xl:gap-8">
                <ToolbarButton
                    label="Pen"
                    isActive={tool === "pen"}
                    onClick={() => setTool("pen")}
                >
                    <HiPencil />
                </ToolbarButton>

                <ColorPicker color={penColor} onChange={setPenColor} />

                <ToolbarButton
                    label="Colorful Pen"
                    isActive={tool === "colorfulPen"}
                    onClick={() => setTool("colorfulPen")}
                >
                    <ColorfulPenIcon />
                </ToolbarButton>

                <ToolbarButton
                    label="Fill"
                    isActive={tool === "fill"}
                    onClick={() => setTool("fill")}
                >
                    <IoMdColorFill />
                </ToolbarButton>

                <ToolbarButton label="Clear Grid" onClick={clearGrid}>
                    <FiTrash2 />
                </ToolbarButton>

                <ToolbarButton
                    label="Eraser"
                    isActive={tool === "eraser"}
                    onClick={() => setTool("eraser")}
                >
                    <BiSolidEraser />
                </ToolbarButton>

                <ToolbarButton
                    label="Grid Lines"
                    isActive={showGridLines}
                    onClick={toggleGridLines}
                >
                    <TbBorderAll />
                </ToolbarButton>

                <ToolbarButton label="Screenshot" onClick={exportPng}>
                    <FiImage />
                </ToolbarButton>

                <ToolbarButton
                    label="Mirror X"
                    isActive={mirrorX}
                    onClick={toggleMirrorX}
                >
                    <TbFlipHorizontal />
                </ToolbarButton>

                <ToolbarButton
                    label="Mirror Y"
                    isActive={mirrorY}
                    onClick={toggleMirrorY}
                >
                    <TbFlipVertical />
                </ToolbarButton>

                <ToolbarButton label="Undo" isDisabled={!canUndo} onClick={undo}>
                    <FaUndo />
                </ToolbarButton>

                <ToolbarButton label="Redo" isDisabled={!canRedo} onClick={redo}>
                    <FaRedo />
                </ToolbarButton>

                <ToolbarButton label="Save Grid" onClick={saveSketch}>
                    <FiDownload />
                </ToolbarButton>

                <ToolbarButton label="Load Grid" onClick={openFilePicker}>
                    <FiUpload />
                </ToolbarButton>
            </div>

            {/* Where `useSketchFiles` surfaces a failure. Rendered conditionally
                rather than reserved, so the panel's other rows redistribute under
                `justify-between` when it appears; the panel itself is a fixed
                height and does not grow. */}
            {error && (
                <p role="alert" className="text-sm text-center max-w-[12rem]">
                    {error}
                </p>
            )}

            <input
                ref={fileInputRef}
                type="file"
                aria-label="Sketch file"
                className="hidden"
                accept={SKETCH_FILE_EXTENSION}
                onChange={loadSelectedFile}
            />
        </aside>
    );
};
