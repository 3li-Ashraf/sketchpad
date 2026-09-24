/**
 * @file The button that picks a drawing tool, and stays pressed while that
 * tool is in use.
 */

import { BiSolidEraser } from "react-icons/bi";
import { HiPencil } from "react-icons/hi2";
import { IoMdColorFill } from "react-icons/io";

import type { DrawingTool } from "../../domain/tools";
import { useSketchActions, useSketchStore } from "../../state/sketchStore";
import { ColorfulPenIcon } from "./ColorfulPenIcon";
import { ToolbarButton } from "./ToolbarButton";

/** A record, so a new tool cannot go without a label and an icon. */
const TOOLS: Record<DrawingTool, { label: string; Icon: React.FC }> = {
    pen: { label: "Pen", Icon: HiPencil },
    colorfulPen: { label: "Colorful pen", Icon: ColorfulPenIcon },
    eraser: { label: "Eraser", Icon: BiSolidEraser },
    fill: { label: "Fill", Icon: IoMdColorFill },
};

interface ToolButtonProps {
    tool: DrawingTool;
}

/**
 * Selects only whether its own tool is in use, so switching tools re-renders
 * the two buttons whose state changed rather than the whole panel.
 */
export const ToolButton: React.FC<ToolButtonProps> = ({ tool }) => {
    const isActive = useSketchStore((state) => state.tool === tool);
    const { setTool } = useSketchActions();
    const { label, Icon } = TOOLS[tool];

    return (
        <ToolbarButton
            label={label}
            isActive={isActive}
            onClick={() => setTool(tool)}
        >
            <Icon />
        </ToolbarButton>
    );
};
