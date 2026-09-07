/**
 * Game — orchestrator implementing the `World` interface.
 *
 * Owns the run state (phase / score / lives / time / camera) and coordinates
 * the entity pools. Loads the four Meth Meth Method levels (1-1 … 1-4),
 * drives tile-collision helpers, enemy activation, item spawns, the flag-pole
 * / castle sequence and the win / lose flow.
 */

import { ref } from '@rasenjs/reactive-signals'
import { sfx } from './audio'
import { Bgm } from './bgm'
import type { GameAssets } from './assets'
import { buildStaticLayer } from './assets'
import {
  COINS_PER_LIFE,
  HURRY_TIME,
  MAX_BLOCKS,
  MAX_COINS,
  MAX_GOOMBAS,
  MAX_ITEMS,
  MAX_KOOPAS,
  MAX_PARTICLES,
  SCORE_FLAG_BASE,
  SCORE_FLAG_STEP,
  SCORE_KICK,
  SCORE_STOMP,
  SCORE_TIME_BONUS,
  START_LIVES,
  START_TIME,
  TILE,
  TIME_RATE,
  VIEW_H,
  VIEW_W,
  LEVEL_ROWS,
} from './constants'
import { loadLevelData, levelWorldWidth, type LevelData, type PatternSheet } from './level-data'
import { Input } from './input'
import type { Body, Box, World } from './world'
import { blankFrame, overlap } from './world'
import { Mario } from './Mario'
import { Goomba } from './Goomba'
import { Koopa } from './Koopa'
import { Coin } from './Coin'
import { Block } from './Block'
import { Item } from './Item'
import { Particle, ScorePop } from './Particle'
import { THEME_COIN_BASE, THEME_BLOCK_FRAMES } from './themes'

export type Phase =
  | 'title'
  | 'intro'
  | 'playing'
  | 'dying'
  | 'clear'
  | 'gameover'
  | 'win'

