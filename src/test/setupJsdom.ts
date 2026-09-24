/**
 * @file Runs before component tests under jsdom only: stands in for the
 * browser APIs jsdom lacks. The browser project gets the real ones.
 */

// An in-memory IndexedDB, so the app's autosave has somewhere to write.
import "fake-indexeddb/auto";

import { installDialog, installPointerCapture } from "./jsdomStubs";

installPointerCapture();
installDialog();
