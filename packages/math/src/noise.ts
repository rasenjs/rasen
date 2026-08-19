/**
 * Simplex noise — 2D/3D gradient noise with seeded permutation tables.
 *
 * Deterministic (same seed → same world), which makes it the standard tool
 * for procedural terrain generation. Implementation follows the classic
 * Gustavson simplex algorithm; the permutation table is seeded so worlds can
 * be reproduced exactly.
 */

// ---- gradient lookup tables -------------------------------------------------

const GRAD3_2D = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [1, 0], [-1, 0],
  [0, 1], [0, -1], [0, 1], [0, -1],
]

const GRAD3_3D = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
]

// F2/F3 skew factors for simplex grid.
const F2 = 0.5 * (Math.sqrt(3) - 1)
const G2 = (3 - Math.sqrt(3)) / 6
const F3 = 1 / 3
const G3 = 1 / 6

/** Mulberry32 PRNG — small deterministic seedable generator. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildPermutation(seed: number): Uint8Array {
  const rand = mulberry32(seed)
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  // Fisher–Yates shuffle
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = p[i]
    p[i] = p[j]
    p[j] = tmp
  }
  // Duplicate so p[i + 256] is always valid.
  const perm = new Uint8Array(512)
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
  return perm
}

/**
 * Simplex noise generator (2D + 3D).
 *
 * @example
 * ```ts
 * const noise = new SimplexNoise(1337)
 * const h = noise.noise2(x * 0.01, z * 0.01) // -1..1
 * ```
 */
export class SimplexNoise {
  private readonly perm: Uint8Array
  private readonly permMod12: Uint8Array

  constructor(seed = 0) {
    this.perm = buildPermutation(seed)
    this.permMod12 = new Uint8Array(512)
    for (let i = 0; i < 512; i++) this.permMod12[i] = this.perm[i] % 12
  }

  /** 2D simplex noise in [-1, 1]. */
  noise2(xin: number, yin: number): number {
    const perm = this.perm
    const permMod12 = this.permMod12
    let n0 = 0
    let n1 = 0
    let n2 = 0

    const s = (xin + yin) * F2
    const i = Math.floor(xin + s)
    const j = Math.floor(yin + s)
    const t = (i + j) * G2
    const x0 = xin - (i - t)
    const y0 = yin - (j - t)

    let i1: number
    let j1: number
    if (x0 > y0) {
      i1 = 1
      j1 = 0
    } else {
      i1 = 0
      j1 = 1
    }

    const x1 = x0 - i1 + G2
    const y1 = y0 - j1 + G2
    const x2 = x0 - 1 + 2 * G2
    const y2 = y0 - 1 + 2 * G2

    const ii = i & 255
    const jj = j & 255

    // Corner 0
    let t0 = 0.5 - x0 * x0 - y0 * y0
    if (t0 >= 0) {
      const gi0 = permMod12[ii + perm[jj]]
      const g0 = GRAD3_2D[gi0]
      t0 *= t0
      n0 = t0 * t0 * (g0[0] * x0 + g0[1] * y0)
    }

    // Corner 1
    let t1 = 0.5 - x1 * x1 - y1 * y1
    if (t1 >= 0) {
      const gi1 = permMod12[ii + i1 + perm[jj + j1]]
      const g1 = GRAD3_2D[gi1]
      t1 *= t1
      n1 = t1 * t1 * (g1[0] * x1 + g1[1] * y1)
    }

    // Corner 2
    let t2 = 0.5 - x2 * x2 - y2 * y2
    if (t2 >= 0) {
      const gi2 = permMod12[ii + 1 + perm[jj + 1]]
      const g2 = GRAD3_2D[gi2]
      t2 *= t2
      n2 = t2 * t2 * (g2[0] * x2 + g2[1] * y2)
    }

    return 70 * (n0 + n1 + n2)
  }

  /** 3D simplex noise in [-1, 1]. */
  noise3(xin: number, yin: number, zin: number): number {
    const perm = this.perm
    const permMod12 = this.permMod12
    let n0 = 0
    let n1 = 0
    let n2 = 0
    let n3 = 0

    const s = (xin + yin + zin) * F3
    const i = Math.floor(xin + s)
    const j = Math.floor(yin + s)
    const k = Math.floor(zin + s)
    const t = (i + j + k) * G3
    const x0 = xin - (i - t)
    const y0 = yin - (j - t)
    const z0 = zin - (k - t)

    let i1: number
    let j1: number
    let k1: number
    let i2: number
    let j2: number
    let k2: number
    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0
      } else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1
      } else {
        i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1
      }
    } else {
      if (y0 < z0) {
        i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1
      } else if (x0 < z0) {
        i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1
      } else {
        i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0
      }
    }

    const x1 = x0 - i1 + G3
    const y1 = y0 - j1 + G3
    const z1 = z0 - k1 + G3
    const x2 = x0 - i2 + 2 * G3
    const y2 = y0 - j2 + 2 * G3
    const z2 = z0 - k2 + 2 * G3
    const x3 = x0 - 1 + 3 * G3
    const y3 = y0 - 1 + 3 * G3
    const z3 = z0 - 1 + 3 * G3

    const ii = i & 255
    const jj = j & 255
    const kk = k & 255

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0
    if (t0 >= 0) {
      const gi0 = permMod12[ii + perm[jj + perm[kk]]]
      const g0 = GRAD3_3D[gi0]
      t0 *= t0
      n0 = t0 * t0 * (g0[0] * x0 + g0[1] * y0 + g0[2] * z0)
    }

    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1
    if (t1 >= 0) {
      const gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]]
      const g1 = GRAD3_3D[gi1]
      t1 *= t1
      n1 = t1 * t1 * (g1[0] * x1 + g1[1] * y1 + g1[2] * z1)
    }

    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2
    if (t2 >= 0) {
      const gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]]
      const g2 = GRAD3_3D[gi2]
      t2 *= t2
      n2 = t2 * t2 * (g2[0] * x2 + g2[1] * y2 + g2[2] * z2)
    }

    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3
    if (t3 >= 0) {
      const gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]]
      const g3 = GRAD3_3D[gi3]
      t3 *= t3
      n3 = t3 * t3 * (g3[0] * x3 + g3[1] * y3 + g3[2] * z3)
    }

    return 32 * (n0 + n1 + n2 + n3)
  }
}

/**
 * Fractal Brownian Motion — sums several octaves of noise for natural
 * rolling terrain.
 *
 * @example
 * ```ts
 * const n = fbm2(noise, x * 0.01, z * 0.01, 4, 0.5, 2)
 * ```
 */
export function fbm2(
  noise: SimplexNoise,
  x: number,
  y: number,
  octaves = 4,
  persistence = 0.5,
  lacunarity = 2,
): number {
  let amplitude = 1
  let frequency = 1
  let total = 0
  let maxValue = 0
  for (let i = 0; i < octaves; i++) {
    total += noise.noise2(x * frequency, y * frequency) * amplitude
    maxValue += amplitude
    amplitude *= persistence
    frequency *= lacunarity
  }
  return total / maxValue
}
