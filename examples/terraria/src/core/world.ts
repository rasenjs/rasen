/**
 * The simulation, and the frame-boundary bridge to the reactive shell.
 *
 * ## The boundary
 *
 * Everything above this file (the scene tree, the HUD, the interface panels) is
 * reactive. Everything below it (tile storage, collision, mining, combat, enemy AI,
 * lighting) is not, and deliberately so: a 384 × 128 world mutates thousands of tiles
 * per second, and putting a dependency edge on each cell would cost more than the
 * rendering it saved.
 *
 * The two halves meet at a small number of `ref`s, written once per tick at the end
 * of `step()`. That is the **entire** contract between them — there is no renderer
 * API to call and no draw list to hand over. See `README.md`.
 *
 * ## Game loop
 *
 * `tick()` is a fixed 1/60 s step driven by `main.tsx`'s accumulator. The order
 * inside it matters:
 *
 *   1. **intent** — read what the player asked for this tick
 *   2. **player** — movement, then the item in hand
 *   3. **enemies** — AI, movement, and the damage they deal on contact
 *   4. **drops and particles** — physics, then pickup
 *   5. **camera** — follows the player, clamped to the world
 *   6. **draw list** — cull, sort, publish
 *
 * The draw list is built *last* and from the state the tick just finished producing,
 * so a frame can never show a half-updated world.
 */

import { ref, type SignalRef } from '@rasenjs/reactive-signals'
import {
  CHUNK,
  CHUNKS_X,
  CHUNKS_Y,
  DAY_LENGTH,
  FIXED_DT,
  GROUND_FRICTION,
  JUMP_SPEED,
  LAVA_DAMAGE,
  MAX_FALL,
  MAX_PARTICLES,
  MOVE_ACCEL,
  MOVE_SPEED,
  PLAYER_H,
  PLAYER_W,
  REACH,
  TILE,
  WORLD_PX_H,
  WORLD_PX_W,
  WORLD_W,
} from './constants'
import { liquidAt, makeBody, moveBody, type Body, type MoveResult } from './collision'
import {
  Item,
  itemDef,
  RECIPES,
  STARTER_ITEMS,
  stackOf,
  type ItemStack,
  type Recipe,
} from './items'
import { clamp, mulberry32 } from './rng'
import { TileStore } from './tile-store'
import { Tile, TILE_DEFS } from './tile-defs'
import { generateWorld, type WorldGenReport } from './worldgen'

export type { ItemStack } from './items'

/**
 * Which item a broken tile yields.
 *
 * A table rather than a field on `TileDef`, because the mapping is not a property of
 * the tile — it is a property of the *economy*. Stone yields stone, but grass yields
 * dirt and ore yields its ore while the *tile* it occupied was stone. Keeping it in
 * the simulation side means the tile registry stays about geometry and light.
 */
const TILE_TO_ITEM: Readonly<Record<number, number>> = {
  [Tile.Dirt]: Item.Dirt,
  [Tile.Grass]: Item.Dirt,
  [Tile.Stone]: Item.Stone,
  [Tile.Copper]: Item.Copper,
  [Tile.Iron]: Item.Iron,
  [Tile.Silver]: Item.Silver,
  [Tile.Gold]: Item.Gold,
  [Tile.Gem]: Item.Gem,
  [Tile.Wood]: Item.Wood,
  [Tile.Plank]: Item.Plank,
  [Tile.Brick]: Item.Brick,
  [Tile.Glass]: Item.Glass,
  [Tile.Torch]: Item.Torch,
  [Tile.Sand]: Item.Dirt,
  [Tile.Mud]: Item.Dirt,
  [Tile.Ash]: Item.Stone,
  [Tile.Leaves]: -1,
  [Tile.Water]: -1,
  [Tile.Lava]: -1,
  [Tile.Air]: -1,
}

export function tileToItem(tile: number): number {
  return TILE_TO_ITEM[tile] ?? -1
}

/** A floating number: damage dealt, ore collected. */
interface FloatLabel {
  x: number
  y: number
  vy: number
  text: string
  life: number
  maxLife: number
  color: string
  size: number
}

/**
 * One entry in the draw list.
 *
 * A single flat interface with a `kind` discriminator rather than a union of
 * near-identical members: the shapes differed only in which field carried the
 * payload, and five copies of the same twenty fields is a maintenance cost with no
 * type-safety payoff. The scene tree switches on `kind` and reads what it needs.
 */
export interface RenderSlot {
  readonly kind: 'player' | 'enemy' | 'drop' | 'particle' | 'label'
  readonly id: number
  readonly x: number
  readonly y: number
  /** Sort key. Always the actor's world Y, so nearer things draw in front. */
  readonly z: number
  readonly facing: number
  readonly sprite: SpriteName
  /** 0..1. For an actor, remaining health; for a particle, remaining life. */
  readonly hp: number
  /** 0..1 white hit flash. */
  readonly hurt: number
  /** 0..1 progress through a swing; 0 when idle. */
  readonly swing: number
  readonly swingDir: number
  /** Item id of the tool in hand, or -1. */
  readonly tool: number
  readonly opacity: number
  /** Actor body width in px; icon size for a drop; particle size for a particle. */
  readonly size: number
  /** Item id for a drop, CSS colour for a particle, caption for a label. */
  readonly text: string
  /** Seconds since the drop spawned, for its bob animation. */
  readonly age: number
}

type SpriteName = 'player' | 'slime' | 'bat'

interface Actor extends Body {
  id: number
  sprite: SpriteName
  facing: number
  hp: number
  maxHp: number
  alive: boolean
  /** Seconds remaining on the white hit-flash. */
  hurt: number
  /** 0..1 progress through the current swing; 0 when idle. */
  swing: number
  /** −1 or 1: which way the current swing faces, fixed at swing start. */
  swingDir: number
  /** Seconds until this actor may attack again. */
  cooldown: number
  // -- enemy only --
  /** Seconds until this enemy may choose a new action. */
  think: number
  /** What it decided to do last. */
  intent: 'idle' | 'walk' | 'hop' | 'fly'
  /** Bats ignore gravity; slimes do not. */
  flying: boolean
  contactDamage: number
}

interface Drop {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  item: number
  count: number
  age: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
  gravity: number
}

/** A transient overlay message, e.g. "Crafted Iron Pickaxe". */
export interface Toast {
  readonly id: number
  readonly text: string
  readonly life: number
}

export interface SimStats {
  fps: number
  frameMs: number
  tickMs: number
  bakeMs: number
  lightMs: number
  bakes: number
  chunkBytes: number
  nodes: number
  entityCount: number
  enemyCount: number
  lightLevel: number
  timeOfDay: number
  seed: number
  positionX: number
  positionY: number
  depth: number
}

export class World {
  readonly store = new TileStore()
  readonly report: WorldGenReport
  readonly seed: number

