/**
 * @file The entry point: wires up error reporting, restores the autosaved
 * workspace, then mounts the app.
 */

import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/press-start-2p/latin-400.css";
import "./styles/index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { ErrorBoundary } from "./app/ErrorBoundary";
import {
    installGlobalErrorHandlers,
    reactErrorHandlers,
} from "./app/errorReporting";
import { restoreAutosave } from "./ui/autosave/restoreAutosave";

installGlobalErrorHandlers();

// Before the first render, so the page opens on the saved drawing rather than
// flashing a blank one. It gives up after a moment if storage does not answer,
// and autosave then holds its writes until it has.
const restored = await restoreAutosave();

createRoot(document.getElementById("root")!, reactErrorHandlers).render(
    <StrictMode>
        <ErrorBoundary>
            <App restored={restored} />
        </ErrorBoundary>
    </StrictMode>
);
