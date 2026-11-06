/**
 * Every tunable number in the slice lives here, so the simulation can be read
 * without chasing constants through modules.
 */

/** One tile is TILE css pixels wide. */
export const TILE = 16

/** Chunk edge, in tiles. 32 tiles = a 512 px baked surface per chunk. */
export const CHUNK = 32

export const WORLD_W = 384
export const WORLD_H = 128
export const CHUNKS_X = WORLD_W / CHUNK
export const CHUNKS_Y = WORLD_H / CHUNK
export const CHUNK_COUNT = CHUNKS_X * CHUNKS_Y
export const CHUNK_PX = CHUNK * TILE
export const WORLD_PX_W = WORLD_W * TILE
export const WORLD_PX_H = WORLD_H * TILE

/** The simulation runs at a fixed rate; the renderer interpolates. */
export const FIXED_DT = 1 / 60
/** Cap on catch-up steps per frame — without it a long stall becomes a death spiral. */
export const MAX_STEPS = 5

export const GRAVITY = 1500 // px/s²
export const MAX_FALL = 880 // px/s
export const MOVE_SPEED = 190 // px/s
export const MOVE_ACCEL = 1400 // px/s²
export const GROUND_FRICTION = 1800 // px/s²
export const JUMP_SPEED = 420 // px/s

export const PLAYER_W = 12
export const PLAYER_H = 22

/** How far the cursor can reach from the player's centre, in world px. */
export const REACH = TILE * 6.5

/** Player survives this many lava ticks; water only slows. */
export const LAVA_DAMAGE = 0.28
export const WATER_DRAG = 0.55

/** Sky light starts at 1.0 and loses this much per opaque tile. */
export const LIGHT_FALLOFF = 0.14
/** The lightmap keeps LIGHT_SCALE px per tile so the upscale has values to interpolate. */
export const LIGHT_SCALE = 2
/**
 * Propagation stops below this level.
 *
 * Must stay under the ambient floor in `ambientAt`, or light would stop spreading
 * before it reached the level the ambient already establishes — which would make
 * the falloff curve flatten one step too early.
 */
export const LIGHT_FLOOR = 0.02

/** A full day is this many seconds of wall clock, at 1× speed. */
export const DAY_LENGTH = 180

/** Bound on live particles; the pool reuses entries instead of growing. */
export const MAX_PARTICLES = 240