  // -- the bridge: camera ---------------------------------------------------
  /** Camera top-left in world px. The scene group translates by `-camera`. */
  readonly camLeft: SignalRef<number>
  readonly camTop: SignalRef<number>
  readonly camZoom: SignalRef<number>
  readonly viewWidth: SignalRef<number>
  readonly viewHeight: SignalRef<number>
  /** Time of day in [0, 1), 0 = midnight. Its own signal so the sky does not depend
   *  on the composite `stats` object, which changes identity every tick. */
  readonly timeOfDay: SignalRef<number>

  // -- the bridge: world ----------------------------------------------------
  /** On-screen, depth-sorted draw list. */
  readonly slots: SignalRef<RenderSlot[]>
  /** Bumps when a baked surface was rebuilt. The tile layer's only dependency. */
  readonly worldRevision: SignalRef<number>
  /** Bumps when the lightmap was repainted. */
  readonly lightRevision: SignalRef<number>
  /** Chunk indices currently worth drawing. */
  readonly visibleChunks: SignalRef<readonly number[]>

  // -- the bridge: interface ------------------------------------------------
  /** First nine items. Slot 0 is always the pickaxe you are holding. */
  readonly hotbar: SignalRef<ItemStack[]>
  /** Everything else. */
  readonly inventory: SignalRef<ItemStack[]>
  readonly selectedSlot: SignalRef<number>
  readonly hoverTile: SignalRef<{ x: number; y: number } | null>
  readonly hoverLabel: SignalRef<string>
  readonly hoverBroken: SignalRef<boolean>
  readonly tooltipVisible: SignalRef<boolean>
  readonly tooltipX: SignalRef<number>
  readonly tooltipY: SignalRef<number>
  readonly tooltipTitle: SignalRef<string>
  readonly tooltipLines: SignalRef<readonly string[]>
  readonly tooltipSwatch: SignalRef<number | null>
  readonly stats: SignalRef<SimStats>
  readonly health: SignalRef<number>
  readonly maxHealth: SignalRef<number>
  readonly invulnerable: SignalRef<boolean>
  readonly pointerX: SignalRef<number>
  readonly pointerY: SignalRef<number>
  /** The item in hand, for the HUD readout. */
  readonly heldItem: SignalRef<number>
  readonly heldCount: SignalRef<number>
  readonly heldName: SignalRef<string>
  readonly craftOpen: SignalRef<boolean>
  readonly craftAvailable: SignalRef<readonly boolean[]>
  readonly toasts: SignalRef<readonly Toast[]>
  /** True while the pointer is over the world viewport. */
  readonly pointerInside: SignalRef<boolean>
  /** Set once the first world has been baked and drawn. */
  readonly ready: SignalRef<boolean>
  readonly dead: SignalRef<boolean>
  readonly lastMineProgress: SignalRef<number>

  /** Set by `main.tsx`: rebake these chunks and bump `worldRevision`. */
  onBake: ((chunks: readonly number[]) => void) | null = null
  /** Set by `main.tsx`: repaint the lightmap, returning the milliseconds it took. */
  onLight: (() => number) | null = null
  /** Set by `main.tsx`: report the live scene-node count for the debug readout. */
  onSampleNodes: (() => number) | null = null

  private readonly player: Actor
  private readonly enemies: Actor[] = []
  private readonly drops: Drop[] = []
  private readonly particles: Particle[] = []
  private readonly labels: FloatLabel[] = []
  private readonly rand: () => number
  private nextId = 1
  private nextToastId = 1
  private toastList: Toast[] = []
  private ticks = 0
  private lastBakeMs = 0
  private lastLightMs = 0
  private respawnTimer = 0

  /** Mining progress on the tile under the cursor, in seconds accumulated. */
  private mineTarget: { x: number; y: number; progress: number } | null = null

  /** Written by input, read by the tick. */
  mining = false
  placing = false
  /** Set for one tick when the attack key is pressed. */
  attackQueued = false
  /** True while the attack button is held, so a weapon keeps swinging. */
  attackHeld = false
  cursorWorldX = 0
  cursorWorldY = 0
  cursorTileX = 0
  cursorTileY = 0
  inputLeft = false
  inputRight = false
  inputJump = false

  constructor(seed: number) {
    this.seed = seed
    this.store = new TileStore()
    this.report = generateWorld(this.store, seed)
    this.rand = mulberry32(seed ^ 0x5f3759df)

    // Refs first: the camera is derived from the viewport size, so the viewport has
    // to exist before the camera can be placed.
    this.viewWidth = ref(1280)
    this.viewHeight = ref(720)
    this.timeOfDay = ref(0.3)
    this.camZoom = ref(2)
    this.slots = ref<RenderSlot[]>([])
    this.worldRevision = ref(0)
    this.lightRevision = ref(0)
    this.visibleChunks = ref<readonly number[]>([])

    // The starter kit: a pickaxe in hand, a sword and a torch beside it, and enough
    // wood to learn the crafting panel with.
    this.hotbar = ref(STARTER_ITEMS.map((s) => stackOf(s.item, s.count)))
    this.inventory = ref<ItemStack[]>([])
    this.selectedSlot = ref(0)
    this.hoverTile = ref<{ x: number; y: number } | null>(null)
    this.hoverLabel = ref('')
    this.hoverBroken = ref(false)
    this.tooltipVisible = ref(false)
    this.tooltipX = ref(0)
    this.tooltipY = ref(0)
    this.tooltipTitle = ref('')
    this.tooltipLines = ref<readonly string[]>([])
    this.tooltipSwatch = ref<number | null>(null)
    this.maxHealth = ref(100)
    this.health = ref(100)
    this.invulnerable = ref(false)
    this.pointerX = ref(0)
    this.pointerY = ref(0)
    this.heldItem = ref(STARTER_ITEMS[0].item)
    this.heldCount = ref(STARTER_ITEMS[0].count)
    this.heldName = ref(itemDef(STARTER_ITEMS[0].item).name)
    this.craftOpen = ref(false)
    this.craftAvailable = ref(RECIPES.map(() => false))
    this.toasts = ref<readonly Toast[]>([])
    this.pointerInside = ref(false)
    this.ready = ref(false)
    this.dead = ref(false)
    this.lastMineProgress = ref(0)

    const spawnX = this.report.spawnX * TILE + TILE / 2
    const spawnY = this.report.spawnY * TILE + TILE / 2
    this.player = {
      ...makeBody(spawnX, spawnY, PLAYER_W, PLAYER_H),
      id: this.nextId++,
      sprite: 'player',
      facing: 1,
      hp: 100,
      maxHp: 100,
      alive: true,
      hurt: 0,
      swing: 0,
      swingDir: 1,
      cooldown: 0,
      think: 0,
      intent: 'idle',
      flying: false,
      contactDamage: 0,
    }

    this.spawnInitialEnemies()
    this.camLeft = ref(this.player.x - this.viewWidth.value / (2 * this.camZoom.value))
    this.camTop = ref(this.player.y - this.viewHeight.value / (2 * this.camZoom.value))

    this.stats = ref({
      fps: 0,
      frameMs: 0,
      tickMs: 0,
      bakeMs: 0,
      lightMs: 0,
      bakes: 0,
      chunkBytes: 0,
      nodes: 0,
      entityCount: 0,
      enemyCount: 0,
      lightLevel: 1,
      timeOfDay: this.timeOfDay.value,
      seed,
      positionX: spawnX,
      positionY: spawnY,
      depth: 0,
    })
  }

