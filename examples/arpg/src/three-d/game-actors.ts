/**
 * Wiring the 3D actor layer to the game's entities.
 *
 * The layer (`./actor-layer.tsx`) takes a FIXED list of actor entries and
 * re-reads their placement every redraw. This module owns that list: a pool of
 * entries that `syncActor3DPool` refills from the live entities once per frame,
 * plus the set of sprite slots whose 2D art is replaced by a model.
 *
 * Which actor gets a model is decided here, and the rule is deliberately
 * narrow — a character is drawn in 3D only when the model that belongs to it
 * is established, never a stand-in:
 *
 * - the hero gets the amazon parts (the player unit definition's own part
 *   scheme: head / torso / legs / left arm / right arm, one model file each,
 *   sharing one character space so five entries at one tile assemble);
 * - a monster is drawn from its own unit definition's parts when
 *   `MONSTER_PART_MODELS` (three-d/model.ts) has an entry for its `MonsterKind`
 *   (skeleton → `skeleton1`, zombie → `zombie1`, the brute boss → `brute2`),
 *   each part in its `lit` armour variant;
 * - a town NPC is drawn from its own retail unit definition's parts when
 *   `NPC_PART_MODELS` (three-d/model.ts) has an entry for its `monstats` id —
 *   `game.npcs[]` places them at their fixed `.ds1` tiles, facing south.
 *
 * Everything else keeps its classic 2D sprite — including every character
 * whose unit definition we have not staged. That is the rule: a character
 * without its own model keeps its sprite, and never borrows another
 * character's model. Wiring more characters is adding rows to
 * {@link MONSTER_PART_MODELS} or {@link NPC_PART_MODELS} driven by the retail
 * unit definitions the way `data/hd/character/enemy/zombie1.json` and
 * `data/hd/character/npc/gheed.json` list their parts.
 */

import { ref, type SignalRef } from '@rasenjs/reactive-signals'
import { worldAngleToIso } from '../iso'
import { PROP_KINDS, type ActorSlot, type Game, type Monster } from '../game'
import { MONSTER_PART_MODELS, NPC_PART_MODELS, PROP_PART_MODELS } from './model'
import type { Actor3D } from './actor-layer'
import {
  animStateMachine,
  CLIP_PREFIXES,
  clipForMode,
  type AnimStateMachine,
  type ClipSet,
} from './anim-state'
import type { ActorMode } from '../d2/anim-art'
import { loadAnimationRig } from './skinning'
import { MODEL_UNITS_PER_TILE } from './projection'

/**
 * The locomotion mode whose clip is authored closest to the actor's speed.
 *
 * A treadmill clip plants its feet at exactly one ground speed — the pace its
 * art was authored for — and its clock then runs at `speed / pace`, so a clip
 * far from the walker's speed plays at a frantic cadence. Retail ships a walk
 * and a run for this reason; pick whichever pace is closer to the speed the
 * actor is actually doing. No hysteresis is needed: these speeds are constants
 * per actor profile.
 */
function locomotionModeFor(
  set: ClipSet | null,
  weaponMode: string,
  mode: ActorMode,
  town: boolean,
  tilesPerSecond: number,
): ActorMode {
  if (set === null || mode !== 'wl' || !(tilesPerSecond > 0)) return mode
  const walk = clipForMode(set, weaponMode, 'wl', town)
  const run = clipForMode(set, weaponMode, 'rn', town)
  if (walk === null || run === null || run === walk) return mode
  const paceWalk = set.pace?.(walk) ?? 0
  const paceRun = set.pace?.(run) ?? 0
  if (!(paceWalk > 0) || !(paceRun > 0)) return mode
  const walkOff = Math.abs(Math.log(tilesPerSecond / paceWalk))
  const runOff = Math.abs(Math.log(tilesPerSecond / paceRun))
  return runOff < walkOff ? 'rn' : 'wl'
}

/** The hero's parts, one model file each, in draw order. */
const HERO_PARTS = [
  'amazon-head',
  'amazon-torso',
  'amazon-legs',
  'amazon-left-arm',
  'amazon-right-arm',
] as const

/** How many model-bearing monsters can be drawn at once (per kind). */
const MONSTER_SLOTS = 8

/**
 * How many standing instances of one prop kind the pool holds. The world maps
 * place dozens of rocks; beyond the pool a prop keeps its 2D sprite rather
 * than displacing another prop's model.
 */
