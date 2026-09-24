/**
 * @file fast-check as this suite runs it. Every property starts from one fixed
 * seed, so a run is reproducible: the same cases on every run and every
 * machine, and a failure seen once is seen again. `TEST_SEED` in the
 * environment picks another seed, to explore cases the fixed one never reaches
 * or to replay the seed a failure reported.
 */

import fc from "fast-check";

const DEFAULT_SEED = 20_260_924;

const readSeed = (): number => {
    const env = import.meta.env as Record<string, string | undefined>;
    const wanted = env.TEST_SEED;
    if (wanted === undefined || wanted === "") return DEFAULT_SEED;

    const seed = Number(wanted);
    if (!Number.isSafeInteger(seed)) {
        throw new Error(`TEST_SEED is not a whole number: ${wanted}`);
    }

    return seed;
};

fc.configureGlobal({ seed: readSeed() });

export { fc };