  /**
   * Seed the surface with slimes, and the caves below with bats.
   *
   * Placement follows the terrain rather than a uniform scatter: slimes go on flat
   * ground near the surface, bats go underground. That is the minimum needed for the
   * enemy system to be *about* something, rather than a random field of hitboxes.
   */
  private spawnInitialEnemies(): void {
    const surface = this.report.surface
    for (let i = 0; i < 16; i++) {
      const tx = 24 + Math.floor(this.rand() * (WORLD_W - 48))
      const ty = surface[tx] - 2
      this.enemies.push(this.makeEnemy('slime', tx * TILE + TILE / 2, ty * TILE))
    }
    for (let i = 0; i < 14; i++) {
      const tx = 16 + Math.floor(this.rand() * (WORLD_W - 32))
      const ty = surface[tx] + 20 + Math.floor(this.rand() * 40)
      // Only where there is actually room to fly.
      if (TILE_DEFS[this.store.get(tx, ty)].solid) continue
      this.enemies.push(this.makeEnemy('bat', tx * TILE + TILE / 2, ty * TILE))
    }
  }

  private makeEnemy(sprite: SpriteName, x: number, y: number): Actor {
    // Depth scales enemy strength, so descending is a real escalation rather than
    // just a change of wallpaper.
    const tx = Math.floor(x / TILE)
    const depthTiles = y / TILE - this.report.surface[tx]
    const tier = 1 + Math.max(0, depthTiles) / 30

    const isBat = sprite === 'bat'
    const w = isBat ? 14 : TILE + 4
    const h = isBat ? 12 : TILE - 3
    const maxHp = Math.round((isBat ? 26 : 34) * tier)

    return {
      ...makeBody(x, y, w, h),
      id: this.nextId++,
      sprite,
      facing: this.rand() < 0.5 ? -1 : 1,
      hp: maxHp,
      maxHp,
      alive: true,
      hurt: 0,
      swing: 0,
      swingDir: 1,
      cooldown: this.rand() * 0.6,
      think: this.rand() * 0.7,
      intent: 'idle',
      flying: isBat,
      contactDamage: Math.round((isBat ? 7 : 9) * tier),
    }
  }

  resize(w: number, h: number): void {
    this.viewWidth.value = w
    this.viewHeight.value = h
  }

  // -- the fixed step ------------------------------------------------------

