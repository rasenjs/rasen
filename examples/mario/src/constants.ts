/**
 * Game constants
 * The play field is a classic SMB-sized viewport: 256x240 logical pixels,
 * scaled up 3x on screen for a crisp pixel look.
 */

export const TILE = 16

// Viewport (logical pixels)
export const VIEW_W = 256
export const VIEW_H = 240

// Level grid dimensions (in tiles)
export const LEVEL_COLS = 220
export const LEVEL_ROWS = 15
export const LEVEL_W = LEVEL_COLS * TILE

// Physics
export const GRAVITY = 1600 // px/s^2
export const MAX_FALL = 340 // terminal velocity
export const WALK_SPEED = 92
export const RUN_SPEED = 168
export const ACCEL = 420
export const FRICTION = 520
export const JUMP_VEL = -430

// Pool sizes (canvas children are static, so entities live in fixed pools)
export const MAX_GOOMBAS = 20
export const MAX_COINS = 32
export const MAX_BLOCKS = 96
export const MAX_PARTICLES = 16

// Game rules
export const START_TIME = 400
export const START_LIVES = 3
export const START_X = 2 * TILE
export const START_Y = 11 * TILE

// Scoring
export const SCORE_COIN = 200
export const SCORE_BLOCK_COIN = 100
export const SCORE_STOMP = 100
export const SCORE_FLAG = 1000
