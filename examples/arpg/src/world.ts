/**
 * World: the tile map, the baked isometric background, props and path-finding.
 *
 * The map is static, so it is *baked once* into a single offscreen bitmap and
 * then rendered as one `image` node. Forty-four squared tiles would otherwise be
 * ~1900 live canvas nodes for something that never changes — baking is what
 * keeps the per-frame cost proportional to the actors, not to the terrain.
 *
 * Determinism matters for a demo that must look the same twice: every random
 * choice goes through one seeded generator.
 */

import { drawIsoTile, groundColors, type GroundTile, type PropKind } from './sprites'

/**
 * Real terrain art, by tile kind.
 *
 * Several images per kind, not one: a single texture repeated across a 44x44 map
 * reads as an obvious grid, while a few variants interleaved read as ground.
 * Kinds that are absent fall back to flat colour.
 */
export type TerrainArt = Partial<Record<GroundTile, CanvasImageSource[]>>
import { TILE_HEIGHT, TILE_WIDTH } from './iso'
import { dt1FlagIndex } from './d2/dt1'
import { blitIntoPages, packAtlas } from './three-d/tile-atlas'

export interface Tile {
  kind: GroundTile
  walkable: boolean
}

export interface PropPlacement {
  kind: PropKind
  x: number
  y: number
  scale: number
}

export interface WorldMap {
  width: number
  height: number
  tiles: Tile[]
  ground: HTMLCanvasElement
  /**
   * The wall cells, each with its own picture, for the depth sort.
   *
   * A wall has to be drawn before or after a character depending on whether it
   * is nearer the camera, so it cannot live in a single full-canvas bitmap:
   * baking it that way forces one answer for every wall at once, which is why
   * the character came out behind walls it was standing in front of.
   */
  wallCells: WallCell[]
  /**
   * The baked ROOF pass, drawn ABOVE the actors the way the game draws roofs.
   * Same placement as `ground` (groundX/groundY); absent when the area has no
   * roof blocks.
   */
  roof: HTMLCanvasElement
  /** Where the baked bitmap's top-left sits in world-screen coordinates. */
  groundX: number
  groundY: number
  groundWidth: number
  groundHeight: number
  props: PropPlacement[]
  heroStart: { x: number; y: number }
  spawnPoints: Array<{ x: number; y: number }>
  bossSpawn: { x: number; y: number }
  /**
   * The real level this map was built from, when there was one. Movement asks
   * it for the sub-cell under the walker's feet; a generated map has none and
   * falls back to the per-tile bit.
   */
  realLevel: RealLevelGrid | null
}

const MAP_WIDTH = 44
const MAP_HEIGHT = 44
const HALF_W = TILE_WIDTH / 2
const HALF_H = TILE_HEIGHT / 2
/**
 * Slack around the baked map, in pixels.
 *
 * A cell's picture is one cell wide and about one cell tall, so the north-west
 * picture reaches half a cell to the left of its cell's centre and up to a cell
 * above it. Half a cell is therefore the least this can be without slicing the
 * edge tiles, and it is the term the ground bitmap's size adds on every side.
 */
const PADDING = TILE_WIDTH / 2

/** mulberry32 — a tiny deterministic PRNG, so the map is the same every run. */
function createRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The cell a continuous world position is in.
 *
 * A cell's artwork is centred on `toScreen(x, y)` for its integer `(x, y)` — the
 * bake draws it there and the `.ds1` placements put NPCs and props there — so an
 * integer world position IS a cell centre and the owning cell is the nearest
 * integer, not the floor. Using the floor put the collision grid half a tile
 * north-west of the art, which is why walls blocked where they were not drawn.
 */
export function tileAt(map: WorldMap, x: number, y: number): Tile | null {
  const tx = Math.round(x)
  const ty = Math.round(y)
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return null
  return map.tiles[ty * map.width + tx]
}

/** Cells per tile along one axis in the retail 5x5 sub-cell lattice. */
const SUB_CELLS = 5

/** One sub-cell's width in tiles. */
const SUB_CELL_SIZE = 1 / SUB_CELLS

