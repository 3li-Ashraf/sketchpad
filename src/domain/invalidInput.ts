/**
 * @file Logging a value a guard refused.
 *
 * No user action can produce the values these guards refuse: the color picker,
 * the slider and the pointer only ever produce valid ones, and a bad file is
 * reported to the user by the decoder. So a refused value means a bug, and it
 * is logged as an error for whoever is looking at the console, never shown to
 * the user, who could do nothing about it.
 */

import { createLogger } from "../log/logger";

const log = createLogger("validation");

export const reportInvalidInput = (
    where: string,
    problem: string,
    value: unknown
): void => {
    log.error("invalid input refused", { where, problem, value });
};
