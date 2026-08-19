/**
 * View2D — the 2D render view (canvas-2d).
 *
 * Renders the game world with the reactive canvas-2d scene tree (tile
 * sprites + pre-rendered static layer + HUD), driven by the same `Game`
 * state that the DOM shell wraps.
 */

import { com, each } from '@rasenjs/core'
import { VIEW_H, VIEW_W } from './constants'
import type { Game } from './game'
import { StaticLayer } from './StaticLayer'
import { Hud } from './Hud'
import { MarioSprite } from './Mario'
import { GoombaSprite } from './Goomba'
import { CoinSprite } from './Coin'
import { BlockSprite } from './Block'
import { ParticleSprite } from './Particle'

const SCALE = 3
const W = VIEW_W * SCALE
const H = VIEW_H * SCALE

/**
 * View2D — renders the game world with the 2D canvas-2d renderer.
 */
export const View2D = com((props: { game: Game }) => {
  const game = props.game
  return (
    <canvas
      width={VIEW_W}
      height={VIEW_H}
      style={{ width: `${W}px`, height: `${H}px`, imageRendering: 'pixelated', display: 'block' }}
    >
      {/* Pre-rendered world (sky + terrain + decorations), camera-offset */}
      <StaticLayer game={game} />
      {/* Dynamic blocks (bricks / ? blocks) */}
      {each(game.blocks, (b) => <BlockSprite block={b} />)}
      {/* Spinning coins */}
      {each(game.coins, (c) => <CoinSprite coin={c} />)}
      {/* Coin popup particles */}
      {each(game.particles, (p) => <ParticleSprite particle={p} />)}
      {/* Goombas */}
      {each(game.goombas, (g) => <GoombaSprite goomba={g} />)}
      {/* Player */}
      <MarioSprite mario={game.mario} />
      {/* HUD (reactive canvas text) */}
      <Hud game={game} />
    </canvas>
  )
})
