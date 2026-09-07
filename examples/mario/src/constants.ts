/**
 * Game constants
 * The play field is a classic SMB-sized viewport: 256x240 logical pixels,
 * scaled up 3x on screen for a crisp pixel look. Level grids come from the
 * Meth Meth Method level data (15 rows, ~212 cols per world).
 */

export const TILE = 16

// Viewport (logical pixels)
export const VIEW_W = 256
export const VIEW_H = 240

// Level grid dimensions (in tiles)
export const LEVEL_ROWS = 15

// Sprite sheet grid
export const SPRITE_GRID_COLUMNS = 16

// Physics (px/s, tuned to feel like SMB)
export const WALK_SPEED = 90
export const RUN_SPEED = 150
export const ACCEL = 420
export const FRICTION = 520
export const SKID_DECEL = 840
export const JUMP_VEL = -400
export const JUMP_VEL_RUN = -430
export const GRAVITY_HOLD = 1150 // while jump held & rising
export const GRAVITY = 2100
export const MAX_FALL = 330

// Enemy / item speeds
export const ENEMY_SPEED = 28
export const SHELL_SPEED = 170
export const ITEM_SPEED = 45

// Pool sizes (canvas children are static, so entities live in fixed pools)
export const MAX_GOOMBAS = 32
export const MAX_KOOPAS = 12
export const MAX_COINS = 64
export const MAX_BLOCKS = 176
export const MAX_PARTICLES = 40
export const MAX_ITEMS = 6

// Game rules
export const START_TIME = 400
export const TIME_RATE = 2.5 // game-time units per real second
export const HURRY_TIME = 100
export const START_LIVES = 3
export const COINS_PER_LIFE = 100

// Scoring
export const SCORE_COIN = 200
export const SCORE_BLOCK_COIN = 200
export const SCORE_STOMP = 100
export const SCORE_KICK = 400
export const SCORE_BRICK = 50
export const SCORE_POWERUP = 1000
export const SCORE_FLAG_BASE = 400
export const SCORE_FLAG_STEP = 400
export const SCORE_TIME_BONUS = 50
