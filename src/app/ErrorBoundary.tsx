/**
 * @file What the page shows if rendering crashes, instead of going blank. The
 * error itself is logged by `reactErrorHandlers` on the root.
 */

import { Component } from "react";

import { TextButton } from "../ui/common/TextButton";

interface ErrorBoundaryProps {
    children: React.ReactNode;
}

interface ErrorBoundaryState {
    hasCrashed: boolean;
}

/**
 * "Try again" renders the app afresh. The drawing lives in the store, outside
 * the tree that crashed, so it survives the retry.
 */
export class ErrorBoundary extends Component<
    ErrorBoundaryProps,
    ErrorBoundaryState
> {
    state: ErrorBoundaryState = { hasCrashed: false };

    static getDerivedStateFromError(): ErrorBoundaryState {
        return { hasCrashed: true };
    }

    render() {
        if (!this.state.hasCrashed) return this.props.children;

        return (
            <div
                role="alert"
                className="flex h-full flex-col items-center justify-center gap-6 bg-surface p-8 text-center font-main text-accent"
            >
                <h1 className="font-pixeled text-lg">Something went wrong</h1>
                <p className="max-w-96 text-sm leading-6">
                    Sketchpad hit an error it could not recover from on its own.
                    Your drawing is still here; try again to get back to it.
                </p>
                <TextButton
                    onClick={() => this.setState({ hasCrashed: false })}
                >
                    Try again
                </TextButton>
            </div>
        );
    }
}