/**
 * May a walker's BODY stand centred here?
 *
 * The original game does not treat a walker as a point: its own path query takes
 * the cell under the feet and requires that cell **and its four orthogonal
 * neighbours** to be free ("玩家占一个十字", `dm_world.c` in the reference port,
 * measured against the retail client). Testing only the centre let the walker
 * half a tile closer to a wall than the game allows, which is what makes a
 * character look like it is standing inside the wall art.
 *
 * The offsets are one SUB-CELL, not one tile: the walker's footprint is what the
 * game measures against the same 5x5 lattice the DT1 flags live in.
 */
export function isWalkableBody(map: WorldMap, x: number, y: number): boolean {
  if (!isWalkable(map, x, y)) return false
  return (
    isWalkable(map, x + SUB_CELL_SIZE, y) &&
    isWalkable(map, x - SUB_CELL_SIZE, y) &&
    isWalkable(map, x, y + SUB_CELL_SIZE) &&
    isWalkable(map, x, y - SUB_CELL_SIZE)
  )
}

/**
 * May a walker stand at this continuous world position?
 *
 * Real retail levels answer per SUB-cell: a wall block denies a strip along one
 * edge of its cell and leaves the cell's centre free, so a centre-only test
 * walks straight through walls. The walker's own sub-cell is the one under the
 * position — the same 5x5 lattice `DT1` flags and `.ds1` object placements use.
 */
export function isWalkable(map: WorldMap, x: number, y: number): boolean {
  const tile = tileAt(map, x, y)
  if (tile?.walkable !== true) return false
  const flagsAt = map.realLevel?.flagsAt
  if (flagsAt === undefined) return true
  const tx = Math.round(x)
  const ty = Math.round(y)
  const flags = flagsAt(tx, ty)
  if (flags === null) return true
  const gx = Math.min(SUB_CELLS - 1, Math.max(0, Math.floor((x - tx + 0.5) * SUB_CELLS)))
  const gy = Math.min(SUB_CELLS - 1, Math.max(0, Math.floor((y - ty + 0.5) * SUB_CELLS)))
  return (flags[dt1FlagIndex(gx, gy)] & 0x01) === 0
}

/**
 * A real level, as a source for the tile grid.
 *
 * Only the shape is taken from it — which cells exist, what they look like and
 * where they block. The DS1 grid is the game's own layout, so the map stops being
 * procedural and becomes the actual area.
 */
export interface RealLevelGrid {
  width: number
  height: number
  /** Ground kind per cell, already mapped from the level's tilesets. */
  kindAt(x: number, y: number): GroundTile | null
  /** Whether a walker may stand on the cell. */
  walkable(x: number, y: number): boolean
  /** Starting position, if the level names one. */
  start?: { x: number; y: number }
  /**
   * The assembled tile picture for a cell, when the level's own DT1 art is
   * available — floors and walls (the ground pass).
   *
   * A DT1 block's picture is not one image: it is sub-tiles composed into a
   * bounding box. Returning a ready bitmap keeps that composition out of the
   * bake loop, which walks thousands of cells.
   */
  artAt?(x: number, y: number): TileArt | null
  /** The cell's WALL picture, drawn above the actors (see `walls`). */
  wallArtAt?(x: number, y: number): TileArt | null
  /** The cell's ROOF picture, which the game draws in a pass above the actors. */
  roofArtAt?(x: number, y: number): TileArt | null
  /**
   * The cell's 5x5 sub-cell collision flags (DT1 flag bytes), when the level has
   * them. The per-tile {@link walkable} bit is only the CENTRE sub-cell's: a
   * retail wall block denies a strip along one EDGE of its cell and leaves the
   * centre free, so a centre-only test lets a walker go straight through a wall.
   */
  flagsAt?(x: number, y: number): Uint8Array | null
}

/**
 * One assembled tile picture with its origin in the 160x80 tile frame (y down
 * from the frame's top edge). The caller anchors by the frame — not by the
 * art's bounding box — because a wall block's art rises above the frame or
 * hangs below it.
 */
/** One cell's wall picture, for the depth-sorted pass. */
export interface WallCell {
  x: number
  y: number
  art: TileArt
}

