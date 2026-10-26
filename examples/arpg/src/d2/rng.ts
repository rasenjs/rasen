/**
 * The game's random number generator.
 *
 * One seed is two 32-bit words stepped by a 64-bit multiply-and-add — the scheme
 * Diablo II inherited from Diablo. Everything the game decides with dice goes
 * through it: item rolls, monster packs, level layout, and the order in which
 * those draws happen, because a seed is a running position rather than a fresh
 * value per call. Reproducing a game therefore means reproducing the *order* of
 * the draws on the same seed object, which is why the seed is a value the caller
 * carries around rather than global state.
 *
 * The one behaviour worth spelling out: `range` with a modulus below 1 returns 0
 * **without stepping**. That is how the original guards a zero count, and a
 * reimplementation that "fixed" it would shift every later draw by one.
 */

/** A generator position: the two words the original keeps. */
export interface Seed {
  low: number
  high: number
}

/** The multiplier of the step, from the original's `RNG_Step`. */
const MULTIPLIER = 0x6ac690c5

/** The high word every initialiser sets; 666 in decimal. */
const INIT_HIGH = 666

/** A fresh seed at `value`, in the state the initialisers leave it. */
export function seedFrom(value: number): Seed {
  return { low: value >>> 0, high: INIT_HIGH }
}

/** A fresh seed at the fixed start value the game uses for baselines. */
export function seedOne(): Seed {
  return { low: 1, high: INIT_HIGH }
}

/**
 * The high half of a 32x32 product.
 *
 * JavaScript numbers carry 53 bits, so the 64-bit product of two 32-bit words
 * cannot be taken in one multiply; it is built from four 16-bit partial products
 * instead, which stay well inside that range.
 */
function multiplyHigh(left: number, right: number): number {
  const leftLow = left & 0xffff
  const leftHigh = left >>> 16
  const rightLow = right & 0xffff
  const rightHigh = right >>> 16
  const lowLow = Math.imul(leftLow, rightLow)
  const lowHigh = Math.imul(leftLow, rightHigh)
  const highLow = Math.imul(leftHigh, rightLow)
  const highHigh = Math.imul(leftHigh, rightHigh)
  const middle = (lowLow >>> 16) + (lowHigh & 0xffff) + (highLow & 0xffff)
  return (highHigh + (lowHigh >>> 16) + (highLow >>> 16) + (middle >>> 16)) >>> 0
}

/**
 * Advances the seed by one step: the 64-bit value `low × MULTIPLIER + high` becomes
 * the new `low.high`.
 *
 * The old high word is added to the WHOLE 64-bit product, not to its high half, so
 * its carry into the high word has to be carried across by hand — dropping it is
 * the classic way to write a generator that still looks random and is wrong.
 */
export function step(seed: Seed): void {
  const productLow = Math.imul(seed.low, MULTIPLIER) >>> 0
  const productHigh = multiplyHigh(seed.low, MULTIPLIER)
  const sum = productLow + seed.high
  seed.low = sum >>> 0
  seed.high = (productHigh + (sum >= 0x100000000 ? 1 : 0)) >>> 0
}

/**
 * Steps once and returns a value in `[0, n)`.
 *
 * `n < 1` returns 0 and does NOT step — the guard the original applies, and the
 * reason a zero-count roll does not disturb the sequence.
 */
export function range(seed: Seed, n: number): number {
  if (n < 1) return 0
  step(seed)
  return seed.low % (n >>> 0)
}

/** Steps once and masks the low word with `n - 1`, for the callers that pass a power of two. */
export function rangePowerOfTwo(seed: Seed, n: number): number {
  step(seed)
  return seed.low & ((n - 1) >>> 0)
}
