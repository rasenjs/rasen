/**
 * Tile lighting — a breadth-first flood over the tile grid.
 *
 * Two kinds of source feed the queue:
 *
 *  1. **Sky light.** Walk each column from the top down while it is transparent,
 *     depositing daylight. This is why the surface is lit and caves are not without
 *     any per-frame raycasting: the first opaque tile in a column stops the column,
 *     and everything below has to be reached by propagation from the sides.
 *  2. **Emitters** — torches, lava, gemstones — which seed their own colour.
 *
 * Propagation is per-channel with a `max` rule, so a warm torch beside a cool gem
 * produces the blend you would expect instead of one winning outright.
 *
 * ## Cost model
 *
 * A pass is O(tiles) but only fires when `TileStore.needsLight` is set, which
 * happens when a tile actually changed. Cost therefore tracks *activity*, not frame
 * count. `main.tsx` additionally throttles it, because holding the mine button keeps
 * the flag set for as long as the button is down.
 *
 * ## Why the floor is not zero
 *
 * The lightmap is multiplied over the world, so a value of 0 makes a pixel pure
 * black. Real darkness is never pure black — there is always a little ambient — and
 * more practically, a hard zero makes the terrain silhouette disappear entirely,
 * which reads as a rendering bug rather than as unlit rock. `LIGHT_FLOOR` keeps a
 * deep blue-black ambient instead, which is what lets you still see the shape of a
 * cave you have not lit yet.
 */

import { LIGHT_FALLOFF, LIGHT_FLOOR, LIGHT_SCALE, TILE, WORLD_H, WORLD_W } from './constants'
import { TileStore, Wall } from './tile-store'
import { Tile, TILE_DEFS } from './tile-defs'

export interface LightingEnvironment {
  /** Daylight strength, 0 = midnight, 1 = noon. */
  readonly daylight: number
  /** Tint multiplied into sky light, so night reads as blue rather than grey. */
  readonly skyTint: readonly [number, number, number]
  /** Ambient added under everything, so unlit areas keep their silhouette. */
  readonly ambient: readonly [number, number, number]
}

/**
 * How much of the remaining light an opaque tile absorbs per step.
 *
 * Tuned to sunlight: with a 0.14 air falloff, `0.86 × 0.84 = 0.72` per solid tile
 * puts the daylight floor around six tiles down, which is roughly where the soil
 * layer ends. The first revision used 0.45, which dropped the topsoil to the ambient
 * floor within two tiles and made the surface read as a black band.
 */
const SOLID_ABSORB = 0.16

/** Flat queue of packed tile indices; reused across passes, so no per-pass churn. */
const queue = new Int32Array(WORLD_W * WORLD_H)

/**
 * Per-cell transmission, precomputed once per pass.
 *
 * `spread` runs four times per dequeued cell, and every branch of it used to re-do a
 * registry lookup and the absorption arithmetic. Hoisting that into one flat array
 * turns the hot loop into a multiply and a compare. This is the same shape as
 * Open-Terraria's `TILE_DEFS`-indexed bake kernel: read the registry once, then work
 * in typed memory.
 */
const transmit = new Float32Array(WORLD_W * WORLD_H)

/**
 * Smallest improvement worth propagating.
 *
 * The flood re-enqueues a cell whenever a neighbour can raise it, so on a grid with
 * many equal-strength paths a cell can be revisited dozens of times to gain a
 * fraction of a percent. Dropping sub-perceptual gains cuts the queue traffic
 * several-fold with no visible difference — 0.004 of a light level is under one step
 * of 8-bit output at the values this map actually holds.
 */
const IMPROVE_EPSILON = 0.004