export interface TileArt {
  /**
   * The surface the picture is on: its own canvas, or a shared atlas page.
   *
   * Wall pictures are packed into a few pages before the area is handed over —
   * see `three-d/tile-atlas.ts` for why a canvas per cell is not affordable.
   */
  canvas: HTMLCanvasElement
  /** Where on {@link canvas} this picture sits, when it is a page. */
  crop?: { x: number; y: number; width: number; height: number }
  frameX: number
  frameY: number
  /**
   * A wall picture's DT1 orientation: which of the tile's four faces it covers.
   *
   * Set on the wall pass only. See `three-d/wall-depth.ts` — it is what decides
   * whether the wall stands in front of the cell's centre or behind it.
   */
  orientation?: number
}

export function generateWorld(
  seed = 20261013,
  terrain: TerrainArt = {},
  realLevel: RealLevelGrid | null = null,
): WorldMap {
  if (realLevel) return worldFromRealLevel(realLevel, seed, terrain)
  const random = createRandom(seed)
  const tiles: Tile[] = new Array(MAP_WIDTH * MAP_HEIGHT)

  const set = (x: number, y: number, kind: GroundTile, walkable = true): void => {
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return
    tiles[y * MAP_WIDTH + x] = { kind, walkable }
  }
  const get = (x: number, y: number): Tile | undefined =>
    x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT
      ? undefined
      : tiles[y * MAP_WIDTH + x]

  // Base field.
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      set(x, y, random() < 0.14 ? 'dirt' : 'grass')
    }
  }

  // A pond in the south-west, with a wobbly edge so it does not read as a circle.
  const pondX = 10
  const pondY = 31
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const dx = (x - pondX) / 6.5
      const dy = (y - pondY) / 4.5
      const d = dx * dx + dy * dy
      if (d < 1 - random() * 0.22) set(x, y, 'water', false)
    }
  }

  // The sanctum: a stone plaza with pillars, in the north-east.
  const plazaX = 31
  const plazaY = 12
  for (let y = plazaY - 6; y <= plazaY + 6; y++) {
    for (let x = plazaX - 7; x <= plazaX + 7; x++) {
      const onEdge = x === plazaX - 7 || x === plazaX + 7 || y === plazaY - 6 || y === plazaY + 6
      if (onEdge) {
        // Broken ring instead of a solid wall: gaps keep the plaza reachable.
        if (random() < 0.25) continue
        set(x, y, 'stone')
      } else {
        set(x, y, random() < 0.1 ? 'dirt' : 'stone')
      }
    }
  }

  // Roads: one from the hero's start to the plaza, one along the south.
  const road = (x0: number, y0: number, x1: number, y1: number, width = 2): void => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps
      const cx = Math.round(x0 + (x1 - x0) * t)
      const cy = Math.round(y0 + (y1 - y0) * t)
      for (let oy = 0; oy < width; oy++) {
        for (let ox = 0; ox < width; ox++) {
          const tile = get(cx + ox, cy + oy)
          if (tile && tile.walkable && tile.kind !== 'stone') set(cx + ox, cy + oy, 'path')
        }
      }
    }
  }
  road(20, 24, 30, 16)
  road(8, 26, 36, 26, 1)

  const heroStart = { x: 20, y: 25 }
  set(heroStart.x, heroStart.y, 'path')

  // Props: trees crowd the outer field, rocks and bones dot the middle, pillars
  // ring the plaza, braziers stand at its gate. All decorative — nothing the
  // player can walk through is also something they can get stuck on.
  const props: PropPlacement[] = []
  const propAt = (kind: PropKind, x: number, y: number, scale = 1): void => {
    props.push({ kind, x, y, scale })
  }

  for (let y = 1; y < MAP_HEIGHT - 1; y++) {
    for (let x = 1; x < MAP_WIDTH - 1; x++) {
      const tile = get(x, y)!
      if (!tile.walkable) continue

      const edge = Math.min(x, y, MAP_WIDTH - 1 - x, MAP_HEIGHT - 1 - y)
      const inPlaza =
        Math.abs(x - plazaX) <= 8 && Math.abs(y - plazaY) <= 7
      const nearStart = Math.abs(x - heroStart.x) < 4 && Math.abs(y - heroStart.y) < 4
      if (nearStart) continue

      if (!inPlaza && tile.kind === 'grass' && random() < (edge < 5 ? 0.32 : 0.06)) {
        propAt(random() < 0.7 ? 'pine' : 'deadTree', x + random() * 0.6, y + random() * 0.6, 0.8 + random() * 0.5)
      } else if (tile.kind === 'stone' && random() < 0.05) {
        propAt('rock', x, y, 0.9 + random() * 0.3)
      } else if (tile.kind === 'dirt' && random() < 0.05) {
        propAt('bones', x, y, 1)
      }
    }
  }

  propAt('brazier', plazaX - 2, plazaY + 5, 1.2)
  propAt('brazier', plazaX + 2, plazaY + 5, 1.2)
  for (const [px, py] of [
    [plazaX - 7, plazaY - 6],
    [plazaX + 7, plazaY - 6],
    [plazaX - 7, plazaY + 6],
    [plazaX + 7, plazaY + 6],
  ]) {
    propAt('pillar', px, py, 1.1)
  }

  const map: WorldMap = {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    tiles,
    ground: document.createElement('canvas'),
    wallCells: [],
    roof: document.createElement('canvas'),
    groundX: 0,
    groundY: 0,
    groundWidth: 0,
    groundHeight: 0,
    props,
    heroStart,
    spawnPoints: [],
    bossSpawn: { x: plazaX, y: plazaY - 2 },
    realLevel: null,
  }

  bakeGround(map, terrain)

  // Spawn candidates: walkable tiles far enough from the start to be a fight,
  // never inside the plaza (the elite lives there).
  for (let y = 2; y < MAP_HEIGHT - 2; y++) {
    for (let x = 2; x < MAP_WIDTH - 2; x++) {
      const tile = get(x, y)
      if (!tile?.walkable || tile.kind === 'water') continue
      const distToStart = Math.hypot(x - heroStart.x, y - heroStart.y)
      const distToPlaza = Math.hypot(x - plazaX, y - plazaY)
      if (distToStart < 8 || distToPlaza < 8) continue
      map.spawnPoints.push({ x, y })
    }
  }

  return map
}