const PROP_INSTANCES_PER_KIND = 32

/**
 * How many standing instances of ONE NPC kind the pool holds at once.
 *
 * The pool's length is fixed at mount (see {@link actor3DPool}) while the
 * roster is not known until a level loads, so the slots are allocated per kind.
 * The Rogue Encampment's own `.ds1` places six `rogue1` guards (measured from
 * the placements the game resolves); eight leaves a little headroom. An NPC
 * beyond its kind's slots keeps its 2D sprite rather than displacing another
 * NPC's model.
 */
const NPC_INSTANCES_PER_KIND = 8

/**
 * World facing for each of the eight sprite directions.
 *
 * Derived by inverting `worldAngleToIso` (which rounds a world angle to the
 * nearest of eight screen-space directions): every angle that maps to a
 * direction is averaged, so the table cannot drift from the 2D renderer's
 * convention.
 */
/** Shortest signed angular delta, for smooth turns across the ±π seam. */
function shortestAngle(delta: number): number {
  return Math.atan2(Math.sin(delta), Math.cos(delta))
}

const monsterPrev = new Map<number, { x: number; y: number }>()
const monsterYaw = new Map<number, number>()
const monsterSmoothed = new Map<number, number>()
const FACING_OF_DIR: number[] = (() => {
  const table: number[] = []
  for (let dir = 0; dir < 8; dir += 1) {
    let sumSin = 0
    let sumCos = 0
    let count = 0
    for (let step = 0; step < 256; step += 1) {
      const angle = (step / 256) * Math.PI * 2
      if (worldAngleToIso(angle) === dir) {
        sumSin += Math.sin(angle)
        sumCos += Math.cos(angle)
        count += 1
      }
    }
    table.push(count === 0 ? 0 : Math.atan2(sumSin / count, sumCos / count))
  }
  return table
})()

/** The sprite slot replaced by a model this frame. */
export const hiddenActorSlots = new WeakSet<ActorSlot>()

/**
 * The redraw tick: bumped once per frame so the layer re-reads placements
 * even when the camera stands still and only the actors move.
 */
export const actor3DTick: SignalRef<number> = ref(0)

/**
 * The pool the layer mounts with. Fixed length; entries are reused per frame.
 *
 * Length is hero parts + monster slots + every `NPC_PART_MODELS` kind times
 * {@link NPC_INSTANCES_PER_KIND} instances times its part count — enough for
 * the town's six Rogue guards, all other kinds being singletons.
 */
function buildPool(): {
  entries: Actor3D[]
  npcInstances: Map<string, Actor3D[][]>
  monsterInstances: Map<string, Actor3D[][]>
  propInstances: Map<string, Actor3D[]>
} {
  const entries: Actor3D[] = []
  for (const modelKey of HERO_PARTS) {
    entries.push({ id: `hero:${modelKey}`, modelKey, tileX: -999, tileY: -999, facing: 0, visible: false })
  }
  // Monster entries, one group per standing monster per kind (the parts of
  // that kind's unit definition share one placement, the way the hero's five
  // entries do). The pool length is fixed at mount, so the slots are allocated
  // per kind; a monster beyond its kind's slots keeps its 2D sprite.
  const monsterInstances = new Map<string, Actor3D[][]>()
  for (const [kind, spec] of Object.entries(MONSTER_PART_MODELS)) {
    const instances: Actor3D[][] = []
    for (let i = 0; i < MONSTER_SLOTS; i += 1) {
      const group: Actor3D[] = []
      for (const part of spec.parts) {
        const modelKey = `${spec.id}-${part}`
        const entry: Actor3D = {
          id: `monster:${kind}:${i}:${part}`,
          modelKey,
          tileX: -999,
          tileY: -999,
          facing: 0,
          visible: false,
        }
        entries.push(entry)
        group.push(entry)
      }
      instances.push(group)
    }
    monsterInstances.set(kind, instances)
  }
  // NPC entries, kept as per-instance part groups: one NPC stands at one tile
  // and its parts share that placement, the way the hero's five entries do.
  const npcInstances = new Map<string, Actor3D[][]>()
  for (const [id, parts] of Object.entries(NPC_PART_MODELS)) {
    const instances: Actor3D[][] = []
    for (let i = 0; i < NPC_INSTANCES_PER_KIND; i += 1) {
      const group: Actor3D[] = []
      for (const modelKey of parts) {
        const entry: Actor3D = {
          id: `npc:${id}:${i}:${modelKey}`,
          modelKey,
          tileX: -999,
          tileY: -999,
          facing: 0,
          visible: false,
        }
        entries.push(entry)
        group.push(entry)
      }
      instances.push(group)
    }
    npcInstances.set(id, instances)
  }
  // Environment props with their own HD model: one entry per standing prop.
  const propInstances = new Map<string, Actor3D[]>()
  for (const [kind, modelKey] of Object.entries(PROP_PART_MODELS)) {
    const list: Actor3D[] = []
    for (let i = 0; i < PROP_INSTANCES_PER_KIND; i += 1) {
      const entry: Actor3D = {
        id: `prop:${kind}:${i}`,
        modelKey,
        tileX: -999,
        tileY: -999,
        facing: 0,
        visible: false,
      }
      entries.push(entry)
      list.push(entry)
    }
    propInstances.set(kind, list)
  }
  return { entries, npcInstances, monsterInstances, propInstances }
}

