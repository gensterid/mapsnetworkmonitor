/**
 * Result pattern for standardized error handling.
 * This pattern ensures that errors are treated as values, making the
 * control flow more predictable and type-safe.
 */

export type Result<T, E = Error> = 
    | { ok: true; value: T } 
    | { ok: false; error: E };

/**
 * Utility to create a success result
 */
export function ok<T>(value: T): Result<T, never> {
    return { ok: true, value };
}

/**
 * Utility to create a failure result
 */
export function err<E>(error: E): Result<never, E> {
    return { ok: false, error };
}

/**
 * Helper to wrap an async operation in a Result
 */
export async function tryResult<T, E = Error>(
    promise: Promise<T>,
    errorTransformer?: (err: unknown) => E
): Promise<Result<T, E>> {
    try {
        const value = await promise;
        return ok(value);
    } catch (e) {
        if (errorTransformer) {
            return err(errorTransformer(e));
        }
        return err(e as E);
    }
}