/**
 * Bake every tile into one bitmap.
 *
 * Tiles are painted from the back of the diamond (small `x + y`) forwards, which
 * is what makes the thin south/east lip of a northern tile end up behind its
 * southern neighbour instead of on top of it.
 */
/**
 * Draw one isometric tile's texture.
 *
 * An orthographic projection maps a plane to the screen affinely, so splitting
 * the diamond into two triangles and using an exact affine map per triangle is
 * not an approximation — it is what the projection actually does. (A single
 * affine transform for the whole quad could only ever produce a parallelogram,
 * which is why the split is necessary rather than a shortcut.)
 *
 * Each tile samples its own sub-square of the source image, so a 44×44 map does
 * not show the same 256 px repeated in an obvious grid.
 */
function drawTexturedTile(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  image: CanvasImageSource,
  source: { x: number; y: number; size: number },
): void {
  const hw = TILE_WIDTH / 2
  const hh = TILE_HEIGHT / 2
  const s = source.size
  const sx = source.x
  const sy = source.y

  /**
   * Solve the affine transform taking texture points to screen points.
   * Three correspondences determine the six coefficients uniquely.
   */
  const affine = (
    t0: [number, number], t1: [number, number], t2: [number, number],
    p0: [number, number], p1: [number, number], p2: [number, number],
  ): [number, number, number, number, number, number] => {
    const [u0, v0] = t0
    const [u1, v1] = t1
    const [u2, v2] = t2
    const det = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0)
    if (Math.abs(det) < 1e-9) return [1, 0, 0, 0, 1, 0]
    const a = ((p1[0] - p0[0]) * (v2 - v0) - (p2[0] - p0[0]) * (v1 - v0)) / det
    const b = ((p1[1] - p0[1]) * (v2 - v0) - (p2[1] - p0[1]) * (v1 - v0)) / det
    const c = ((p2[0] - p0[0]) * (u1 - u0) - (p1[0] - p0[0]) * (u2 - u0)) / det
    const d = ((p2[1] - p0[1]) * (u1 - u0) - (p1[1] - p0[1]) * (u2 - u0)) / det
    const e = p0[0] - a * u0 - c * v0
    const f = p0[1] - b * u0 - d * v0
    return [a, b, c, d, e, f]
  }

  const top: [number, number] = [cx, cy - hh]
  const right: [number, number] = [cx + hw, cy]
  const bottom: [number, number] = [cx, cy + hh]
  const left: [number, number] = [cx - hw, cy]

  const origin: [number, number] = [sx, sy]
  const across: [number, number] = [sx + s, sy]
  const down: [number, number] = [sx, sy + s]
  const corner: [number, number] = [sx + s, sy + s]

  // Two triangles; each gets its own exact map.
  const triangles: Array<{ t: [number, number][]; p: [number, number][] }> = [
    { t: [origin, across, corner], p: [top, right, bottom] },
    { t: [origin, corner, down], p: [top, bottom, left] },
  ]

  for (const triangle of triangles) {
    const [a, b, c, d, e, f] = affine(triangle.t[0], triangle.t[1], triangle.t[2], triangle.p[0], triangle.p[1], triangle.p[2])
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(triangle.p[0][0], triangle.p[0][1])
    ctx.lineTo(triangle.p[1][0], triangle.p[1][1])
    ctx.lineTo(triangle.p[2][0], triangle.p[2][1])
    ctx.closePath()
    ctx.clip()
    // Expand the drawn square a hair so the shared diagonal leaves no seam.
    const bleed = 0.5
    ctx.transform(a, b, c, d, e, f)
    ctx.drawImage(
      image,
      sx,
      sy,
      s,
      s,
      sx - bleed / Math.abs(a || 1),
      sy - bleed / Math.abs(d || 1),
      s + bleed * 2,
      s + bleed * 2,
    )
    ctx.restore()
  }
}

