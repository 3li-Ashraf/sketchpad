/**
 * @file The pen glyph in a rainbow gradient, so the colorful pen reads as a pen
 * that draws in many colors.
 */

import { useId } from "react";

export const ColorfulPenIcon: React.FC = () => {
    // Gradient ids are document-wide, so each instance needs its own.
    const gradientId = useId();

    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[1em]">
            <defs>
                <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0%" stopColor="#f43f5e" />
                    <stop offset="25%" stopColor="#f59e0b" />
                    <stop offset="50%" stopColor="#22c55e" />
                    <stop offset="75%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#a855f7" />
                </linearGradient>
            </defs>
            <path
                fill={`url(#${gradientId})`}
                d="M21.731 2.269a2.625 2.625 0 0 0-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 0 0 0-3.712ZM19.513 8.199l-3.712-3.712-12.15 12.15a5.25 5.25 0 0 0-1.32 2.214l-.8 2.685a.75.75 0 0 0 .933.933l2.685-.8a5.25 5.25 0 0 0 2.214-1.32L19.513 8.2Z"
            />
        </svg>
    );
};
