/**
 * Particles — short-lived visual effects.
 *
 * `Particle` is a coin popup (bumped out of a `?` block) or a brick shrapnel
 * shard (8x8 quarter-brick with ballistic motion). `ScorePop` is a floating
 * score text. Render components live in this same module.
 *
 * Both particle kinds render through a single `<image>` whose `image` ref is
 * swapped every frame — a conditional component tree would be frozen at
 * mount time (pool slots are created once), so the coin/shrapnel switch must
 * happen inside the reactive binding, not in the JSX structure.
 */

import { com } from '@rasenjs/core'
import { ref } from '@rasenjs/reactive-signals'
import { blankFrame } from './world'

type ParticleKind = 'coin' | 'shrapnel'

/** Minimal tile-bank interface (avoids a circular import with assets). */
interface TileBankLike {
  tile(index: number): HTMLCanvasElement
}

export class Particle {
  // Screen coordinates & refs the renderer consumes
  rx = ref(-1000)
  ry = ref(-1000)
  image = ref<HTMLCanvasElement>(blankFrame)
  opacity = ref(0)

  // World position and behaviour
  active = false
  kind: ParticleKind = 'coin'
  wx = 0
  wy = 0
  vx = 0
  vy = 0
  life = 0
  maxLife = 1
  private coinBase = 15
  private phase = 0
  private bank: TileBankLike

  constructor(bank: TileBankLike) {
    this.bank = bank
  }

  /** Launch a coin popup from a world position (coinBase = theme frame). */
  spawnCoin(x: number, y: number, coinBase: number) {
    this.active = true
    this.kind = 'coin'
    this.wx = x
    this.wy = y
    this.vx = 0
    this.vy = -230
    this.life = 0.6
    this.maxLife = 0.6
    this.coinBase = coinBase
  }

  /** Activate as a brick shard (canvas prepared by the game). */
  spawnShard(
    canvas: HTMLCanvasElement,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ) {
    this.active = true
    this.kind = 'shrapnel'
    this.image.value = canvas
    this.wx = x
    this.wy = y
    this.vx = vx
    this.vy = vy
    this.life = 1.6
    this.maxLife = 1.6
  }

  deactivate() {
    this.active = false
  }

  update(dt: number) {
    if (!this.active) return
    this.vy += 620 * dt
    this.wx += this.vx * dt
    this.wy += this.vy * dt
    this.life -= dt
    if (this.life <= 0) this.active = false
  }

  /** Bake the camera offset into the screen-coordinate refs. */
  syncScreen(cam: number) {
    if (!this.active) {
      this.opacity.value = 0
      return
    }
    this.rx.value = Math.round(this.wx - cam)
    this.ry.value = Math.round(this.wy)
    this.opacity.value = Math.max(0, Math.min(1, this.life / this.maxLife))
    if (this.kind === 'coin') {
      // NES coin spin pulses by shading: bright → mid → dark → mid
      this.phase = Math.floor(this.life * 12) % 4
      const idx = this.coinBase + [0, 16, 32, 16][this.phase]
      this.image.value = this.bank.tile(idx)
    }
  }
}

/** ParticleSprite — one reactive `<image>` for both coin popups and shrapnel. */
export const ParticleSprite = com((props: { particle: Particle }) => {
  const p = props.particle
  return (
    <image image={p.image} x={p.rx} y={p.ry} opacity={p.opacity} />
  )
})

/**
 * ScorePop — floating score text ("100", "200", "1000").
 */
export class ScorePop {
  rx = ref(-1000)
  ry = ref(-1000)
  text = ref('')
  opacity = ref(0)

  active = false
  wx = 0
  wy = 0
  life = 0
  maxLife = 0.9

  spawn(x: number, y: number, text: string) {
    this.active = true
    this.wx = x
    this.wy = y
    this.text.value = text
    this.life = this.maxLife
  }

  deactivate() {
    this.active = false
  }

  update(dt: number) {
    if (!this.active) return
    this.wy -= 30 * dt
    this.life -= dt
    if (this.life <= 0) this.active = false
  }

  syncScreen(cam: number) {
    // inactive slots stay off-screen
    if (!this.active) {
      this.rx.value = -1000
      this.ry.value = -1000
      this.opacity.value = 0
      return
    }
    this.rx.value = Math.round(this.wx - cam)
    this.ry.value = Math.round(this.wy)
    this.opacity.value = Math.max(0, Math.min(1, this.life / this.maxLife))
  }
}

export const ScorePopSprite = com((props: { pop: ScorePop }) => {
  const p = props.pop
  return (
    <text
      text={p.text}
      x={p.rx}
      y={p.ry}
      fill="#fff"
      font="bold 8px monospace"
      opacity={p.opacity}
    />
  )
})