/**
 * Draw an assembled DT1 tile at an isometric cell.
 *
 * The placement is the classic one: the picture's bottom-centre sits on the
 * cell's bottom corner, so a wall's base lands on its floor edge and a taller
 * picture grows upward from there.
 *
 * The picture is the art's own bounding box, not the block's declared box: a
 * floor block declares 160x128 but its art is 160x79, so using the declared
 * height would float every tile 49 pixels too high. Measured across all 1,241
 * floor blocks, the art's frame origin *is* the cell's top corner and the art is
 * exactly one cell wide, so the diamond's bottom tip lands on the cell's bottom
 * corner and diagonal neighbours meet with no drift.
 */
function drawTileArt(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  art: TileArt,
): void {
  const width = art.canvas.width
  const height = art.canvas.height
  if (width <= 0 || height <= 0) return

  // Anchor by the TILE FRAME: its top-left is half a tile up-left of the
  // cell's centre, and the art carries where it sits inside that frame. A
  // bounding-box anchor would move walls, whose art extends above the frame
  // (upper walls) or below it (lower walls).
  ctx.drawImage(art.canvas, cx - TILE_WIDTH / 2 + art.frameX, cy - TILE_HEIGHT / 2 + art.frameY)
}

/**
 * Replace the wall cells' per-cell canvases with rectangles into a few atlas
 * pages.
 *
 * A town bakes 380 wall pictures and a dungeon 1,721, each with a canvas of its
 * own, and those canvases are held for as long as the area is loaded. That is the
 * same budget the ground bitmap competes for, and once the page is over it the
 * browser starts returning EMPTY canvases with no error at all. Packing turns
 * hundreds of objects into a handful of pages; the per-cell canvases are dropped
 * as soon as the blit is done.
 */
function packWallArt(cells: WallCell[]): void {
  if (cells.length === 0) return
  const pictures = cells.map((cell) => cell.art.canvas)
  const packed = packAtlas(
    pictures.map((picture) => ({ width: picture.width, height: picture.height })),
  )
  const pages = blitIntoPages(pictures, packed)
  cells.forEach((cell, index) => {
    const rect = packed.rects[index]
    cell.art = {
      canvas: pages[rect.page],
      crop: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      frameX: cell.art.frameX,
      frameY: cell.art.frameY,
      // The face the wall covers must survive packing: it is what places the
      // wall on the right side of its tile in the 3D layer.
      ...(cell.art.orientation !== undefined ? { orientation: cell.art.orientation } : {}),
    }
  })
}