const LEVELS = ['1-1', '1-2', '1-3', '1-4']

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
  worldLabel = ref('1-1')
  hurry = ref(false)
  /** pre-rendered static layer of the current level (swapped on load).
   *  ref() returns a Signal.State — read with .get(), write with .set(). */
  staticLayer = ref<HTMLCanvasElement>(blankFrame)
  /** reactive camera offset for the static layer (negative camX) */
  camRenderX = ref(0)

  // Entities (fixed pools — canvas children mount once)
  mario: Mario
  goombas: Goomba[] = []
  koopas: Koopa[] = []
  coins: Coin[] = []
  blocks: Block[] = []
  items: Item[] = []
  particles: Particle[] = []
  scorePops: ScorePop[] = []

  private blockMap = new Map<string, Block>()
  private patternsCache = new Map<string, PatternSheet>()
  private levels: LevelData[] = []
  private levelIndex = 0
  private timeAcc = 0
  private introTimer = 0
  private deathTimer = 0
  private clearTimer = 0
  private epoch = performance.now()
  private respawn = { x: 0, y: 0 }
  private brickCanvas: HTMLCanvasElement | null = null
  /** background music */
  bgm = new Bgm()

  constructor(
    readonly assets: GameAssets,
    readonly input: Input,
  ) {
    this.mario = new Mario(this)
    for (let i = 0; i < MAX_GOOMBAS; i++) this.goombas.push(new Goomba(this))
    for (let i = 0; i < MAX_KOOPAS; i++) this.koopas.push(new Koopa(this))
    for (let i = 0; i < MAX_COINS; i++) this.coins.push(new Coin(this))
    for (let i = 0; i < MAX_BLOCKS; i++) this.blocks.push(new Block(this))
    for (let i = 0; i < MAX_ITEMS; i++) this.items.push(new Item(this))
    for (let i = 0; i < MAX_PARTICLES; i++) this.particles.push(new Particle(assets.tileBank))
    for (let i = 0; i < 8; i++) this.scorePops.push(new ScorePop())
  }

  /** Preload all level data (called once at boot). */
  async preload(): Promise<void> {
    for (const name of LEVELS) {
      this.levels.push(await loadLevelData(name, this.patternsCache))
    }
    this.loadLevel(0, true)
  }

  // ── World interface ────────────────────────────────────────────────────

  get clock(): number {
    return (performance.now() - this.epoch) / 1000
  }

  get level(): LevelData {
    return this.levels[this.levelIndex]
  }

  solidAt(tx: number, ty: number): boolean {
    const lvl = this.level
    if (ty < 0 || ty >= LEVEL_ROWS) return false
    if (tx < 0) return false // left world border blocks
    if (tx >= lvl.cols) return false
    return lvl.solid[ty][tx] || false
  }

  lavaOverlap(e: Body): boolean {
    const lvl = this.level
    const left = Math.floor(e.wx / TILE)
    const right = Math.floor((e.wx + e.w - 0.001) / TILE)
    const top = Math.floor(e.wy / TILE)
    const bottom = Math.floor((e.wy + e.h - 0.001) / TILE)
    for (let ty = top; ty <= bottom; ty++) {
      for (let tx = left; tx <= right; tx++) {
        if (ty < 0 || ty >= LEVEL_ROWS || tx < 0 || tx >= lvl.cols) continue
        if (lvl.lava[ty][tx]) return true
      }
    }
    return false
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

  bumpAt(tx: number, ty: number, brickBreakable: boolean): void {
    const b = this.blockMap.get(`${tx},${ty}`)
    b?.bump(brickBreakable)
    // Classic SMB: bumping a block interacts with whatever stands on it —
    // enemies flip and die, walking items reverse direction.
    this.bumpBounce(tx, ty)
  }

  /** Enemies/items resting exactly on the bumped cell get bounced. */
  private bumpBounce(tx: number, ty: number): void {
    const left = tx * TILE
    const top = ty * TILE
    const standingOn = (e: Box): boolean => {
      const feet = e.wy + e.h
      const onTop = feet >= top - 2 && feet <= top + 4
      const overlapsX = e.wx + e.w > left && e.wx < left + TILE
      return onTop && overlapsX
    }

    for (const g of this.goombas) {
      if (!g.active || g.dead) continue
      if (standingOn(g)) {
        g.flipKill()
        this.addScore(SCORE_STOMP)
        this.spawnScorePop(g.wx, g.wy, String(SCORE_STOMP))
        sfx.stomp()
      }
    }
    for (const k of this.koopas) {
      if (!k.active || k.dead) continue
      if (standingOn(k)) {
        k.flipKill()
        this.addScore(SCORE_STOMP)
        this.spawnScorePop(k.wx, k.wy, String(SCORE_STOMP))
        sfx.stomp()
      }
    }
    for (const it of this.items) {
      if (!it.active || it.emerging) continue
      if (standingOn(it) && it.vx !== 0) {
        it.vx = -it.vx // mushroom reverses direction
      }
    }
  }

  brickBroken(tx: number, ty: number): void {
    this.level.solid[ty][tx] = false
  }

  addCoin(score: number): void {
    this.score.value += score
    this.coinCount.value++
    if (this.coinCount.value >= COINS_PER_LIFE) {
      this.coinCount.value -= COINS_PER_LIFE
      this.addLife()
    }
  }

  addScore(score: number): void {
    this.score.value += score
  }

  addLife(): void {
    this.lives.value++
    sfx.oneUp()
  }

  spawnCoinParticle(x: number, y: number): void {
    const pt = this.particles.find((p) => !p.active)
    pt?.spawnCoin(x, y, THEME_COIN_BASE[this.level.theme])
  }

  spawnShrapnel(tx: number, ty: number): void {
    if (!this.brickCanvas) {
      const F = THEME_BLOCK_FRAMES[this.level.theme]
      const brick = this.assets.tileBank.tile(F.brick)
      const c = document.createElement('canvas')
      c.width = 8
      c.height = 8
      c.getContext('2d')!.drawImage(brick, 0, 0, 8, 8, 0, 0, 8, 8)
      this.brickCanvas = c
    }
    const cx = tx * TILE + 4
    const cy = ty * TILE + 4
    const specs = [
      { vx: -45, vy: -220 },
      { vx: 45, vy: -220 },
      { vx: -60, vy: -130 },
      { vx: 60, vy: -130 },
    ]
    for (const s of specs) {
      const pt = this.particles.find((p) => !p.active)
      pt?.spawnShard(this.brickCanvas, cx, cy, s.vx, s.vy)
    }
  }

  spawnScorePop(x: number, y: number, text: string): void {
    this.scorePops.find((p) => !p.active)?.spawn(x, y, text)
  }

  spawnItemFromBlock(tx: number, ty: number): void {
    const kind = this.mario.power >= 1 ? 'flower' : 'mushroom'
    this.items.find((i) => !i.active)?.spawn(tx, ty, kind)
  }

  killPlayer(): void {
    if (this.mario.invincible > 0 || this.phase.value !== 'playing') return
    this.lives.value--
    this.phase.value = 'dying'
    this.deathTimer = 0
    this.mario.kill()
    this.bgm.playOnce('die')
    sfx.death()
  }

  flagPole(): { tx: number; tyTop: number; baseY: number } | null {
    return this.level.flag
  }

  /** Small HUD coin icon (overworld coin frame). */
  coinIcon(): HTMLCanvasElement {
    return this.assets.tileBank.tile(15) // [15,0]
  }

  reachGoal(): void {
    if (this.phase.value !== 'playing') return
    // exit pipe (1-2) / toad (1-4)
    sfx.pipe()
    this.finishLevel()
  }

  castleEntered(): void {
    if (this.phase.value !== 'playing') return
    this.finishLevel()
  }

  // ── Level setup ────────────────────────────────────────────────────────

  private loadLevel(index: number, fromCheckpoint = false) {
    this.levelIndex = index
    const lvl = this.level
    this.worldLabel.value = LEVELS[index]
    this.staticLayer.set(buildStaticLayer(this.assets.tileBank, lvl))
    this.brickCanvas = null

    // Player spawn: checkpoint or level start
    const cp = fromCheckpoint ? this.bestCheckpoint(lvl) : null
    this.respawn = cp ? { x: cp.x, y: cp.y } : { x: 2 * TILE, y: 11 * TILE }
    this.mario.reset(this.respawn.x, this.respawn.y - 16)

    // Enemies (positions from level data, px)
    let gi = 0
    let ki = 0
    for (const e of lvl.enemies) {
      if (e.kind === 'goomba') {
        const g = this.goombas[gi++]
        if (g) {
          g.blue = e.palette === 'blue'
          g.spawn(e.x, e.y)
        }
      } else {
        const k = this.koopas[ki++]
        if (k) k.spawn(e.x, e.y, e.palette === 'blue' ? 'blue' : 'green')
      }
    }
    for (; gi < this.goombas.length; gi++) this.goombas[gi].deactivate()
    for (; ki < this.koopas.length; ki++) this.koopas[ki].deactivate()

    // Coins
    this.coins.forEach((c, i) => {
      const pos = lvl.coins[i]
      if (pos) c.spawn(pos.tx, pos.ty, THEME_COIN_BASE[lvl.theme])
      else c.deactivate()
    })

    // Blocks
    this.blockMap.clear()
    this.blocks.forEach((b, i) => {
      const def = lvl.blocks[i]
      if (def) {
        b.init(def)
        this.blockMap.set(`${def.tx},${def.ty}`, b)
        lvl.solid[def.ty][def.tx] = true
      } else {
        b.deactivate()
      }
    })

    this.items.forEach((i) => i.deactivate())
    this.particles.forEach((p) => p.deactivate())
    this.scorePops.forEach((p) => p.deactivate())

    this.timeLeft.value = START_TIME
    this.hurry.value = false
    this.timeAcc = 0
    this.camX.value = 0

    this.syncScreen()
  }

  private bestCheckpoint(lvl: LevelData): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null
    for (const cp of lvl.checkpoints) {
      if (cp.x <= this.mario.wx && (!best || cp.x > best.x)) best = cp
    }
    return best
  }

  private resetRun() {
    this.score.value = 0
    this.coinCount.value = 0
    this.lives.value = START_LIVES
    this.loadLevel(0)
  }

  startGame() {
    this.resetRun()
    this.beginIntro()
  }

  private beginIntro() {
    this.phase.value = 'intro'
    this.introTimer = 0
  }

  // ── Main update ────────────────────────────────────────────────────────

  update(dt: number) {
    switch (this.phase.value) {
      case 'title':
        this.bgm.stop()
        break
      case 'intro':
        this.introTimer += dt
        if (this.introTimer > 2) {
          this.phase.value = 'playing'
          this.bgm.playTheme(this.level.theme, this.hurry.value)
        }
        this.syncScreen()
        break
      case 'playing':
        this.updatePlaying(dt)
        break
      case 'dying':
        this.updateDying(dt)
        break
      case 'clear':
        this.updateClear(dt)
        break
      case 'gameover':
      case 'win':
        break
    }
  }

  private updatePlaying(dt: number) {
    const mario = this.mario

    // Level timer (SMB ticks faster than real seconds)
    this.timeAcc += dt * TIME_RATE
    while (this.timeAcc >= 1) {
      this.timeAcc -= 1
      this.timeLeft.value--
      if (this.timeLeft.value === HURRY_TIME) {
        this.hurry.value = true
        sfx.hurry()
        this.bgm.hurry(this.level.theme)
      }
      if (this.timeLeft.value <= 0) {
        this.timeLeft.value = 0
        this.killPlayer()
        return
      }
    }

    if (mario.state === 'normal') {
      mario.update(dt)

      // Flag pole
      const flag = this.level.flag
      if (flag && mario.wx + mario.w >= flag.tx * TILE + 6) {
        const row = Math.floor((mario.wy + mario.h) / TILE)
        const height = Math.max(0, flag.baseY - row)
        this.addScore(SCORE_FLAG_BASE + height * SCORE_FLAG_STEP)
        mario.startPoleSlide(flag.tx)
      }

      // Exit-pipe / toad goal (levels without a flag)
      const goalX = this.level.goalX
      if (!flag && goalX !== null && mario.wx + mario.w >= goalX * TILE) {
        this.reachGoal()
        return
      }
    } else {
      // pole slide / castle walk
      mario.updateSequence(dt)

      // walk into the castle door
      const castleX = this.level.castleX
      if (mario.state === 'clear' && castleX !== null && mario.wx >= castleX * TILE + 24) {
        this.castleEntered()
        return
      }
    }

    // Coins — spin + collect
    for (const c of this.coins) {
      c.update(dt)
      if (c.overlapsPlayer(mario)) {
        c.deactivate()
        this.addCoin(200)
        sfx.coin()
      }
    }

    // Items — emerge, walk, collect
    for (const it of this.items) {
      it.update(dt)
      if (it.overlapsPlayer(mario)) {
        it.deactivate()
        if (it.kind === 'mushroom') {
          mario.grow()
          this.spawnScorePop(it.wx, it.wy, '1000')
        } else {
          this.addScore(1000)
          this.spawnScorePop(it.wx, it.wy, '1000')
        }
        sfx.powerupConsume()
      }
    }

    // Blocks — bump animation + `?` spin
    for (const b of this.blocks) b.update(dt)

    // Particles & score pops
    for (const p of this.particles) p.update(dt)
    for (const p of this.scorePops) p.update(dt)

    // Enemies — patrol / shells
    for (const g of this.goombas) {
      this.activateNearby(g)
      g.update(dt)
    }
    for (const k of this.koopas) {
      this.activateNearbyKoopa(k)
      k.update(dt)
    }

    // Moving shells kill other enemies
    for (const k of this.koopas) {
      if (!k.active || !k.moving) continue
      for (const g of this.goombas) {
        if (g.active && !g.dead && overlap(k, g)) {
          g.flipKill()
          this.addScore(SCORE_KICK)
          this.spawnScorePop(g.wx, g.wy, String(SCORE_KICK))
        }
      }
      for (const k2 of this.koopas) {
        if (k2 !== k && k2.active && !k2.dead && overlap(k, k2)) {
          k2.flipKill()
          this.addScore(SCORE_KICK)
        }
      }
    }

    // Player vs goombas
    for (const g of this.goombas) {
      const result = g.onPlayerCollision(mario)
      if (result === 'stomped') {
        mario.vy = -220
        this.addScore(SCORE_STOMP)
        this.spawnScorePop(g.wx, g.wy, String(SCORE_STOMP))
        sfx.stomp()
      } else if (result === 'killed-player') {
        this.hitPlayer()
        if (this.phase.value !== 'playing') return
      }
    }

    // Player vs koopas
    for (const k of this.koopas) {
      const result = k.onPlayerCollision(mario)
      if (result === 'stomped') {
        mario.vy = -220
        this.addScore(SCORE_STOMP)
        this.spawnScorePop(k.wx, k.wy, String(SCORE_STOMP))
        sfx.stomp()
      } else if (result === 'kicked') {
        this.addScore(SCORE_KICK)
        sfx.kick()
      } else if (result === 'killed-player') {
        this.hitPlayer()
        if (this.phase.value !== 'playing') return
      }
    }

    // Fell into a pit
    if (mario.wy > VIEW_H + 40) {
      this.killPlayer()
      return
    }

    // Camera — forward only, classic SMB
    const maxCam = levelWorldWidth(this.level) - VIEW_W
    const target = clamp(mario.wx - 100, 0, Math.max(0, maxCam))
    if (target > this.camX.value) this.camX.value = target

    this.syncScreen()
  }

  /** Shrink the player if large, kill otherwise. */
  private hitPlayer() {
    if (this.mario.invincible > 0) return
    if (this.mario.shrink()) {
      sfx.pipe()
    } else {
      this.killPlayer()
    }
  }

  private activateNearby(g: Goomba) {
    if (g.spawned && !g.active && g.wx < this.camX.value + VIEW_W + 64) {
      g.activate()
    }
  }

  private activateNearbyKoopa(k: Koopa) {
    if (k.spawned && !k.active && k.wx < this.camX.value + VIEW_W + 64) {
      k.activate()
    }
  }

  private finishLevel() {
    this.phase.value = 'clear'
    this.clearTimer = 0
    this.addScore(this.timeLeft.value * SCORE_TIME_BONUS)
    this.bgm.playOnce('clear')
    sfx.levelClear()
  }

  private updateClear(dt: number) {
    this.clearTimer += dt
    // keep entities animating
    for (const b of this.blocks) b.update(dt)
    for (const p of this.particles) p.update(dt)
    for (const p of this.scorePops) p.update(dt)
    this.syncScreen()

    if (this.clearTimer > 2.4) {
      if (this.levelIndex >= LEVELS.length - 1) {
        this.phase.value = 'win'
        this.bgm.stop()
        sfx.win()
      } else {
        this.loadLevel(this.levelIndex + 1)
        this.beginIntro()
      }
    }
  }

  private updateDying(dt: number) {
    this.deathTimer += dt
    this.mario.updateDeath(dt)
    this.syncScreen()

    if (this.deathTimer > 2.8) {
      if (this.lives.value <= 0) {
        this.phase.value = 'gameover'
        this.bgm.playOnce('gameover')
      } else {
        this.loadLevel(this.levelIndex, true)
        this.beginIntro()
      }
    }
  }

  /** Bake the camera offset into every entity's screen refs. */
  private syncScreen() {
    const cam = this.camX.value
    this.camRenderX.set(-cam)
    this.mario.syncScreen(cam)
    for (const g of this.goombas) g.syncScreen(cam)
    for (const k of this.koopas) k.syncScreen(cam)
    for (const c of this.coins) c.syncScreen(cam)
    for (const b of this.blocks) b.syncScreen(cam)
    for (const i of this.items) i.syncScreen(cam)
    for (const p of this.particles) p.syncScreen(cam)
    for (const p of this.scorePops) p.syncScreen(cam)
  }
}
