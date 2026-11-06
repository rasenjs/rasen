/**
 * Deterministic 32-bit PRNG and value noise.
 *
 * `Math.random()` is unusable here: a world has to be reproducible from its seed
 * alone so that a bug reported against "seed 1234, tile 88,60" can be
 * reproduced exactly. Every random draw in worldgen comes from one of these.
 */

/** mulberry32 — small, fast, and good enough for content generation. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Integer hash over a 2D coordinate. Stable, allocation-free, no state. */
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(seed, 0x9e3779b9)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/** hash2 normalised to [0, 1). */
export function hash2f(x: number, y: number, seed: number): number {
  return hash2(x, y, seed) / 4294967296
}

/** Deterministic per-tile variant index, used to pick a sprite out of a sheet. */
export function variantAt(x: number, y: number, seed: number, count: number): number {
  return hash2(x, y, seed) % count
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)

/** NaN-safe linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function gradient(ix: number, iy: number, seed: number): number {
  return hash2f(ix, iy, seed) * 2 - 1
}

/** 2D value noise with smoothstep interpolation. Range is roughly [-1, 1]. */
export function valueNoise2(x: number, y: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = fade(x - ix)
  const fy = fade(y - iy)

  const n00 = gradient(ix, iy, seed)
  const n10 = gradient(ix + 1, iy, seed)
  const n01 = gradient(ix, iy + 1, seed)
  const n11 = gradient(ix + 1, iy + 1, seed)

  return lerp(lerp(n00, n10, fx), lerp(n01, n11, fx), fy)
}

/** Fractal Brownian motion over `valueNoise2`. */
export function fbm2(
  x: number,
  y: number,
  seed: number,
  octaves = 4,
  lacunarity = 2,
  gain = 0.5
): number {
  let sum = 0
  let amp = 1
  let norm = 0
  let fx = x
  let fy = y
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2(fx, fy, seed + i * 7919) * amp
    norm += amp
    amp *= gain
    fx *= lacunarity
    fy *= lacunarity
  }
  return norm === 0 ? 0 : sum / norm
}