const POOL_BUILD = buildPool()

const POOL = POOL_BUILD.entries

/** NPC pool entries by `monstats` id; each inner array is one standing NPC. */
const NPC_INSTANCES = POOL_BUILD.npcInstances

/** Monster pool entries by `MonsterKind`; each inner array is one monster. */
const MONSTER_INSTANCES = POOL_BUILD.monsterInstances

/** Prop pool entries by prop kind; one entry per standing prop. */
const PROP_INSTANCES = POOL_BUILD.propInstances

export function actor3DPool(): Actor3D[] {
  return buildPool().entries
}

/** The mounted layer binds to this list; its length never changes. */
export function actor3DActors(): Actor3D[] {
  return POOL
}

function modelForMonster(monster: Monster): boolean {
  // The kind's own unit-definition parts (`./model.ts`'s MONSTER_PART_MODELS);
  // a kind without a staged model keeps its 2D sprite, never another
  // creature's model.
  return MONSTER_PART_MODELS[monster.kind] !== undefined
}

function place(entry: Actor3D, x: number, y: number, facing: number, visible: boolean): void {
  entry.tileX = x
  entry.tileY = y
  entry.facing = facing
  entry.visible = visible
}

/**
 * Refill the pool from the live entities and mark the sprite slots that a
 * model replaces. Called once per frame from the game loop.
 */
/**
 * The hero's playback state.
 *
 * The retail amazon set carries 213 clips across 8 weapon modes; the mode is
 * the HELD weapon's (`game.heroWeaponMode()`: `hth` unarmed, `1hs`, `bow`,
 * `stf`, … — a pickup switches it, see `weaponModeOf` in `../game.ts`), and
 * the machine resolves every state through the prefix chain
 * (`1hs_attack1`, `hth_*`, bare) so a weapon change is a different
 * `weaponMode`, not new code. The game's classic actor mode
 * (`nu`/`wl`/`rn`/`a1`/`sc`/`gh`/`dd`) is the input: `game.heroAnimMode()` is
 * the same state source the 2D sheet animates from.
 */
const heroMachine = animStateMachine('hth', true)

/** Per-monster playback state (a monster keeps its clock across frames). */
const monsterMachines = new Map<number, AnimStateMachine>()

/** Per-standing-NPC playback state, keyed by its pool group. */
const npcMachines = new WeakMap<Actor3D[], AnimStateMachine>()

/** Hero facing state: smoothed yaw toward the movement vector. */
let heroYaw = Math.PI / 2
let heroTargetYaw = Math.PI / 2
let heroPrev2: { x: number; y: number } | null = null
let heroLastMs = 0
let heroPrev: { x: number; y: number } | null = null

/**
 * The clip set of one model's character, as the state machine wants it.
 *
 * Filled asynchronously from the same cached `combined.animations` the layer
 * skins with (`loadAnimationRig`), so the first frames after a load play bind
 * pose rather than blocking the frame.
 */
const clipSets = new Map<string, ClipSet | null>()

function clipSetFor(modelKey: string): ClipSet | null {
  const cached = clipSets.get(modelKey)
  if (cached !== undefined) return cached
  clipSets.set(modelKey, null)
  void loadAnimationRig(modelKey).then((rig) => {
    clipSets.set(
      modelKey,
      rig === null
        ? null
        : {
            has: (name) => rig.animations.has(name),
            duration: (name) => rig.animations.get(name)?.duration ?? 0,
            pace: (name) => rig.paceFor(name),
          },
    )
  })
  return null
}

