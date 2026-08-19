/**
 * Game — orchestrator implementing the `World` interface.
 *
 * Owns the run state (phase / score / lives / time / camera) and coordinates
 * the entity objects. Each entity class (Mario, Goomba, Coin, Block,
 * Particle) encapsulates its own behaviour and renders itself via `render()`.
 * The game only wires them together, drives the shared tile-collision helpers
 * and applies cross-entity side effects (score, sound, win/lose).
 */

import { ref } from '@rasenjs/reactive-signals'
import type { GameAssets } from './assets'
import {
  LEVEL_COLS,
  LEVEL_ROWS,
  LEVEL_W,
  MAX_BLOCKS,
  MAX_COINS,
  MAX_GOOMBAS,
  MAX_PARTICLES,
  SCORE_COIN,
  SCORE_FLAG,
  SCORE_STOMP,
  START_LIVES,
  START_TIME,
  TILE,
  VIEW_H,
  VIEW_W,
} from './constants'
import { sfx } from './audio'
import { Input } from './input'
import type { Body, World } from './world'
import { Mario } from './Mario'
import { Goomba } from './Goomba'
import { Coin } from './Coin'
import { Block } from './Block'
import { Particle } from './Particle'

export type Phase = 'title' | 'playing' | 'dead' | 'gameover' | 'win'

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v

export class Game implements World {
  // Reactive run state
  phase = ref<Phase>('title')
  score = ref(0)
  coinCount = ref(0)
  timeLeft = ref(START_TIME)
  lives = ref(START_LIVES)
  camX = ref(0)

  // Entities (fixed pools — canvas children mount once)
  mario: Mario
  goombas: Goomba[] = []
  coins: Coin[] = []
  blocks: Block[] = []
  particles: Particle[] = []

  private blockMap = new Map<string, Block>()
  private timeAcc = 0
  private deathTimer = 0
  private won = false
  private epoch = performance.now()

  constructor(
    readonly assets: GameAssets,
    readonly input: Input,
  ) {
    this.mario = new Mario(this)
    for (let i = 0; i < MAX_GOOMBAS; i++) this.goombas.push(new Goomba(this))
    for (let i = 0; i < MAX_COINS; i++) this.coins.push(new Coin(this))
    for (let i = 0; i < MAX_BLOCKS; i++) this.blocks.push(new Block(this))
    for (let i = 0; i < MAX_PARTICLES; i++) this.particles.push(new Particle(this))
    this.resetLevel()
  }

  // ── World interface ────────────────────────────────────────────────────

  get clock(): number {
    return (performance.now() - this.epoch) / 1000
  }

  solidAt(tx: number, ty: number): boolean {
    if (tx < 0 || tx >= LEVEL_COLS) return false
    if (ty < 0 || ty >= LEVEL_ROWS) return false
    return this.assets.level.solid[ty][tx]
  }

  collideX(e: Body): boolean {
    const left = Math.floor(e.wx / TILE)
    const right = Math.floor((e.wx + e.w - 0.001) / TILE)
    const top = Math.floor(e.wy / TILE)
    const bottom = Math.floor((e.wy + e.h - 0.001) / TILE)
    for (let ty = top; ty <= bottom; ty++) {
      for (let tx = left; tx <= right; tx++) {
        if (!this.solidAt(tx, ty)) continue
        if (e.vx > 0) e.wx = tx * TILE - e.w
        else if (e.vx < 0) e.wx = (tx + 1) * TILE
        return true
      }
    }
    return false
  }

  collideY(e: Body): { tx: number; ty: number } | null {
    const left = Math.floor(e.wx / TILE)
    const right = Math.floor((e.wx + e.w - 0.001) / TILE)
    const top = Math.floor(e.wy / TILE)
    const bottom = Math.floor((e.wy + e.h - 0.001) / TILE)
    for (let ty = top; ty <= bottom; ty++) {
      for (let tx = left; tx <= right; tx++) {
        if (!this.solidAt(tx, ty)) continue
        if ((e.vy ?? 0) > 0) {
          e.wy = ty * TILE - e.h
          e.grounded = true
          e.vy = 0
        } else if ((e.vy ?? 0) < 0) {
          e.wy = (ty + 1) * TILE
          return { tx, ty }
        }
        return null
      }
    }
    return null
  }

  groundAhead(e: Body): boolean {
    const aheadX = e.vx > 0 ? e.wx + e.w + 1 : e.wx - 1
    const footY = e.wy + e.h + 1
    return this.solidAt(Math.floor(aheadX / TILE), Math.floor(footY / TILE))
  }

  bumpAt(tx: number, ty: number): void {
    const b = this.blockMap.get(`${tx},${ty}`)
    b?.bump()
  }

  addCoin(score: number): void {
    this.score.value += score
    this.coinCount.value++
  }