export function computeLighting(store: TileStore, env: LightingEnvironment): number {
  const t0 = performance.now()
  const w = store.w
  const h = store.h
  const light = store.light

  // Reset. A full clear is cheaper than tracking which cells the last pass touched,
  // and it makes the pass idempotent — which matters because the pass is throttled
  // and may run against a world that changed since the previous pass.
  light.fill(0)
  let head = 0
  let tail = 0

  // One registry walk for the whole pass, in the same loop that resets the light
  // plane's transmission table.
  const cells = w * h
  for (let i = 0; i < cells; i++) {
    const opacity = TILE_DEFS[store.tiles[i]].opacity
    // Air transmits fully; solids absorb. Light *does* enter solid tiles, just
    // attenuated — see the note in `spread`. Keeping the sky column special-cased on
    // `opacity >= 1` is what still makes a cave dark.
    transmit[i] = (1 - LIGHT_FALLOFF) * (1 - opacity * SOLID_ABSORB)
  }

  const [tintR, tintG, tintB] = env.skyTint
  const skyR = env.daylight * tintR
  const skyG = env.daylight * tintG
  const skyB = env.daylight * tintB

  // -- 1. sky columns -------------------------------------------------------
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = y * w + x
      const opacity = TILE_DEFS[store.tiles[i]].opacity
      // A fully opaque tile ends the column: everything below it is cave, and has to
      // be reached by propagation rather than by falling sky light.
      if (opacity >= 1) break
      // Semi-transparent tiles (leaves, glass, water) pass sky light attenuated
      // rather than blocking the column outright.
      const atten = 1 - opacity * 0.55
      const i3 = i * 3
      light[i3] = skyR * atten
      light[i3 + 1] = skyG * atten
      light[i3 + 2] = skyB * atten
      if (tail < queue.length) queue[tail++] = i
    }
  }

  // -- 2. emitters ----------------------------------------------------------
  for (let i = 0; i < store.tiles.length; i++) {
    const emit = TILE_DEFS[store.tiles[i]].light
    if (!emit) continue
    const i3 = i * 3
    let improved = false
    if (light[i3] < emit[0]) {
      light[i3] = emit[0]
      improved = true
    }
    if (light[i3 + 1] < emit[1]) {
      light[i3 + 1] = emit[1]
      improved = true
    }
    if (light[i3 + 2] < emit[2]) {
      light[i3 + 2] = emit[2]
      improved = true
    }
    if (improved && tail < queue.length) queue[tail++] = i
  }

  // -- 3. propagate ---------------------------------------------------------
  while (head < tail) {
    const i = queue[head++]
    const x = i % w
    const y = (i / w) | 0
    const i3 = i * 3
    const r = light[i3]
    const g = light[i3 + 1]
    const b = light[i3 + 2]

    // Four-neighbour flood. Diagonal bleed is deliberately omitted: it doubles the
    // queue traffic and makes cave walls leak light they should not.
    if (x > 0) spread(i - 1, r, g, b)
    if (x < w - 1) spread(i + 1, r, g, b)
    if (y > 0) spread(i - w, r, g, b)
    if (y < h - 1) spread(i + w, r, g, b)

    // The loop terminates because `spread` only enqueues on a strict improvement,
    // so a cell can be revisited at most once per distinct higher value.
    if (tail >= queue.length) break
  }

  // -- 4. ambient + shoulder ------------------------------------------------
  // The floor is applied as a blend toward the ambient colour rather than as a
  // constant add: adding would lift black rock to grey and wash out the night.
  const [ambR, ambG, ambB] = env.ambient
  const invR = 1 - ambR
  const invG = 1 - ambG
  const invB = 1 - ambB
  for (let i = 0; i < cells; i++) {
    const i3 = i * 3
    light[i3] = ambR + shape(light[i3]) * invR
    light[i3 + 1] = ambG + shape(light[i3 + 1]) * invG
    light[i3 + 2] = ambB + shape(light[i3 + 2]) * invB
  }

  store.clearLightDirty()
  return performance.now() - t0

  function spread(j: number, r: number, g: number, b: number): void {
    const step = transmit[j]
    const nr = r * step
    const ng = g * step
    const nb = b * step
    if (nr <= LIGHT_FLOOR && ng <= LIGHT_FLOOR && nb <= LIGHT_FLOOR) return

    const j3 = j * 3
    // Enqueue only on a *meaningful* improvement. A strict `>` test still terminates,
    // but only after the flood has re-walked every equal-strength path in the grid.
    if (nr <= light[j3] + IMPROVE_EPSILON && ng <= light[j3 + 1] + IMPROVE_EPSILON && nb <= light[j3 + 2] + IMPROVE_EPSILON) {
      return
    }

    if (nr > light[j3]) light[j3] = nr
    if (ng > light[j3 + 1]) light[j3 + 1] = ng
    if (nb > light[j3 + 2]) light[j3 + 2] = nb
    if (tail < queue.length) queue[tail++] = j
  }
}

/**
 * Soft shoulder: lifts mid tones without touching the extremes.
 *
 * Written as a plain polynomial rather than with branches so the per-cell ambient
 * loop over every tile in the world stays flat.
 */
function shape(v: number): number {
  const c = v < 0 ? 0 : v > 1 ? 1 : v
  return c * c * (3 - 2 * c) * 0.35 + c * 0.65
}

/**
 * Writes the light plane into an `ImageData` at `LIGHT_SCALE` pixels per tile.
 *
 * Keeping the lightmap larger than one pixel per tile is what lets a single
 * smoothed upscale produce gradients instead of visible tile-sized blocks.
 *
 * ## The alpha channel is not decoration
 *
 * The lightmap is composited with `globalCompositeOperation = 'multiply'`, and
 * multiply is defined as
 *
 *     Co = (1 - αb)·αs·Cs + (1 - αs)·αb·Cb + αs·αb·B(Cb, Cs)
 *
 * With an opaque source that reduces to `Cb · Cs` — so whatever is *behind* the
 * lightmap gets multiplied too, and the backdrop here includes the sky. That was a
 * real bug: the whole sky was dimmed to ~75% and shifted toward the ambient colour,
 * which is what left the frame looking washed out and muddy.
 *
 * Writing `αs = 0` where there is nothing to light collapses the formula to
 * `Co = Cb`: the destination passes through untouched. So a cell is **opaque in the
 * lightmap only when it has something to light** — an opaque tile, or a background
 * wall behind the air. An empty sky cell is left fully transparent and the gradient
 * behind it survives.
 */
