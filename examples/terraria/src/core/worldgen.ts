/**
 * Deterministic world generation.
 *
 * A pure function of the seed: the same seed produces the same world, tile for
 * tile, so a bug reported against "seed 1234, tile 88,60" is reproducible. Every
 * random draw comes from the seeded PRNG in `rng.ts`, and nothing here reads
 * `Math.random`.
 *
 * ## Layer order
 *
 * The order matters, and it is the order the terrain actually forms in:
 *
 *   1. **altitude** — a broad continental slope plus rolling hills
 *   2. **rock and soil** — dirt to a depth that varies with the surface, then stone
 *   3. **caves** — carved through everything, thinning out near the surface
 *   4. **ore veins** — a biased random walk from a cluster centre, so a vein looks
 *      like a vein and not like static
 *   5. **the deep layer** — ash shelves and lava lakes near the bottom
 *   6. **surface water** — basins only, so a pool cannot run off a hillside
 *   7. **dressing** — grass, sand, flowers, and the trees
 *
 * ## Why the world is wider than it is deep in screen terms
 *
 * `WORLD_H` is 128 tiles, about six screens deep at 720 px. The interesting terrain
 * is the top 70; below that is stone, ore and the lava layer, which exists so mining
 * downward has a destination.
 */

import { TILE, WORLD_H } from './constants'
import { clamp, fbm2, mulberry32, valueNoise2 } from './rng'
import { TileStore, Wall } from './tile-store'
import { Tile, tileIdByKey } from './tile-defs'

export interface WorldGenReport {
  readonly seed: number
  /** Surface altitude per column, in tiles. */
  readonly surface: Int16Array
  readonly spawnX: number
  readonly spawnY: number
  readonly solidTiles: number
  readonly treeCount: number
  readonly elapsedMs: number
}

/** Mean surface row. The world is 128 tall, so this leaves 40+ tiles of sky. */
const SURFACE_BASE = 42
/** Soil depth below the surface row, before stone takes over. */
const SOIL_DEPTH = 8
/** Rows deeper than this can hold lava rather than air in a carved pocket. */
const LAVA_ROW = WORLD_H - 14

/**
 * Fills `store` with a world derived from `seed`.
 *
 * The store is passed **in** rather than created here. An earlier version built its
 * own and returned only a report, which silently discarded the entire world — the
 * simulation then ran against an empty one and the player fell through. Taking the
 * store as a parameter makes the ownership obvious: one store, one world, and the
 * caller is holding it.
 */