  tick(): void {
    const t0 = performance.now()
    this.ticks++
    this.timeOfDay.value = (this.timeOfDay.value + FIXED_DT / DAY_LENGTH) % 1

    this.updateTimers()
    this.updatePlayer()
    this.updateEnemies()
    this.updateDrops()
    this.updateParticles()
    this.updateSpawning()
    this.updateCamera()
    this.rebuildSlots()

    this.stats.value = {
      ...this.stats.value,
      tickMs: performance.now() - t0,
      bakeMs: this.lastBakeMs,
      lightMs: this.lastLightMs,
      entityCount: this.slots.value.length,
      enemyCount: this.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0),
      lightLevel: this.lightLevelAtPlayer,
      timeOfDay: this.timeOfDay.value,
      positionX: this.player.x,
      positionY: this.player.y,
      depth: Math.round(
        this.player.y / TILE - this.report.surface[Math.floor(this.player.x / TILE)]
      ),
      nodes: this.onSampleNodes ? this.onSampleNodes() : this.stats.value.nodes,
    }
  }

  private updateTimers(): void {
    const p = this.player
    p.hurt = Math.max(0, p.hurt - FIXED_DT)
    p.cooldown = Math.max(0, p.cooldown - FIXED_DT)
    if (p.swing > 0) p.swing = Math.max(0, p.swing - FIXED_DT / this.swingDuration())

    for (const e of this.enemies) {
      e.hurt = Math.max(0, e.hurt - FIXED_DT)
      e.cooldown = Math.max(0, e.cooldown - FIXED_DT)
      if (e.swing > 0) e.swing = Math.max(0, e.swing - FIXED_DT * 3)
    }

    if (this.toastList.length > 0) {
      this.toastList = this.toastList.filter((t) => t.life > 0)
      for (const t of this.toastList) {
        ;(t as { life: number }).life -= FIXED_DT
      }
      this.toasts.value = [...this.toastList]
    }
  }

  private get lightLevelAtPlayer(): number {
    return this.store.getLight(
      Math.floor(this.player.x / TILE),
      Math.floor(this.player.y / TILE)
    )[0]
  }

  // -- player --------------------------------------------------------------

  private held(): ItemStack | null {
    return this.hotbar.value[this.selectedSlot.value] ?? null
  }

  private heldDef() {
    const slot = this.held()
    return slot ? itemDef(slot.item) : null
  }

  private swingDuration(): number {
    const d = this.heldDef()
    if (d?.kind === 'weapon') return d.swingTime ?? 0.35
    if (d?.kind === 'pickaxe') return 0.28
    return 0.2
  }

  private updatePlayer(): void {
    const p = this.player
    if (!p.alive) {
      this.respawnTimer -= FIXED_DT
      if (this.respawnTimer <= 0) this.respawn()
      return
    }

    // -- movement ----------------------------------------------------------
    let ax = 0
    if (this.inputLeft) ax -= MOVE_ACCEL
    if (this.inputRight) ax += MOVE_ACCEL

    if (ax !== 0) {
      p.vx += ax * FIXED_DT
      p.vx = clamp(p.vx, -MOVE_SPEED, MOVE_SPEED)
      // Facing follows movement, but *not* mid-swing: turning while swinging would
      // make the arc snap sides and read as a glitch.
      if (p.swing <= 0) p.facing = ax > 0 ? 1 : -1
    } else if (p.onGround) {
      const drop = GROUND_FRICTION * FIXED_DT
      p.vx = Math.abs(p.vx) <= drop ? 0 : p.vx - Math.sign(p.vx) * drop
    }

    if (this.inputJump && p.onGround) {
      p.vy = -JUMP_SPEED
      p.onGround = false
      this.dust(p.x, p.y + PLAYER_H / 2, 4, 'rgba(180,160,130,0.75)')
    }

    const beforeVy = p.vy
    const result: MoveResult = moveBody(this.store, p, FIXED_DT, 1)
    if (result.landed && beforeVy > 260) {
      this.dust(p.x, p.y + PLAYER_H / 2, 6, 'rgba(180,160,130,0.85)')
    }

    // -- hazards -----------------------------------------------------------
    const liquid = liquidAt(this.store, p.x, p.y)
    if (liquid === 'lava') {
      this.damagePlayer(LAVA_DAMAGE * 60 * FIXED_DT, false)
      if (this.rand() < 0.5) this.spark(p.x, p.y - 6, 'rgba(255,150,60,0.9)', -30)
    }
    // Falling out of the world is possible only through a hole in the floor, which
    // the worldgen does not make — but a defensive teleport beats an infinite fall.
    if (p.y > WORLD_PX_H) {
      p.y = this.report.spawnY * TILE
      p.vy = 0
      this.damagePlayer(20, true)
    }
    p.x = clamp(p.x, PLAYER_W, WORLD_PX_W - PLAYER_W)

    // -- the item in hand --------------------------------------------------
    // A press always uses the item. Holding keeps using it, which is what makes a
    // sword auto-swing and a pickaxe keep chipping — the difference between a tool
    // and a click.
    if (this.attackQueued || this.attackHeld) {
      this.attackQueued = false
      const def = this.heldDef()
      // A block has nothing to do on the attack button, so holding one does not
      // re-trigger a swing every frame.
      if (def && def.kind !== 'block') this.useHeld()
    }
    this.applyEditor()
  }

  /**
   * Use the held item.
   *
   * The three kinds do completely different things and share only the swing
   * animation, so this is a dispatch rather than a parameterised call — the
   * alternative is a function with three unrelated branches and a `kind` check at the
   * top, which is the same thing with more indirection.
   */
  private useHeld(): void {
    const p = this.player
    const slot = this.held()
    const def = this.heldDef()
    if (!slot || !def || p.cooldown > 0) return

    // Aim at the pointer.
    //
    // Without this, combat is unplayable with a mouse: the swing goes wherever you
    // last *walked*, so you end up shuffling sideways to line up a hit. Pointing at
    // something and clicking is the expectation, so the swing follows the cursor.
    // The dead zone keeps a stray pixel of jitter from flipping you around.
    const aimDx = this.cursorWorldX - p.x
    if (Math.abs(aimDx) > 4) p.facing = aimDx > 0 ? 1 : -1

    p.swing = 1
    p.swingDir = p.facing
    p.cooldown = this.swingDuration()

    if (def.kind === 'weapon') {
      this.attackQueued = false
      this.meleeSwing(def.damage ?? 5, def.reach ?? 26, def.knockback ?? 120)
      return
    }
    if (def.kind === 'pickaxe') {
      // A pickaxe swing is an attack too — a weak one. This is the detail that makes
      // the tool feel physical rather than like a cursor.
      this.meleeSwing(2, def.reach ?? 24, 60)
      return
    }
    // A block does nothing on the attack key; placing is the secondary button.
  }

  /**
   * A melee arc.
   *
   * Implemented as a swept circle in front of the player rather than as a projectile:
   * the arc is instantaneous, the reach is short, and a hit test against live bodies
   * is both simpler and more accurate than spawning and simulating a hitbox.
   */
  private meleeSwing(damage: number, reach: number, knockback: number): void {
    const p = this.player
    const cx = p.x + p.swingDir * reach * 0.55
    const cy = p.y - 1
    const r2 = (reach * 0.8) ** 2

    let hits = 0
    for (const e of this.enemies) {
      if (!e.alive) continue
      const dx = e.x - cx
      const dy = e.y - cy
      if (dx * dx + dy * dy > r2) continue

      const crit = this.rand() < 0.12
      const dealt = Math.round(damage * (crit ? 2 : 1) * (0.9 + this.rand() * 0.2))
      this.damageEnemy(e, dealt, crit)
      e.vx += p.swingDir * knockback
      // Lift on a hit so enemies pop up rather than sliding away.
      e.vy -= knockback * 0.35
      hits++
    }
    if (hits > 0) {
      this.spark(cx, cy, 'rgba(255,244,214,0.9)', 0)
    }
  }

  private damageEnemy(e: Actor, amount: number, crit: boolean): void {
    e.hp -= amount
    e.hurt = 0.18
    this.label(
      e.x,
      e.y - 12,
      crit ? `${amount}!` : String(amount),
      crit ? 'rgba(255,214,120,1)' : 'rgba(255,255,255,0.95)',
      crit ? 13 : 11
    )
    if (e.hp <= 0 && e.alive) {
      e.alive = false
      this.killEnemy(e)
    }
  }

  private killEnemy(e: Actor): void {
    const burst = e.sprite === 'bat' ? 'rgba(120,90,140,0.9)' : 'rgba(96,190,148,0.9)'
    for (let i = 0; i < 12; i++) this.spark(e.x, e.y, burst, -70)
    this.label(e.x, e.y - 18, 'slain', 'rgba(190,220,200,0.95)', 10)

    // Loot. Slimes drop gel, bats drop nothing — a deliberate asymmetry so that
    // farming is a choice about *what* to fight.
    if (e.sprite === 'slime') {
      this.dropItem(e.x, e.y, Item.Gel, 1 + Math.floor(this.rand() * 2))
    } else if (this.rand() < 0.35) {
      this.dropItem(e.x, e.y, Item.Copper, 1)
    }
  }

  private damagePlayer(amount: number, ignoreInvulnerability: boolean): void {
    const p = this.player
    if (!p.alive) return
    if (!ignoreInvulnerability && p.hurt > 0) return

    p.hp -= amount
    p.hurt = 0.5
    this.health.value = Math.max(0, Math.round(p.hp))
    this.label(p.x, p.y - 22, `-${Math.round(amount)}`, 'rgba(226,96,84,1)', 12)
    this.spark(p.x, p.y - 4, 'rgba(226,96,84,0.9)', -40)

    if (p.hp <= 0) {
      p.alive = false
      p.hp = 0
      this.dead.value = true
      this.respawnTimer = 2.5
      this.health.value = 0
      for (let i = 0; i < 20; i++) this.spark(p.x, p.y, 'rgba(226,96,84,0.9)', -90)
    }
  }

  /** Public so the debug key and the death screen can both call it. */
  respawn(): void {
    const p = this.player
    p.x = this.report.spawnX * TILE + TILE / 2
    p.y = this.report.spawnY * TILE + TILE / 2
    p.vx = 0
    p.vy = 0
    p.hp = p.maxHp
    p.alive = true
    p.hurt = 1
    this.health.value = p.maxHp
    this.dead.value = false
    this.toast('You died. Try again.')
  }

  // -- enemies -------------------------------------------------------------

  private updateEnemies(): void {
    const p = this.player

    for (const e of this.enemies) {
      if (!e.alive) continue
      e.think -= FIXED_DT

      // Despawn far away enemies so the list does not grow without bound. The
      // threshold is generous — further than the cull distance — so nothing pops out
      // while it is visible.
      const far = Math.abs(e.x - p.x) > this.viewWidth.value * 1.6
      if (far && e.sprite === 'bat') {
        e.alive = false
        continue
      }

      const toPlayer = p.x - e.x
      const dist = Math.abs(toPlayer)
      const sameLevel = Math.abs(p.y - e.y) < TILE * 5

      if (e.sprite === 'bat') {
        // Bats fly straight at the player, with a sine weave so they are hittable.
        e.think -= FIXED_DT
        const weave = Math.sin(this.ticks * 0.06 + e.id) * 26
        const dx = toPlayer
        const dy = p.y - 8 - e.y
        const len = Math.hypot(dx, dy) || 1
        // Only chase when the player is within a screen; otherwise drift.
        const speed = dist < this.viewWidth.value * 0.7 ? 74 : 26
        e.vx += ((dx / len) * speed - e.vx) * Math.min(1, FIXED_DT * 2.4)
        e.vy += ((dy / len) * speed + weave - e.vy) * Math.min(1, FIXED_DT * 2.4)
        e.x += e.vx * FIXED_DT
        e.y += e.vy * FIXED_DT
        // Bats pass through terrain: they live in the caves and are not pathfinders.
        e.onGround = false
        e.facing = e.vx > 0 ? 1 : -1
      } else {
        // Slimes hop. On the ground they wind up, then launch toward the player; in
        // the air they only fall. This is the whole of their AI and it is enough to
        // make them feel alive.
        const result = moveBody(this.store, e, FIXED_DT, 1)
        if (e.onGround && result.hitWall && e.vy === 0) {
          e.facing = -e.facing
        }

        if (e.think <= 0) {
          e.think = 0.25 + this.rand() * 0.3
          if (e.onGround) {
            // Face the player when close, otherwise wander.
            if (dist < 220 && sameLevel) e.facing = toPlayer > 0 ? 1 : -1
            if (dist < 260 || this.rand() < 0.3) {
              e.vy = -190 - this.rand() * 40
              e.vx = e.facing * (52 + this.rand() * 40)
              e.swing = 1
              e.swingDir = e.facing
              e.intent = 'hop'
            } else {
              e.vx *= 0.5
              e.intent = 'idle'
            }
          }
        }
        if (e.onGround) e.vx *= 0.92
        e.x = clamp(e.x, TILE, WORLD_PX_W - TILE)
      }

      // Contact damage. Checked as a box overlap rather than by distance so a bat
      // cannot hit you through a wall corner it is clipping.
      if (e.contactDamage > 0 && p.alive) {
        const overlapX = Math.abs(e.x - p.x) < e.hw + PLAYER_W / 2
        const overlapY = Math.abs(e.y - p.y) < e.hh + PLAYER_H / 2
        if (overlapX && overlapY) {
          this.damagePlayer(e.contactDamage, false)
          // Bounce the enemy back so repeated contact is a rhythm, not a blender.
          e.vx = -Math.sign(toPlayer) * 150
          e.vy = -140
          p.vx = Math.sign(toPlayer) * 120
        }
      }
    }

    if (this.ticks % 120 === 0) {
      // Compact the list on a slow cadence: `filter` allocates, and doing it every
      // tick for a handful of dead entries is a needless cost in a hot loop.
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        if (!this.enemies[i].alive) this.enemies.splice(i, 1)
      }
    }
  }

  /** Slow trickle of enemies near the player, so the world stays dangerous. */
  private updateSpawning(): void {
    if (this.ticks % 90 !== 0) return
    if (this.dead.value) return
    const alive = this.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0)
    if (alive > 44) return

    // Prefer spawning off-screen so enemies walk into view rather than appearing.
    const side = this.rand() < 0.5 ? -1 : 1
    const dist = this.viewWidth.value * (0.7 + this.rand() * 0.4)
    const x = clamp(this.player.x + side * dist, TILE * 2, WORLD_PX_W - TILE * 2)
    const tx = Math.floor(x / TILE)

    const under = this.player.y / TILE > this.report.surface[tx] + 6
    const sprite: SpriteName = under ? (this.rand() < 0.5 ? 'bat' : 'slime') : 'slime'
    let ty = Math.floor(this.player.y / TILE) - 2
    if (sprite === 'slime') ty = this.report.surface[tx] - 2
    if (ty < 2 || ty > WORLD_PX_H / TILE - 3) return

    const candidate = this.makeEnemy(sprite, tx * TILE + TILE / 2, ty * TILE)
    // Never spawn inside rock.
    if (!candidate.flying && TILE_DEFS[this.store.get(tx, ty)].solid) return
    this.enemies.push(candidate)
  }

  // -- drops and particles -------------------------------------------------

  private dropItem(x: number, y: number, item: number, count: number): void {
    this.drops.push({
      id: this.nextId++,
      x,
      y,
      vx: (this.rand() - 0.5) * 60,
      vy: -110,
      item,
      count,
      age: 0,
    })
  }

  private updateDrops(): void {
    const p = this.player
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]
      d.age += FIXED_DT
      d.vy += 900 * FIXED_DT
      if (d.vy > MAX_FALL) d.vy = MAX_FALL

      const nx = d.x + d.vx * FIXED_DT
      if (!TILE_DEFS[this.store.get(Math.floor(nx / TILE), Math.floor(d.y / TILE))].solid) {
        d.x = nx
      } else {
        d.vx = 0
      }

      const ny = d.y + d.vy * FIXED_DT
      if (!TILE_DEFS[this.store.get(Math.floor(d.x / TILE), Math.floor(ny / TILE))].solid) {
        d.y = ny
      } else {
        d.y = Math.floor(ny / TILE) * TILE + TILE / 2
        d.vy = 0
        d.vx *= 0.5
      }

      // Magnet. Once close enough, a drop flies to the player — this is the whole of
      // the pickup code and it is what makes mining feel responsive rather than fussy.
      const dx = p.x - d.x
      const dy = p.y - d.y
      const dist = Math.hypot(dx, dy) || 1
      if (dist < TILE * 2.8) {
        const pull = Math.min(1, FIXED_DT * (900 / Math.max(14, dist)))
        d.x += dx * pull
        d.y += dy * pull
        if (dist < 11) {
          this.collect(d.item, d.count)
          this.drops.splice(i, 1)
          continue
        }
      }
      // Drops do not live forever; without this a long session leaks.
      if (d.age > 180) this.drops.splice(i, 1)
    }
  }

  private updateParticles(): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.life -= FIXED_DT
      if (p.life <= 0) {
        this.particles.splice(i, 1)
        continue
      }
      p.vy += p.gravity * FIXED_DT
      p.x += p.vx * FIXED_DT
      p.y += p.vy * FIXED_DT
    }
    for (let i = this.labels.length - 1; i >= 0; i--) {
      const l = this.labels[i]
      l.life -= FIXED_DT
      l.y += l.vy * FIXED_DT
      if (l.life <= 0) this.labels.splice(i, 1)
    }
  }

  private spark(x: number, y: number, color: string, bias: number): void {
    if (this.particles.length >= MAX_PARTICLES) return
    this.particles.push({
      x: x + (this.rand() - 0.5) * 8,
      y: y + (this.rand() - 0.5) * 8,
      vx: (this.rand() - 0.5) * 140,
      vy: bias + (this.rand() - 0.5) * 120,
      life: 0.25 + this.rand() * 0.4,
      maxLife: 0.65,
      color,
      size: 1.5 + this.rand() * 1.5,
      gravity: 620,
    })
  }

  private dust(x: number, y: number, count: number, color: string): void {
    for (let i = 0; i < count; i++) this.spark(x, y, color, -40)
  }

  private label(x: number, y: number, text: string, color: string, size: number): void {
    this.labels.push({
      x,
      y,
      vy: -30,
      text,
      life: 0.85,
      maxLife: 0.85,
      color,
      size,
    })
  }

  private toast(text: string): void {
    this.toastList = [...this.toastList, { id: this.nextToastId++, text, life: 2.6 }]
    this.toasts.value = [...this.toastList]
  }

  // -- inventory -----------------------------------------------------------

  /**
   * Add items, filling existing stacks first.
   *
   * The hotbar is preferred over the satchel only when the item is already in the
   * hotbar — otherwise a stack you never chose to hold would occupy a hand slot.
   */
  private collect(item: number, count: number): void {
    const def = itemDef(item)
    const bar = [...this.hotbar.value]
    const bag = [...this.inventory.value]

    const barHit = bar.findIndex((s) => s.item === item && s.count < def.maxStack)
    if (barHit >= 0) {
      bar[barHit] = { item, count: bar[barHit].count + count }
    } else {
      const bagHit = bag.findIndex((s) => s.item === item && s.count < def.maxStack)
      if (bagHit >= 0) {
        bag[bagHit] = { item, count: bag[bagHit].count + count }
      } else {
        bag.push(stackOf(item, count))
      }
    }

    this.hotbar.value = bar
    this.inventory.value = bag
    this.label(this.player.x, this.player.y - 24, `+${count} ${def.name}`, 'rgba(232,236,245,0.95)', 10)
    this.refreshCrafting()
  }

  /** Consume `count` of `item` across the hotbar and the satchel. */
  private consume(item: number, count: number): boolean {
    if (this.countOf(item) < count) return false
    let left = count

    const bar = [...this.hotbar.value]
    for (let i = 0; i < bar.length && left > 0; i++) {
      if (bar[i].item !== item) continue
      const take = Math.min(left, bar[i].count)
      bar[i] = { item, count: bar[i].count - take }
      left -= take
    }
    // Never remove the slot itself: a hand slot that vanishes would shift every other
    // slot under the player's fingers. An emptied stack is removed only from the bag.
    this.hotbar.value = bar.filter((s) => s.count > 0 || bar.indexOf(s) === this.selectedSlot.value)

    const bag = [...this.inventory.value]
    for (let i = 0; i < bag.length && left > 0; i++) {
      if (bag[i].item !== item) continue
      const take = Math.min(left, bag[i].count)
      bag[i] = { item, count: bag[i].count - take }
      left -= take
    }
    this.inventory.value = bag.filter((s) => s.count > 0)

    if (left > 0) return false
    this.syncHeld()
    this.refreshCrafting()
    return true
  }

  countOf(item: number): number {
    let n = 0
    for (const s of this.hotbar.value) if (s.item === item) n += s.count
    for (const s of this.inventory.value) if (s.item === item) n += s.count
    return n
  }

  private syncHeld(): void {
    const slot = this.hotbar.value[this.selectedSlot.value]
    this.heldItem.value = slot ? slot.item : -1
    this.heldCount.value = slot ? slot.count : 0
    this.heldName.value = slot ? itemDef(slot.item).name : 'Empty'
  }

  private refreshCrafting(): void {
    this.craftAvailable.value = RECIPES.map((r) =>
      r.inputs.every((need) => this.countOf(need.item) >= need.count)
    )
  }

  selectSlot(index: number): void {
    this.selectedSlot.value = clamp(index, 0, Math.max(0, this.hotbar.value.length - 1))
    this.syncHeld()
  }

  /** Craft recipe `index`, if affordable. Called by the crafting panel. */
  craft(index: number): void {
    const recipe: Recipe | undefined = RECIPES[index]
    if (!recipe) return
    if (!recipe.inputs.every((need) => this.countOf(need.item) >= need.count)) {
      this.toast(`Not enough materials`)
      return
    }
    for (const need of recipe.inputs) this.consume(need.item, need.count)
    this.collect(recipe.output.item, recipe.output.count)
    this.toast(`Crafted ${itemDef(recipe.output.item).name} ×${recipe.output.count}`)
  }

  toggleCraft(): void {
    this.craftOpen.value = !this.craftOpen.value
    this.refreshCrafting()
  }

  // -- editing -------------------------------------------------------------

  /**
   * Mining with a timer, not instantly.
   *
   * This is the single biggest gameplay difference from the first version of this
   * slice: a hardness *rate* means the tool tier is a real progression gate, and the
   * crack overlay gives the player feedback about progress. Instant mining made both
   * pointless.
   */
  private applyEditor(): void {
    const tx = this.cursorTileX
    const ty = this.cursorTileY
    const p = this.player
    const centreX = tx * TILE + TILE / 2
    const centreY = ty * TILE + TILE / 2

    // Reach is a circle around the player, in world px.
    const reach = Math.hypot(centreX - p.x, centreY - p.y)
    const inReach = reach <= REACH
    this.hoverTile.value = inReach ? { x: tx, y: ty } : null

    if (!inReach) {
      this.mineTarget = null
      this.lastMineProgress.value = 0
      return
    }

    if (!this.mining) {
      this.mineTarget = null
      this.lastMineProgress.value = 0
    } else {
      const tile = this.store.get(tx, ty)
      const def = TILE_DEFS[tile]
      const heldDef = this.heldDef()

      // Air, decorated-only tiles and unbreakable tiles cannot be mined.
      const breakable = tile !== Tile.Air && def.hardness > 0
      // The tool tier gate: a pickaxe whose power is below the tile's hardness
      // simply does not make progress.
      const canBreak =
        heldDef?.kind === 'pickaxe' && (heldDef.power ?? 0) >= def.hardness

      this.hoverBroken.value = breakable && !canBreak

      if (!breakable) {
        this.mineTarget = null
        this.lastMineProgress.value = 0
        return
      }
      if (!canBreak) {
        if (this.ticks % 24 === 0) {
          this.label(centreX, centreY - 8, 'too hard', 'rgba(226,96,84,0.9)', 10)
        }
        this.mineTarget = null
        this.lastMineProgress.value = 0
        return
      }

      if (!this.mineTarget || this.mineTarget.x !== tx || this.mineTarget.y !== ty) {
        this.mineTarget = { x: tx, y: ty, progress: 0 }
        // Turn toward the tile being worked on, for the same reason as aiming the
        // swing: the pointer is the intent, and the sprite should agree with it.
        const mineDx = tx * TILE + TILE / 2 - p.x
        if (Math.abs(mineDx) > 4) p.facing = mineDx > 0 ? 1 : -1
      }
      // Rate = power / hardness. A copper pickaxe (2) on dirt (1) takes half a
      // second; on silver ore (4) it cannot progress at all.
      const power = heldDef?.power ?? 1
      const rate = (power / def.hardness) * 1.4
      this.mineTarget.progress += rate * FIXED_DT
      this.lastMineProgress.value = Math.min(1, this.mineTarget.progress)
      this.hoverBroken.value = false

      if (this.mineTarget.progress >= 1) {
        this.breakTile(tx, ty, tile)
        this.mineTarget = null
        this.lastMineProgress.value = 0
      } else if (this.ticks % 6 === 0) {
        const [r, g, b] = def.color
        this.dust(centreX, centreY, 1, `rgba(${r},${g},${b},0.8)`)
      }
    }

    if (this.placing) this.tryPlace(tx, ty)
  }

  private breakTile(tx: number, ty: number, tile: number): void {
    const def = TILE_DEFS[tile]
    if (this.store.set(tx, ty, Tile.Air)) {
      const [r, g, b] = def.color
      this.dust(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 6, `rgba(${r},${g},${b},0.9)`)
      // Every tile yields something, which is what makes digging worth doing rather
      // than just clearing space.
      const dropTile = def.gives ?? tile
      if (dropTile !== Tile.Air) {
        const item = tileToItem(dropTile)
        if (item >= 0) {
          this.dropItem(tx * TILE + TILE / 2, ty * TILE + TILE / 2, item, 1)
        }
      }
    }
  }

  private tryPlace(tx: number, ty: number): void {
    const slot = this.held()
    if (!slot) return
    const def = itemDef(slot.item)
    if (def.kind !== 'block' || def.tile === undefined) return

    const target = this.store.get(tx, ty)
    const replaceable = target === Tile.Air || TILE_DEFS[target].liquid !== undefined
    if (!replaceable) return

    // Do not brick yourself in: a solid block cannot be placed inside the player.
    const tileDef = TILE_DEFS[def.tile]
    if (tileDef.solid) {
      const overlapsPlayer =
        tx * TILE + TILE > this.player.x - PLAYER_W / 2 &&
        tx * TILE < this.player.x + PLAYER_W / 2 &&
        ty * TILE + TILE > this.player.y - PLAYER_H / 2 &&
        ty * TILE < this.player.y + PLAYER_H / 2
      if (overlapsPlayer) return
    }
    // Support rule: a block needs a neighbour, so you cannot bridge into the sky.
    const hasNeighbour =
      TILE_DEFS[this.store.get(tx - 1, ty)].solid ||
      TILE_DEFS[this.store.get(tx + 1, ty)].solid ||
      TILE_DEFS[this.store.get(tx, ty - 1)].solid ||
      TILE_DEFS[this.store.get(tx, ty + 1)].solid ||
      TILE_DEFS[this.store.get(tx, ty - 1)].liquid !== undefined
    if (!hasNeighbour) return

    if (this.store.set(tx, ty, def.tile)) {
      this.consume(slot.item, 1)
      const [r, g, b] = tileDef.color
      this.dust(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 3, `rgba(${r},${g},${b},0.7)`)
      this.placing = false // one block per press unless the button is held
    }
  }

  // -- camera --------------------------------------------------------------

  private updateCamera(): void {
    const zoom = this.camZoom.value
    const halfW = this.viewWidth.value / (2 * zoom)
    const halfH = this.viewHeight.value / (2 * zoom)

    // Lead slightly in the direction of travel — a small offset that makes fast
    // movement readable without inducing motion sickness.
    const leadX = clamp(this.player.vx * 0.22, -50, 50)
    const targetX = this.player.x + leadX - halfW
    const targetY = this.player.y - halfH - 12

    const k = 1 - Math.pow(0.0012, FIXED_DT)
    let nextX = this.camLeft.value + (targetX - this.camLeft.value) * k
    let nextY = this.camTop.value + (targetY - this.camTop.value) * k
    if (Math.abs(targetX - nextX) < 0.05) nextX = targetX
    if (Math.abs(targetY - nextY) < 0.05) nextY = targetY

    const maxX = WORLD_PX_W - this.viewWidth.value / zoom
    const maxY = WORLD_PX_H - this.viewHeight.value / zoom
    this.camLeft.value = maxX <= 0 ? maxX / 2 : clamp(nextX, 0, maxX)
    this.camTop.value = maxY <= 0 ? maxY / 2 : clamp(nextY, 0, maxY)
  }

  setZoom(z: number): void {
    this.camZoom.value = clamp(z, 1, 4)
  }

  /** Screen point → world point, using the same camera the renderer uses. */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const zoom = this.camZoom.value
    return {
      x: this.camLeft.value + sx / zoom,
      y: this.camTop.value + sy / zoom,
    }
  }

  /**
   * The surface's screen row, for the sky layers.
   *
   * Taken from the terrain at the camera's centre rather than from a fixed screen
   * fraction, so descending into a cave correctly leaves the sky behind instead of
   * sliding the horizon down the screen with the camera.
   */
  get horizonScreenY(): number {
    const zoom = this.camZoom.value
    const centreX = this.camLeft.value + this.viewWidth.value / (2 * zoom)
    const tx = clamp(Math.round(centreX / TILE), 0, this.report.surface.length - 1)
    const surfaceWorldY = this.report.surface[tx] * TILE
    return (surfaceWorldY - this.camTop.value) * zoom + this.viewHeight.value / 2 - this.viewHeight.value / 2
  }

  // -- draw list -----------------------------------------------------------

  private rebuildSlots(): void {
    const out: RenderSlot[] = []
    const left = this.camLeft.value
    const top = this.camTop.value
    const w = this.viewWidth.value / this.camZoom.value
    const h = this.viewHeight.value / this.camZoom.value
    // A generous pad so a sprite entering the frame does not pop in on its centre
    // line, and so a bat's weave does not clip.
    const pad = TILE * 4

    /** Shared defaults, so each push only states what it actually differs in. */
    const base = {
      id: 0,
      facing: 1,
      sprite: 'player' as SpriteName,
      hp: 1,
      hurt: 0,
      swing: 0,
      swingDir: 1,
      tool: -1,
      opacity: 1,
      size: 0,
      text: '',
      age: 0,
    }

    const visible = (x: number, y: number): boolean =>
      x >= left - pad && x <= left + w + pad && y >= top - pad && y <= top + h + pad

    // -- the player, always drawn ------------------------------------------
    const p = this.player
    const held = this.held()
    out.push({
      ...base,
      kind: 'player',
      id: p.id,
      x: p.x,
      y: p.y,
      z: p.y,
      facing: p.facing,
      sprite: 'player',
      hp: p.maxHp > 0 ? p.hp / p.maxHp : 0,
      hurt: p.hurt / 0.5,
      swing: p.swing,
      swingDir: p.swingDir,
      tool: held ? held.item : -1,
      // The player is drawn semi-transparent for a moment after taking a hit, which
      // is the standard readability trick for "you are invulnerable right now".
      opacity: p.hurt > 0.25 ? 0.55 : 1,
    })

    // -- enemies -----------------------------------------------------------
    for (const e of this.enemies) {
      if (!e.alive || !visible(e.x, e.y)) continue
      out.push({
        ...base,
        kind: 'enemy',
        id: e.id,
        x: e.x,
        y: e.y,
        z: e.y,
        facing: e.facing,
        sprite: e.sprite,
        hp: e.maxHp > 0 ? e.hp / e.maxHp : 0,
        hurt: e.hurt / 0.18,
        swing: e.swing,
        swingDir: e.swingDir,
        size: e.hw * 2,
      })
    }

    // -- ground drops ------------------------------------------------------
    for (const d of this.drops) {
      if (!visible(d.x, d.y)) continue
      out.push({
        ...base,
        kind: 'drop',
        id: d.id,
        x: d.x,
        y: d.y,
        z: d.y,
        // Drops fade in on spawn so a burst of loot does not flash onto the screen.
        opacity: Math.min(1, d.age * 4),
        // `text` carries the item id: the scene tree needs it to look up the icon,
        // and encoding it as a string keeps the slot a flat record.
        text: String(d.item),
        size: 9,
        age: d.age,
      })
    }

    // -- particles ---------------------------------------------------------
    for (const particle of this.particles) {
      if (!visible(particle.x, particle.y)) continue
      out.push({
        ...base,
        kind: 'particle',
        id: 0,
        x: particle.x,
        y: particle.y,
        z: particle.y,
        size: particle.size,
        text: particle.color,
        opacity: Math.max(0, particle.life / particle.maxLife),
      })
    }

    // -- floating numbers --------------------------------------------------
    for (const label of this.labels) {
      if (!visible(label.x, label.y)) continue
      out.push({
        ...base,
        kind: 'label',
        id: 0,
        x: label.x,
        y: label.y,
        z: label.y,
        text: label.text,
        size: label.size,
        opacity: Math.min(1, label.life / label.maxLife + 0.25),
      })
    }

    // Back to front. `each` has no comparator and the canvas has no z-index, so
    // ordering is a simulation concern and the scene tree only reproduces it.
    out.sort((a, b) => a.z - b.z)
    this.slots.value = out

    // The visible chunk range, computed once here and shared by the tile layer and
    // the debug overlay rather than recomputed inside a draw.
    const cx0 = clamp(Math.floor(left / (CHUNK * TILE)), 0, CHUNKS_X - 1)
    const cx1 = clamp(Math.floor((left + w) / (CHUNK * TILE)), 0, CHUNKS_X - 1)
    const cy0 = clamp(Math.floor(top / (CHUNK * TILE)), 0, CHUNKS_Y - 1)
    const cy1 = clamp(Math.floor((top + h) / (CHUNK * TILE)), 0, CHUNKS_Y - 1)
    const next: number[] = []
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) next.push(cy * CHUNKS_X + cx)
    }
    const prev = this.visibleChunks.value
    // Assign only on an actual change: writing the ref marks the whole canvas dirty,
    // and re-assigning an identical array every tick would force a redraw at 60 Hz
    // even when the player is standing still.
    if (prev.length !== next.length || prev.some((v, i) => v !== next[i])) {
      this.visibleChunks.value = next
    }
  }

  // -- frame flush (called once per rendered frame, not per tick) -----------

  /**
   * Bake and light everything once, so the first frame is correct and the kernels are
   * warm.
   *
   * Called before mount. Note that it goes through the *same* `onBake` / `onLight`
   * callbacks the frame loop uses, rather than reaching into the baker directly: the
   * startup path and the steady-state path are then guaranteed to produce identical
   * output, which is the only reason a warm-up is safe at all.
   */
  warm(): void {
    const total = (this.store.w / CHUNK) * (this.store.h / CHUNK)
    const every: number[] = []
    for (let i = 0; i < total; i++) every.push(i)
    this.onBake?.(every)
    this.store.takeDirtyChunks()
    this.worldRevision.value++

    if (this.onLight) {
      this.onLight()
      this.lightRevision.value++
      this.store.clearLightDirty()
    }
  }

  /** Drains the world's dirty chunk set into rebakes. */
  flushBakes(): void {
    const dirty = this.store.takeDirtyChunks()
    if (!dirty || !this.onBake) return
    const t0 = performance.now()
    this.onBake(dirty)
    this.lastBakeMs = performance.now() - t0
    this.worldRevision.value++
    this.stats.value = { ...this.stats.value, bakes: this.stats.value.bakes + dirty.length }
  }

  /**
   * Repaints the lightmap if anything changed.
   *
   * Kept separate from `flushBakes` because the cost profiles are nothing alike: a
   * bake touches one 32×32 chunk, a lighting pass walks every tile in the world.
   * Mixing them would force the caller to throttle both.
   */
  flushLight(): void {
    if (!this.store.needsLight || !this.onLight) return
    this.lastLightMs = this.onLight()
    this.lightRevision.value++
  }

  // -- accessors used by input and the interface --------------------------

  get playerX(): number {
    return this.player.x
  }

  get playerY(): number {
    return this.player.y
  }

  get playerHp(): number {
    return this.player.hp
  }

  tileAt(tx: number, ty: number): number {
    return this.store.get(tx, ty)
  }

  /** Called by the input layer when the attack key is pressed. */
  requestAttack(): void {
    this.attackQueued = true
  }

  /** Smoothed frame timings, published by the render loop. */
  reportFrame(fps: number, frameMs: number): void {
    const s = this.stats.value
    this.stats.value = { ...s, fps, frameMs }
  }
}
