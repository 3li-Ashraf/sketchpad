/** @file A promise a test settles when it chooses. */

export const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((settle, fail) => {
        resolve = settle;
        reject = fail;
    });

    return { promise, resolve, reject };
};