function machineFor(
  map: Map<number, AnimStateMachine>,
  id: number,
  weaponMode: string,
  town: boolean,
): AnimStateMachine {
  let machine = map.get(id)
  if (machine === undefined) {
    machine = animStateMachine(weaponMode, town)
    map.set(id, machine)
  } else {
    machine.setTown(town)
  }
  return machine
}

export function syncActor3DPool(game: Game): void {
  hiddenActorSlots.delete(game.heroSlot)

  // Everything hidden this frame; the loops below re-place what exists. Group
  // entries are claimed per standing actor, so a vanished actor's parts park
  // off-screen instead of holding last frame's placement.
  for (const entry of POOL) entry.visible = false

  let index = 0
  const hero = game.heroPlacement()
  const nowMs = typeof performance === 'undefined' ? 0 : performance.now()
  const dt = heroLastMs === 0 ? 0 : Math.min(0.1, (nowMs - heroLastMs) / 1000)
  heroLastMs = nowMs
  const moving =
    heroPrev !== null && Math.hypot(hero.x - heroPrev.x, hero.y - heroPrev.y) > 1e-4
  // The ground the hero covered since the last frame: the locomotion clip is a
  // treadmill, so this (not a per-step speed ratio) is what its clock runs on.
  const heroGround = heroPrev === null ? 0 : Math.hypot(hero.x - heroPrev.x, hero.y - heroPrev.y)
  heroPrev = { x: hero.x, y: hero.y }
  // The state machine owns the clock and the clip choice: the game's mode
  // picks the state (`nu` town stances, `wl` town walk, `a1` swing, `gh` hit
  // reaction, `dd` death → corpse), one-shots play to their retail length and
  // hand back to neutral, and every clip change crossfades in 0.2 s.
  heroMachine.setTown(game.inTown)
  heroMachine.setPrefixes(CLIP_PREFIXES(game.heroWeaponMode()))
  // The locomotion clips step in place, so the clock runs on the ground the
  // hero actually covered: the clip advances by `distance / pace`, which leaves
  // the planted foot exactly where it was and stops the walk when the hero is
  // blocked. No per-step speed ratio, so nothing to jitter.
  const heroPose = heroMachine.update(
    dt,
    locomotionModeFor(
      clipSetFor('amazon-torso'),
      game.heroWeaponMode(),
      game.heroAnimMode(),
      game.inTown,
      dt > 0 ? heroGround / dt : 0,
    ),
    clipSetFor('amazon-torso'),
    { distance: heroGround, unitsPerTile: MODEL_UNITS_PER_TILE },
  )
  // Free rotation: it is a 3D game now — the hero turns continuously toward
  // where it is going (smoothed, no eight-direction lock). The movement
  // vector is the source of truth; the last direction is kept while standing.
  if (moving && heroPrev2 !== null) {
    heroTargetYaw = Math.atan2(hero.y - heroPrev2.y, hero.x - heroPrev2.x)
  }
  heroPrev2 = { x: hero.x, y: hero.y }
  const turn = 1 - Math.exp(-12 * dt)
  heroYaw += shortestAngle(heroTargetYaw - heroYaw) * turn
  for (let part = 0; part < HERO_PARTS.length; part += 1) {
    // The hero's model stands (and dies) wherever the hero is: the death clip
    // is the point, so the sprite is hidden unconditionally and the corpse
    // pose comes from `dd`'s handover to `dead`.
    place(POOL[index], hero.x, hero.y, heroYaw, true)
    POOL[index].animation = heroPose ?? undefined
    index += 1
  }
  hiddenActorSlots.add(game.heroSlot)

  // Live monsters win the limited model slots; a corpse holds its `dead` pose
  // only while there is room for it (the game never removes dead records).
  const modelled = game.monsters.filter((monster) => modelForMonster(monster))
  const ordered = [
    ...modelled.filter((monster) => monster.hp > 0),
    ...modelled.filter((monster) => monster.hp <= 0),
  ]
  const claimedMonsters = new Set<Actor3D[]>()
  for (const monster of ordered) {
    const spec = MONSTER_PART_MODELS[monster.kind]
    const instances = spec === undefined ? undefined : MONSTER_INSTANCES.get(monster.kind)
    const group = instances?.find((candidate) => !claimedMonsters.has(candidate))
    if (group === undefined) continue
    claimedMonsters.add(group)
    const prev = monsterPrev.get(monster.id)
    if (prev !== undefined && (monster.x !== prev.x || monster.y !== prev.y)) {
      monsterYaw.set(monster.id, Math.atan2(monster.y - prev.y, monster.x - prev.x))
    }
    monsterPrev.set(monster.id, { x: monster.x, y: monster.y })
    // Same contract as the hero's: the monster's walk clip runs on ground
    // covered, so its planted foot stays with the floor.
    const ground = prev === undefined ? 0 : Math.hypot(monster.x - prev.x, monster.y - prev.y)
    const targetYaw = monsterYaw.get(monster.id) ?? FACING_OF_DIR[monster.dir & 7]
    const smoothed = (monsterSmoothed.get(monster.id) ?? targetYaw) + shortestAngle(targetYaw - (monsterSmoothed.get(monster.id) ?? targetYaw)) * (1 - Math.exp(-12 * dt))
    monsterSmoothed.set(monster.id, smoothed)
    // Monsters play the same machine: `a1` swings, `sc` casts, `gh` reactions,
    // `dd` falls and holds the corpse pose. The set is theirs (bare clip
    // names — the prefix chain lands on them), and a dead monster keeps its
    // death clip instead of vanishing mid-fall.
    const machine = machineFor(monsterMachines, monster.id, 'hth', false)
    const monsterSet = clipSetFor(group[0].modelKey)
    const pose = machine.update(
      dt,
      locomotionModeFor(
        monsterSet,
        'hth',
        game.monsterAnimMode(monster),
        false,
        dt > 0 ? ground / dt : 0,
      ),
      monsterSet,
      { distance: ground, unitsPerTile: MODEL_UNITS_PER_TILE },
    )
    for (const entry of group) {
      place(entry, monster.x, monster.y, smoothed, true)
      entry.animation = pose ?? undefined
    }
    if (monster.slot) hiddenActorSlots.add(monster.slot)
  }

  // The town's own people, assembled from their unit definitions' parts at the
  // tiles the area placed them (`game.npcs[]`; they do not move, and face south
  // like `monstats`' `Idle` AI). An NPC with no entry in `NPC_PART_MODELS`
  // keeps its 2D sprite — its slot is left unhidden and NOTHING is drawn in its
  // place, because no other character's model may stand in for it. The same
  // holds when the fixed pool runs out of instances for that kind.
  // HD environment props: a kind with its own model replaces its drawn sprite
  // slot (the model stands where the sprite stood, at the sprite's scale).
  // `pine`/`deadTree` have no prop model — the package ships those as terrain
  // tiles — so they keep their sprites by the same no-substitution rule.
  for (const slot of game.propSlots) slot.model3d = false
  const claimedProps = new Set<Actor3D>()
  for (const slot of game.propSlots) {
    if (!slot.active) continue
    const kind = PROP_KINDS[slot.frame]
    const modelKey = kind === undefined ? undefined : PROP_PART_MODELS[kind]
    const instances = modelKey === undefined ? undefined : PROP_INSTANCES.get(kind)
    const entry = instances?.find((candidate) => !claimedProps.has(candidate))
    if (entry === undefined) continue
    claimedProps.add(entry)
    place(entry, slot.x, slot.y, 0, true)
    entry.scale = slot.scale
    slot.model3d = true // the model replaces the sprite this frame
  }

  const claimedNpcs = new Set<Actor3D[]>()
  for (const npc of game.npcs) {
    const instances = NPC_INSTANCES.get(npc.id)
    if (instances === undefined) continue
    const group = instances.find((candidate) => !claimedNpcs.has(candidate))
    if (group === undefined) continue
    claimedNpcs.add(group)
    // One machine per standing NPC (its parts share the pose). The retail
    // clip sets are the compact town ones (`fidget_01` / `neutral` / `walk`),
    // and the prefix chain lands on the bare names; a set without a clip
    // falls back to bind pose in the layer instead of erroring.
    let machine = npcMachines.get(group)
    if (machine === undefined) {
      machine = animStateMachine('hth', true)
      npcMachines.set(group, machine)
    }
    const pose = machine.update(dt, 'nu', clipSetFor(group[0]?.modelKey ?? ''))
    for (const entry of group) {
      place(entry, npc.x, npc.y, 0, true)
      entry.animation = pose ?? undefined
    }
    hiddenActorSlots.add(npc.slot)
  }

  actor3DTick.value = actor3DTick.value + 1
}