export function paintLightmap(store: TileStore, image: ImageData, scale: number): void {
  const data = image.data
  const w = store.w
  const h = store.h
  const light = store.light
  const tiles = store.tiles
  const walls = store.walls
  const outW = image.width
  const outH = image.height

  for (let y = 0; y < outH; y++) {
    const ty = Math.min(h - 1, (y / scale) | 0)
    const row = ty * w
    for (let x = 0; x < outW; x++) {
      const tx = Math.min(w - 1, (x / scale) | 0)
      const cell = row + tx
      const o = (y * outW + x) * 4

      // Air in front of nothing is sky: pass the backdrop through untouched.
      if (tiles[cell] === Tile.Air && walls[cell] === Wall.None) {
        data[o + 3] = 0
        continue
      }

      const i3 = cell * 3
      data[o] = clamp255(light[i3] * 255)
      data[o + 1] = clamp255(light[i3 + 1] * 255)
      data[o + 2] = clamp255(light[i3 + 2] * 255)
      data[o + 3] = 255
    }
  }
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

/**
 * Daylight curve for a time of day in [0, 1), 0 = midnight.
 *
 * A plain cosine is wrong at both ends: real dusk is faster than real dawn, and
 * neither is symmetric about the horizon, so the two halves use different exponents.
 */
export function daylightAt(timeOfDay: number): number {
  const t = ((timeOfDay % 1) + 1) % 1
  const dist = Math.abs(t - 0.5) / 0.5 // 0 at noon, 1 at midnight
  const lit = Math.max(0, 1 - dist)
  // Night is dim but not black: 0.14 of daylight still reads as "outdoors at night".
  return 0.14 + 0.86 * Math.pow(lit, 0.6)
}

/**
 * Sky light tint.
 *
 * Daylight is very slightly warm and very slightly under 1 in the blue channel,
 * which is what sunlight actually looks like. Night is cool and blue. The warmth is
 * deliberately small: a stronger cast makes noon look like permanent sunset, which
 * is a mistake this curve made in an earlier revision.
 */
export function skyTintAt(timeOfDay: number): readonly [number, number, number] {
  const d = daylightAt(timeOfDay)
  const night = 1 - d
  return [
    clamp01(0.86 + 0.14 * d),
    clamp01(0.89 + 0.11 * d),
    clamp01(0.96 + 0.04 * d - night * 0.04),
  ]
}

/**
 * Ambient under everything.
 *
 * This is the floor the whole lightmap is compressed into, and it is the single
 * most important number for whether the underground is readable.
 *
 * The composite is a **multiply**, so an ambient of `a` renders an unlit tile at
 * `a × tileColor`. Set it too low and unlit rock becomes a black rectangle — the
 * terrain's silhouette disappears and the whole lower half of the frame reads as a
 * rendering failure rather than as darkness. (An earlier revision used 0.05, which
 * did exactly that.) Set it too high and torches stop mattering.
 *
 * ~0.22 is the balance: unlit dirt lands around `rgb(23,16,11)`, which is clearly
 * dark but still legibly *dirt*, and a torch still transforms a room.
 *
 * The tint is cool because a cave lit only by sky leakage is essentially lit by the
 * blue end of the spectrum, and because a neutral grey ambient makes everything look
 * foggy.
 */
export function ambientAt(timeOfDay: number): readonly [number, number, number] {
  const d = daylightAt(timeOfDay)
  // Slightly brighter at noon: the sky itself is lighting the entrance.
  const lift = 0.05 * d
  return [0.19 + lift, 0.215 + lift, 0.285 + lift]
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * The lightmap source rectangle for the current camera, in lightmap pixels.
 *
 * Everything reduces to one scale factor: the lightmap stores `scale` pixels per
 * tile, a tile is `TILE` world px, so lightmap px per world px is `scale / TILE`.
 * The screen covers `viewW / zoom` world px horizontally.
 */
export function lightCrop(
  camLeft: number,
  camTop: number,
  viewW: number,
  viewH: number,
  scale: number,
  zoom: number
): { x: number; y: number; width: number; height: number } {
  const k = scale / TILE / zoom
  return {
    x: camLeft * k,
    y: camTop * k,
    width: viewW * k,
    height: viewH * k,
  }
}

export { LIGHT_SCALE }