function bakeGround(map: WorldMap, terrain: TerrainArt = {}, realLevel: RealLevelGrid | null = null): void {
  const offsetX = (map.height - 1) * HALF_W + PADDING
  const offsetY = PADDING
  const width = (map.width + map.height) * HALF_W + PADDING
  const height = (map.width + map.height) * HALF_H + PADDING * 2

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(width)
  canvas.height = Math.ceil(height)
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#0b0d12'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // The roof pass: the game draws roofs ABOVE the actors, so they bake to their
  // own bitmap at the same placement instead of into the ground one.
  //
  // Allocated on the FIRST roof cell, because a map bitmap is
  // `(width + height)` wide by half that tall — 84 megapixels for an 80x80
  // dungeon — and a dungeon has no roofs at all. Keeping an all-transparent
  // bitmap that size costs as much as the ground and pushes the page into
  // backing-store eviction, which the browser does SILENTLY: a canvas past the
  // budget simply reads back blank (measured: 7,000 cell-sized canvases, every
  // sample empty, no exception).
  let roofCanvas: HTMLCanvasElement | null = null
  let roofCtx: CanvasRenderingContext2D | null = null
  const roofTarget = (): CanvasRenderingContext2D => {
    if (roofCtx === null) {
      roofCanvas = document.createElement('canvas')
      roofCanvas.width = canvas.width
      roofCanvas.height = canvas.height
      roofCtx = roofCanvas.getContext('2d')!
    }
    return roofCtx
  }
  // Walls are collected per cell rather than baked: see `WorldMap.wallCells`.
  const wallCells: WallCell[] = []

  const random = createRandom(9871)
  for (let sum = 0; sum <= map.width + map.height - 2; sum++) {
    for (let y = Math.max(0, sum - (map.width - 1)); y <= Math.min(sum, map.height - 1); y++) {
      const x = sum - y
      const tile = map.tiles[y * map.width + x]
      if (!tile) continue

      const cx = offsetX + (x - y) * HALF_W
      const cy = offsetY + (x + y) * HALF_H
      const colors = groundColors(tile.kind)

      // Per-tile shade jitter: without it a large field reads as flat paint.
      const jitter = 1 + (random() - 0.5) * 0.12
      // The level's own picture, when there is one. It carries the wall shapes,
      // the corners and the floor transitions that a per-kind texture cannot.
      const roofArt = realLevel?.roofArtAt?.(x, y) ?? null
      if (roofArt) drawTileArt(roofTarget(), cx, cy, roofArt)
      const wallArt = realLevel?.wallArtAt?.(x, y) ?? null
      if (wallArt) wallCells.push({ x, y, art: wallArt })
      const tileArt = realLevel?.artAt?.(x, y) ?? null
      if (tileArt) {
        drawTileArt(ctx, cx, cy, tileArt)
        continue
      }

      const variants = terrain[tile.kind]
      const art = variants && variants.length > 0 ? variants[Math.floor(random() * variants.length)] : undefined
      if (art) {
        // A random 128 px window of the 256 px source, so repeated tiles do not
        // line up into a visible grid.
        const size = 128
        drawTexturedTile(ctx, cx, cy, art, {
          x: Math.floor(random() * (256 - size)),
          y: Math.floor(random() * (256 - size)),
          size,
        })
        // Keep the same per-tile tonal jitter the flat path uses, as a thin
        // overlay — it is what stops a large field reading as one flat sheet.
        ctx.save()
        ctx.globalAlpha = Math.abs(jitter - 1) * 2.2
        drawIsoTile(ctx, cx, cy, jitter > 1 ? '#ffffff' : '#000000', 'rgba(0,0,0,0)', 0)
        ctx.restore()
      } else {
        ctx.save()
        ctx.globalAlpha = 1
        drawIsoTile(ctx, cx, cy, shade(colors.top, jitter), shade(colors.side, jitter), 0)
        ctx.restore()
      }

      if (tile.kind === 'water') {
        ctx.globalAlpha = 0.25 + random() * 0.2
        ctx.beginPath()
        ctx.moveTo(cx - 14, cy - 2)
        ctx.lineTo(cx + 10, cy - 6)
        ctx.strokeStyle = '#8fd0ff'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.globalAlpha = 1
      } else if (tile.kind === 'grass' && random() < 0.25) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)'
        ctx.fillRect(cx - 3, cy - 3, 2, 2)
        ctx.fillRect(cx + 5, cy + 2, 2, 2)
      }
    }
  }

  packWallArt(wallCells)

  map.ground = canvas
  map.roof = roofCanvas ?? document.createElement('canvas')
  map.wallCells = wallCells
  map.groundX = -offsetX
  map.groundY = -offsetY
  map.groundWidth = canvas.width
  map.groundHeight = canvas.height
}