  spawnCoinParticle(x: number, y: number): void {
    const pt = this.particles.find((p) => !p.active)
    pt?.spawn(x, y)
  }

  killPlayer(): void {
    this.lives.value--
    this.phase.value = 'dead'
    this.deathTimer = 0
    this.mario.kill()
    sfx.death()
  }

  // ── Setup ──────────────────────────────────────────────────────────────

  /** Rebuild level entities and reset the player. */
  resetLevel() {
    const { level } = this.assets

    this.mario.reset()

    this.goombas.forEach((g, i) => {
      const spawn = level.goombas[i]
      if (spawn) g.spawn(spawn.tx, spawn.ty)
      else g.deactivate()
    })

    this.coins.forEach((c, i) => {
      const pos = level.coins[i]
      if (pos) c.spawn(pos.tx, pos.ty)
      else c.deactivate()
    })

    this.blockMap.clear()
    this.blocks.forEach((b, i) => {
      const def = level.blocks[i]
      if (def) {
        b.init(def.tx, def.ty, def.type)
        this.blockMap.set(`${def.tx},${def.ty}`, b)
      } else {
        b.deactivate()
      }
    })

    this.particles.forEach((p) => p.deactivate())

    this.timeLeft.value = START_TIME
    this.timeAcc = 0
    this.won = false
    this.camX.value = 0

    this.syncScreen()
  }

  startGame() {
    this.score.value = 0
    this.coinCount.value = 0
    this.lives.value = START_LIVES
    this.resetLevel()
    this.phase.value = 'playing'
  }

  restart() {
    this.startGame()
  }

  // ── Game loop ──────────────────────────────────────────────────────────

  update(dt: number) {
    switch (this.phase.value) {
      case 'title':
        if (this.input.consumeJump()) this.startGame()
        break
      case 'playing':
        this.updatePlaying(dt)
        break
      case 'dead':
        this.updateDeath(dt)
        break
      case 'gameover':
      case 'win':
        if (this.input.consumeJump()) this.restart()
        break
    }
  }

  private updatePlaying(dt: number) {
    const mario = this.mario

    // Level timer
    this.timeAcc += dt
    if (this.timeAcc >= 1) {
      this.timeAcc -= 1
      this.timeLeft.value--
      if (this.timeLeft.value <= 0) {
        this.timeLeft.value = 0
        this.killPlayer()
        return
      }
    }

    // Player
    mario.update(dt)

    // Coins — spin + collect
    for (const c of this.coins) {
      c.update(dt)
      if (c.overlapsPlayer(mario)) {
        c.deactivate()
        this.addCoin(SCORE_COIN)
        sfx.coin()
      }
    }

    // Blocks — bump animation + `?` spin
    for (const b of this.blocks) b.update(dt)

    // Particles — coin popups
    for (const p of this.particles) p.update(dt)

    // Goombas — patrol
    for (const g of this.goombas) g.update(dt)

    // Player vs goombas
    for (const g of this.goombas) {
      const result = g.onPlayerCollision(mario)
      if (result === 'stomped') {
        mario.bounce()
        this.score.value += SCORE_STOMP
        sfx.stomp()
      } else if (result === 'killed-player') {
        this.killPlayer()
        return
      }
    }

    // Fell into a pit
    if (mario.wy > VIEW_H + 40) {
      this.killPlayer()
      return
    }

    // Reached the flag pole
    if (!this.won && mario.wx + mario.w >= this.assets.level.flagX) {
      this.won = true
      this.score.value += SCORE_FLAG
      this.phase.value = 'win'
      sfx.win()
      return
    }

    // Camera — bidirectional, smooth follow
    const maxCam = LEVEL_W - VIEW_W
    const target = clamp(mario.wx - 100, 0, maxCam)
    const cam = this.camX.value
    const nextCam = cam + (target - cam) * Math.min(1, 8 * dt)
    if (Math.abs(nextCam - cam) > 0.05) this.camX.value = nextCam

    this.syncScreen()
  }

  private updateDeath(dt: number) {
    this.deathTimer += dt
    this.mario.updateDeath(dt)
    this.syncScreen()

    if (this.deathTimer > 1.9) {
      if (this.lives.value <= 0) {
        this.phase.value = 'gameover'
      } else {
        this.resetLevel()
        this.phase.value = 'playing'
      }
    }
  }

  /** Bake the camera offset into every entity's screen refs. */
  private syncScreen() {
    const cam = this.camX.value
    this.mario.syncScreen(cam)
    for (const g of this.goombas) g.syncScreen(cam)
    for (const c of this.coins) c.syncScreen(cam)
    for (const b of this.blocks) b.syncScreen(cam)
    for (const p of this.particles) p.syncScreen(cam)
  }
}
