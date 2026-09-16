// Type declarations for perry/thread — Perry's parallel computation primitives
// These types are auto-written by `perry init` / `perry types` so IDEs
// and tsc can resolve `import { ... } from "perry/thread"`.

/**
 * Apply a function to every element of an array in parallel across all CPU cores.
 * The closure must not capture mutable variables (enforced at compile time).
 * Values are deep-copied across threads.
 */
export function parallelMap<T, U>(array: T[], fn: (item: T) => U): U[];

/**
 * Filter an array in parallel across all CPU cores.
 * The predicate must not capture mutable variables (enforced at compile time).
 * Values are deep-copied across threads.
 */
export function parallelFilter<T>(array: T[], predicate: (item: T) => boolean): T[];

/**
 * Spawn a function on a new OS thread and return a Promise for its result.
 * The closure must not capture mutable variables (enforced at compile time).
 * The calling thread continues immediately (non-blocking).
 */
export function spawn<T>(fn: () => T): Promise<T>;