function shade(hex: string, factor: number): string {
  const value = hex.replace('#', '')
  const r = Math.round(Math.min(255, parseInt(value.slice(0, 2), 16) * factor))
  const g = Math.round(Math.min(255, parseInt(value.slice(2, 4), 16) * factor))
  const b = Math.round(Math.min(255, parseInt(value.slice(4, 6), 16) * factor))
  return `rgb(${r},${g},${b})`
}

/** Pick a random spawn tile, avoiding the ones already claimed this wave. */
export function randomSpawnPoint(
  map: WorldMap,
  random: () => number,
  avoid: ReadonlyArray<{ x: number; y: number }> = [],
): { x: number; y: number } {
  const candidates = map.spawnPoints.filter((point) =>
    avoid.every((other) => Math.hypot(point.x - other.x, point.y - other.y) > 2),
  )
  const pool = candidates.length > 0 ? candidates : map.spawnPoints
  return pool[Math.floor(random() * pool.length)] ?? map.heroStart
}

/**
 * Top-down thumbnail of the terrain, as a data URL.
 *
 * One pixel per tile is enough for a HUD minimap and costs nothing: the browser
 * scales it with `image-rendering: pixelated`. Drawing it once at startup beats
 * re-rendering the map into the minimap every frame.
 */
export function createMinimapImage(map: WorldMap): string {
  const canvas = document.createElement('canvas')
  canvas.width = map.width
  canvas.height = map.height
  const ctx = canvas.getContext('2d')!

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.tiles[y * map.width + x]
      const colors = groundColors(tile.kind)
      ctx.fillStyle = colors.top
      ctx.fillRect(x, y, 1, 1)
      if (!tile.walkable) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)'
        ctx.fillRect(x, y, 1, 1)
      }
    }
  }

  return canvas.toDataURL()
}

// ---------------------------------------------------------------------------
// Path-finding
// ---------------------------------------------------------------------------

const NEIGHBOURS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
]

interface HeapNode {
  x: number
  y: number
  priority: number
}

/**
 * A* over the tile grid, 8-directional with corner cutting forbidden.
 *
 * Corner cutting is the one thing that must not be skipped: without it the hero
 * walks diagonally *through* the corner where two walls meet, which looks like
 * a clipping bug in every isometric game that gets it wrong.
 *
 * @returns the tile path excluding the start, or `null` when unreachable.
 */
export function findPath(
  map: WorldMap,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Array<{ x: number; y: number }> | null {
  const sx = Math.floor(from.x)
  const sy = Math.floor(from.y)
  const tx = Math.floor(to.x)
  const ty = Math.floor(to.y)

  if (!isWalkableBody(map, tx, ty)) {
    // Snap the goal to the nearest walkable neighbour so a tap that lands on a
    // tree still walks the player as close as the terrain allows.
    const fallback = nearestWalkable(map, tx, ty, 4)
    if (!fallback) return null
    return findPath(map, from, fallback)
  }
  if (sx === tx && sy === ty) return []

  const size = map.width * map.height
  const gScore = new Float64Array(size).fill(Infinity)
  const cameFrom = new Int32Array(size).fill(-1)
  const closed = new Uint8Array(size)

  const start = sy * map.width + sx
  const goal = ty * map.width + tx
  gScore[start] = 0

  const open: HeapNode[] = [
    { x: sx, y: sy, priority: heuristic(sx, sy, tx, ty) },
  ]

  while (open.length > 0) {
    const current = popHeap(open)
    const currentIndex = current.y * map.width + current.x
    if (currentIndex === goal) return reconstruct(map, cameFrom, goal)
    if (closed[currentIndex]) continue
    closed[currentIndex] = 1

    for (const [dx, dy, cost] of NEIGHBOURS) {
      const nx = current.x + dx
      const ny = current.y + dy
      if (!isWalkableBody(map, nx, ny)) continue
      if (dx !== 0 && dy !== 0) {
        if (!isWalkableBody(map, current.x + dx, current.y)) continue
        if (!isWalkableBody(map, current.x, current.y + dy)) continue
      }

      const neighbour = ny * map.width + nx
      if (closed[neighbour]) continue

      const tentative = gScore[currentIndex] + cost
      if (tentative >= gScore[neighbour]) continue

      gScore[neighbour] = tentative
      cameFrom[neighbour] = currentIndex
      pushHeap(open, {
        x: nx,
        y: ny,
        priority: tentative + heuristic(nx, ny, tx, ty),
      })
    }
  }

  return null
}

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx)
  const dy = Math.abs(ay - by)
  // Octile distance: admissible for 8-way movement with √2 diagonals.
  return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy)
}