export function generateWorld(store: TileStore, seed: number): WorldGenReport {
  const t0 = performance.now()
  const w = store.w
  const h = store.h
  const rand = mulberry32(seed)
  const surface = buildSurface(seed, w)

  // -- 1 + 2. column fill ---------------------------------------------------
  for (let x = 0; x < w; x++) {
    const top = surface[x]
    // Soil depth tapers with altitude: hilltops are thinner than valleys, which
    // is what makes a hillside read as soil over rock.
    const soil = SOIL_DEPTH - Math.round((top - SURFACE_BASE) / 6)
    for (let y = 0; y < h; y++) {
      if (y < top) store.setRaw(x, y, Tile.Air)
      else if (y < top + Math.max(3, soil)) store.setRaw(x, y, Tile.Dirt)
      else store.setRaw(x, y, Tile.Stone)
    }
  }

  // -- 2b. background walls -------------------------------------------------
  // Every cell below the surface gets a wall before the caves are carved, so a
  // carved cell keeps its wall while a cell above the surface never had one. This
  // ordering is what makes a cave read as inside the ground: remove a tile and you
  // see wall, not sky.
  //
  // The bands follow the terrain: soil walls behind the soil, cave walls deeper.
  // A low-frequency flicker roughens the boundary so the transition is not a line.
  for (let x = 0; x < w; x++) {
    const top = surface[x]
    for (let y = top; y < h; y++) {
      const depth = y - top
      const flicker = valueNoise2(x / 13, y / 9, seed + 6607)
      const wall = depth < 5 + flicker * 3 ? Wall.Dirt : depth < 26 ? Wall.Stone : Wall.Cave
      store.setWallRaw(x, y, wall)
    }
  }

  // -- 3. caves -------------------------------------------------------------
  // Two noise fields: a low-frequency one carves broad tunnels, a high-frequency
  // one chews their edges so caves are not blobs. Caves thin out near the surface
  // so the ground does not look perforated from above.
  for (let x = 0; x < w; x++) {
    const top = surface[x]
    for (let y = top + 4; y < h; y++) {
      const tunnel = fbm2(x / 28, y / 19, seed + 4211, 3)
      const detail = valueNoise2(x / 7, y / 7, seed + 8123)
      const depth = clamp((y - top) / 30, 0, 1)
      // Threshold rises with depth, so the near-surface caves are the small ones.
      if (tunnel + detail * 0.34 > 0.34 + depth * 0.06) {
        store.setRaw(x, y, Tile.Air)
      }
    }
  }

  // -- 4. ore veins ---------------------------------------------------------
  const veins: ReadonlyArray<{ tile: number; count: number; size: number; minY: number }> = [
    { tile: Tile.Copper, count: 190, size: 6, minY: 0 },
    { tile: Tile.Iron, count: 140, size: 5, minY: 12 },
    { tile: Tile.Silver, count: 90, size: 4, minY: 34 },
    { tile: Tile.Gold, count: 60, size: 4, minY: 52 },
    { tile: Tile.Gem, count: 30, size: 3, minY: 66 },
  ]

  for (const vein of veins) {
    for (let n = 0; n < vein.count; n++) {
      const cx = 4 + Math.floor(rand() * (w - 8))
      const yLo = Math.max(surface[cx] + 5, vein.minY)
      if (yLo >= h - 4) continue
      const cy = yLo + Math.floor(rand() * (h - 4 - yLo))

      let x = cx
      let y = cy
      for (let s = 0; s < vein.size; s++) {
        // Veins only replace rock. Replacing dirt would put copper in the topsoil,
        // which reads as a bug rather than as a design choice.
        if (store.get(x, y) === Tile.Stone) store.setRaw(x, y, vein.tile)
        x += rand() < 0.5 ? 1 : -1
        y += rand() < 0.5 ? 1 : -1
      }
    }
  }

  // -- 5. the deep layer ----------------------------------------------------
  // Ash shelves the lava so the transition is not a hard colour cut.
  for (let x = 0; x < w; x++) {
    for (let y = LAVA_ROW; y < h; y++) {
      const pocket = valueNoise2(x / 30, y / 9, seed + 3313)
      const current = store.get(x, y)
      if (current === Tile.Air) {
        if (pocket > 0.02 || y >= h - 3) store.setRaw(x, y, Tile.Lava)
        else if (pocket > -0.22) store.setRaw(x, y, Tile.Ash)
      } else if (current === Tile.Stone && pocket > 0.4) {
        store.setRaw(x, y, Tile.Ash)
      }
    }
  }

  // -- 6. surface water -----------------------------------------------------
  // Only genuine basins, or the pool runs off the side of a hill. The rim test is
  // what makes this work: if either neighbour is higher, this is a slope.
  for (let n = 0; n < 6; n++) {
    const cx = 30 + Math.floor(rand() * (w - 60))
    const rim = surface[cx]
    if (rim >= surface[cx - 1] || rim >= surface[cx + 1]) continue
    // Do not flood a spot that already has a tree in it.
    if (store.get(cx, rim - 1) !== Tile.Air) continue

    const span = 2 + Math.floor(rand() * 4)
    const level = rim + 2
    for (let x = cx - span; x <= cx + span; x++) {
      if (x < 0 || x >= w) continue
      if (surface[x] > level) continue
      for (let y = surface[x]; y <= level; y++) {
        if (store.get(x, y) !== Tile.Air && store.get(x, y) !== Tile.Dirt) continue
        store.setRaw(x, y, Tile.Water)
      }
    }
  }

  // -- 7. dressing ----------------------------------------------------------
  // Grass on every exposed soil tile, which is what the atlas reads for its crust.
  for (let x = 0; x < w; x++) {
    const top = surface[x]
    for (let y = Math.max(0, top - 2); y < Math.min(h, top + 4); y++) {
      if (store.get(x, y) !== Tile.Dirt) continue
      const above = store.get(x, y - 1)
      if (above === Tile.Air) store.setRaw(x, y, Tile.Grass)
    }
  }

  // Beaches: low, flat coastline becomes sand so there is a material that is
  // visually distinct from the grass/dirt interior.
  for (let x = 0; x < w; x++) {
    const top = surface[x]
    if (top < SURFACE_BASE + 9) continue
    if (valueNoise2(x / 20, 3, seed + 55) < 0.25) continue
    for (let y = top; y < Math.min(h, top + 5); y++) {
      const current = store.get(x, y)
      if (current === Tile.Grass || current === Tile.Dirt) store.setRaw(x, y, Tile.Sand)
    }
  }

  // -- trees ----------------------------------------------------------------
  let treeCount = 0
  let x = 6
  while (x < w - 6) {
    x += 4 + Math.floor(rand() * 9)
    if (x >= w - 6) break

    // Find the grass row for this column — the surface array can be one off after
    // the beach pass replaced soil with sand.
    let top = -1
    for (let y = surface[x] - 2; y < surface[x] + 6; y++) {
      if (store.get(x, y) === Tile.Grass) {
        top = y
        break
      }
    }
    if (top < 0) continue

    const height = 5 + Math.floor(rand() * 5)
    const canopyY = top - height
    if (canopyY < 6) continue

    // Canopy first, then trunk, so the trunk is never overwritten by a leaf. The
    // canopy is a squashed ellipsoid, and its lower rows are clipped to leave the
    // trunk visible from the ground up.
    const radius = 2 + Math.floor(rand() * 2)
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius - 1; dx <= radius + 1; dx++) {
        const nx = dx / (radius + 1)
        const ny = dy / radius
        if (nx * nx + ny * ny > 1.1) continue
        const tx = x + dx
        const ty = canopyY + dy
        if (!store.inBounds(tx, ty)) continue
        if (store.get(tx, ty) === Tile.Air) store.setRaw(tx, ty, Tile.Leaves)
      }
    }

    for (let i = 0; i < height; i++) {
      store.setRaw(x, top - 1 - i, Tile.Wood)
    }
    treeCount++
  }

  // -- spawn ----------------------------------------------------------------
  // Clear a pocket and stand the player on the ground. Without this the player can
  // spawn inside the terrain and fall out of the world.
  const spawnX = Math.floor(w / 2)
  let spawnY = surface[spawnX]
  for (let y = spawnY - 1; y >= 0; y--) {
    if (store.get(spawnX, y) === Tile.Air) spawnY = y
    else break
  }
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const t = store.get(spawnX + dx, spawnY - dy)
      if (t === Tile.Wood || t === Tile.Leaves) store.setRaw(spawnX + dx, spawnY - dy, Tile.Air)
    }
  }

  store.markAllDirty()

  return {
    seed,
    surface,
    spawnX,
    spawnY,
    solidTiles: store.countSolid(),
    treeCount,
    elapsedMs: performance.now() - t0,
  }
}

/**
 * Surface altitude per column.
 *
 * Three bands at different wavelengths: a continental slope, rolling hills, and a
 * fine ripple. One band alone reads as either a flat plain or a sine wave.
 */
function buildSurface(seed: number, w: number): Int16Array {
  const surface = new Int16Array(w)
  for (let x = 0; x < w; x++) {
    const continental = fbm2(x / 190, 0.5, seed, 3) * 15
    const hills = fbm2(x / 38, 12.5, seed + 977, 3) * 6
    const ripple = valueNoise2(x / 11, 4.5, seed + 2113) * 1.6
    surface[x] = clamp(Math.round(SURFACE_BASE + continental + hills + ripple), 16, 76)
  }
  return surface
}

/** Ground level in world px, for the parallax background. */
export function surfacePx(surface: Int16Array, x: number): number {
  const tx = clamp(Math.round(x / TILE), 0, surface.length - 1)
  return surface[tx] * TILE
}

/** The starter hotbar. Order is the order the number keys select. */
export const PLACEABLE_KEYS = ['dirt', 'stone', 'plank', 'brick', 'glass', 'torch'] as const
export type PlaceableKey = (typeof PLACEABLE_KEYS)[number]

export function placeableId(key: PlaceableKey): number {
  return tileIdByKey(key)
}