function reconstruct(
  map: WorldMap,
  cameFrom: Int32Array,
  goal: number,
): Array<{ x: number; y: number }> {
  const path: Array<{ x: number; y: number }> = []
  let node = goal
  while (node !== -1) {
    path.push({ x: node % map.width, y: Math.floor(node / map.width) })
    node = cameFrom[node]
  }
  path.pop() // drop the start tile
  return path.reverse()
}

export function nearestWalkable(
  map: WorldMap,
  x: number,
  y: number,
  radius: number,
): { x: number; y: number } | null {
  for (let r = 0; r <= radius; r++) {
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue
        if (isWalkableBody(map, x + ox, y + oy)) return { x: x + ox, y: y + oy }
      }
    }
  }
  return null
}

function pushHeap(heap: HeapNode[], node: HeapNode): void {
  heap.push(node)
  let i = heap.length - 1
  while (i > 0) {
    const parent = (i - 1) >> 1
    if (heap[parent].priority <= heap[i].priority) break
    ;[heap[parent], heap[i]] = [heap[i], heap[parent]]
    i = parent
  }
}

function popHeap(heap: HeapNode[]): HeapNode {
  const top = heap[0]
  const last = heap.pop()!
  if (heap.length === 0) return top
  heap[0] = last
  let i = 0
  for (;;) {
    const left = i * 2 + 1
    const right = left + 1
    let smallest = i
    if (left < heap.length && heap[left].priority < heap[smallest].priority) smallest = left
    if (right < heap.length && heap[right].priority < heap[smallest].priority) smallest = right
    if (smallest === i) break
    ;[heap[smallest], heap[i]] = [heap[i], heap[smallest]]
    i = smallest
  }
  return top
}


/**
 * Turn a real level's grid into the map the renderer and pathfinder use.
 *
 * Objects, spawn points and the map bitmap all come from the real layout, so
 * what the player walks on is the actual area rather than a generated field.
 */
function worldFromRealLevel(
  grid: RealLevelGrid,
  seed: number,
  terrain: TerrainArt,
): WorldMap {
  const random = createRandom(seed)
  const tiles: Tile[] = new Array(grid.width * grid.height)

  const spawnPoints: Array<{ x: number; y: number }> = []
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const kind = grid.kindAt(x, y)
      const walk = kind !== null && grid.walkable(x, y)
      tiles[y * grid.width + x] = { kind: kind ?? 'stone', walkable: walk }
      if (walk) spawnPoints.push({ x, y })
    }
  }

  const map: WorldMap = {
    width: grid.width,
    height: grid.height,
    tiles,
    ground: document.createElement('canvas'),
    wallCells: [],
    roof: document.createElement('canvas'),
    groundX: 0,
    groundY: 0,
    groundWidth: 0,
    groundHeight: 0,
    props: [],
    heroStart: grid.start ?? spawnPoints[Math.floor(random() * Math.max(1, spawnPoints.length))] ?? { x: 1, y: 1 },
    spawnPoints,
    bossSpawn: spawnPoints[Math.floor(random() * Math.max(1, spawnPoints.length))] ?? { x: 1, y: 1 },
    realLevel: grid,
  }

  bakeGround(map, terrain, grid)
  return map
}
