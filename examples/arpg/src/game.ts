import { hasGameData, type GameData, type MonsterRow, type SkillRow } from './gamedata'
import type {
  GambleTable,
  HirelingTable,
  NpcTerms,
  NpcTermsTable,
  Stash,
  StashAddress,
  StorePageTable,
  VendorStock,
} from './d2/economy'
import { stashCell, vendorStock } from './d2/economy'
import { treasureClassFor } from './d2/item-source'
import { MonsterBrain, scaleMonster, type MonsterTables, type TableRow } from './d2/monsters'
import type { MissileDef, SkillRuntime } from './d2/skills'
import {
  orderSpeakerLines,
  parseQuests,
  questRequirement,
  questState,
  type Quest,
  type QuestIndex,
  type QuestState,
} from './d2/quests'
import { createCharacterStats, type CharStatsTable, type StatTable } from './d2/stats'
import type { DropResolver } from './d2/treasure'
import type { Item as GeneratedItemItem } from './d2/items'
import type { DialogueIndex } from './d2/dialogue'
import type { ActorArt, ActorMode, EffectArtKind, FlatAnimation, FlatArtFile } from './d2/anim-art'
import { EFFECT_ART_FILE, FlatArtCache } from './d2/anim-art'
import { loadAnimIndex } from './d2/anim'
import {
  advanceWalk,
  FLAT_RATE_PER_SECOND,
  frameFromRate,
  frameIndexOf,
  framesElapsed,
  loadAnimData,
  timingFor,
  unlistedTiming,
  type AnimDataFile,
  type AnimTiming,
} from './d2/anim-timing'
import { experienceClassOf } from './d2/experience'
import type { Placement } from './d2/places'
import type { Level } from './d2/levels'
import { exitAt, type AreaRef, type ExitSite, type TravelOption } from './d2/travel'
import {
  describeTravelFailure,
  describeTravelOption,
  type TravelOutcome,
  type TravelRuntime,
  type TravelSuccess,
} from './d2/travel-runtime'
/**
 * Game — the simulation behind the scene.
 *
 * One rule holds the whole file together: **entities own plain numbers, pool
 * slots own the reactive refs.** A monster's position is a plain `x`/`y`; the
 * slot it occupies carries the refs the scene tree reads. Nothing in the
 * simulation knows rendering exists, and nothing in the scene tree knows how a
 * monster moves.
 *
 * ## Fixed step
 *
 * `update(dtMs)` accumulates wall time and runs `step(1/60)` as many times as
 * fit. Simulation time is derived from the step count, never from the frame
 * timestamp — the rule `@rasenjs/core`'s frame source documents. A 100 ms hitch
 * runs six steps and one draw, not one 100 ms step, so nothing ever teleports
 * through a wall.
 *
 * ## Pools and culling
 *
 * Every renderable is a slot in a pool created at startup; slots are claimed and
 * released instead of mounted and unmounted, which keeps the scene tree's shape
 * stable. The one structural thing that does change is the culled, depth-sorted
 * `renderList` — and that is exactly what `each` is for.
 *
 * Culling is not an optimisation bolted on later: canvas 2D has no way to hide a
 * node without drawing it (there is no `visible` prop, only `opacity`), so an
 * off-screen prop still costs a `drawImage`. Keeping the map out of the render
 * list is the only way to make frame cost track what is on screen.
 */

import { ref, type SignalRef } from '@rasenjs/reactive-signals'
import { pickAutoTarget } from './input/aim'
import {
  depthOf,
  snapToWorldCompass,
  TILE_HEIGHT,
  TILE_WIDTH,
  toScreen,
  toWorld,
  worldAngleToIso,
} from './iso'
import {
  createActorSheet,
  createFireballSheet,
  createFlashSheet,
  createLootSheet,
  createPropSheet,
  LOOT_ICONS,
  spriteFrame,
  type ActorPalette,
  type ActorStyle,
  type LootIcon,
  type SpriteSheet,
} from './sprites'
import {
  createMinimapImage,
  findPath,
  generateWorld,
  isWalkable,
  isWalkableBody,
  randomSpawnPoint,
  type PropPlacement,
  type RealLevelGrid,
  type TerrainArt,
  type Tile,
  type WallCell,
  type WorldMap,
} from './world'

export type SoundCue =
  | 'swing'
  | 'hit'
  | 'crit'
  | 'fireball'
  | 'nova'
  | 'potion'
  | 'pickup-gold'
  | 'pickup-item'
  | 'levelup'
  | 'death'
  | 'ui'
  | 'roar'

export type { LootIcon } from './sprites'

export type SkillId = 'fireball' | 'nova' | 'potion'
/**
 * A monster's archetype.
 *
 * With the retail tables loaded these come from `monstats.txt`, so there are as
 * many kinds as the area spawns; `brute` remains for the boss.
 */
export type MonsterKind = 'skeleton' | 'zombie' | 'brute'
export type Rarity = 'common' | 'magic' | 'rare' | 'unique'

const STEP = 1 / 60
const MAX_STEPS = 5

/** Prop kinds, in sheet order — the frame index is the position here. */
export const PROP_KINDS = ['pine', 'deadTree', 'rock', 'brazier', 'bones', 'pillar'] as const

/**
 * Which drawn prop stands in for an `objects.txt` class until the class's own
 * art is loaded.
 *
 * `objects.txt` names 150 distinct classes; the drawn sheet has six shapes. The
 * mapping is by the table's own `Token` prefix and `Name`, so a chest becomes
 * bones rather than a tree, and anything unrecognised becomes a rock rather than
 * nothing at all.
 */
function propKindFor(def: { name: string; token: string | null; isDoor: boolean }): (typeof PROP_KINDS)[number] {
  const name = `${def.name} ${def.token ?? ''}`.toLowerCase()
  if (def.isDoor) return 'pillar'
  if (/tree|pine|dead|bush|plant/.test(name)) return 'pine'
  if (/brazier|fire|camp|torch|flame|candle|lamp/.test(name)) return 'brazier'
  if (/chest|casket|urn|barrel|corpse|crate|tome|book|sarcophag|coffin/.test(name)) return 'bones'
  if (/stone|rock|boulder|wall|rubble|pillar|column/.test(name)) return 'rock'
  if (/shrine|warp|portal|gate|well|statue|altar/.test(name)) return 'pillar'
  return 'rock'
}

// ---------------------------------------------------------------------------
// Balance
// ---------------------------------------------------------------------------

/**
 * The melee baseline, in tiles: how far a body can reach beyond itself.
 *
 * This is the `1` in the original's reach — the attacker's own body — with the
 * target's body added on top by {@link meleeReachTiles}. The two were a single
 * invented constant before (`1.55`), which is why a monster three tiles wide could
 * only be hit from a distance that left its body next to the hero untouched.
 */
const MELEE_BASE_REACH = 1

/** D2 measures reach in sub-tiles, five to a tile, the same 5x5 lattice the collision uses. */
const SUBTILES_PER_TILE = 5

/**
 * How far apart two centres may be and still connect, in tiles.
 *
 * The game tests the bodies, not the centres: a reach of one tile plus the
 * target's own size, so a 1x1 monster is hit from 1.5 tiles and a 3x3 from 2.5.
 * The weapon's `rangeadder` (a spear reaches further than a club) is the third
 * term; it is 0 until the hero has an equipped weapon to read it from.
 */
export function meleeReachTiles(targetSizeTiles: number, weaponRangeAdder = 0): number {
  return MELEE_BASE_REACH + targetSizeTiles / 2 + weaponRangeAdder / SUBTILES_PER_TILE
}

const HERO = {
  maxHealth: 190,
  maxMana: 60,
  damage: 19,
  speed: 4.1,
  cooldown: 0.55,
  healthRegen: 1.1,
  manaRegen: 3.4,
}

interface MonsterProfile {
  name: string
  maxHealth: number
  damage: number
  speed: number
  range: number
  cooldown: number
  xp: number
  scale: number
  aggro: number
  /** Armour, used to mitigate the hero's physical damage. */
  armor: number
}

const MONSTERS: Record<MonsterKind, MonsterProfile> = {
  skeleton: {
    name: 'Skeleton',
    maxHealth: 62,
    damage: 9,
    speed: 2.15,
    range: 1.3,
    cooldown: 1.1,
    xp: 24,
    scale: 1,
    aggro: 7,
    armor: 10,
  },
  zombie: {
    name: 'Rotting Dead',
    maxHealth: 98,
    damage: 14,
    speed: 1.5,
    range: 1.3,
    cooldown: 1.45,
    xp: 34,
    scale: 1.06,
    aggro: 6,
    armor: 14,
  },
  brute: {
    name: 'The Warden',
    maxHealth: 950,
    damage: 27,
    speed: 1.6,
    range: 1.9,
    cooldown: 1.7,
    xp: 520,
    scale: 1.62,
    aggro: 12,
    armor: 90,
  },
}

const SKILLS: Record<SkillId, { name: string; mana: number; cooldown: number }> = {
  fireball: { name: 'Fireball', mana: 8, cooldown: 0.65 },
  nova: { name: 'Frost Nova', mana: 22, cooldown: 6 },
  potion: { name: 'Health Potion', mana: 0, cooldown: 2.6 },
}

const POTION_HEAL = 78
const MAX_POTIONS = 8
const START_POTIONS = 4
const MAX_MONSTERS = 22
const PROPS_IN_POOL = 120

/**
 * The animation a missile's row names.
 *
 * `CelFile` is the column (`SafeArrow`, `Expansion\FireTraumaMissile`); two rows of
 * `missiles.txt` leave it empty, and there the missile's own name is what
 * `tools/export-anim.ts` keyed its art by.
 */
function celFileOf(missile: MissileDef): string {
  const cel = missile.row.CelFile
  return typeof cel === 'string' && cel.trim() !== '' ? cel : missile.name
}

/**
 * The export root, read the way the entry point reads it.
 *
 * `main.tsx` resolves the base from the document rather than from a bundler global
 * so the same build works from the dev-server root and from a sub-path; the
 * simulation is handed the art but not the base, and it needs the same answer, so
 * it asks the document the same question.
 */
function exportBase(): string {
  return new URL('.', document.baseURI).pathname
}

const COLOURS = {
  damageToMonster: '#ffe9a8',
  damageToHero: '#ff6b6b',
  heal: '#7ce08b',
  gold: '#ffd75e',
  mana: '#8fd0ff',
} as const

// ---------------------------------------------------------------------------
// Pool slots — the reactive side of an entity
// ---------------------------------------------------------------------------

/** A pooled hero/monster sprite. */
export interface ActorSlot {
  readonly kind: 'actor'
  active: boolean
  x: SignalRef<number>
  y: SignalRef<number>
  /** Drawn size, i.e. the sheet frame times the kind's scale. */
  width: SignalRef<number>
  height: SignalRef<number>
  frame: SignalRef<number>
  opacity: SignalRef<number>
  image: SignalRef<CanvasImageSource>
  flashImage: SignalRef<CanvasImageSource>
  /**
   * The grid of the sheet this slot is currently drawn with.
   *
   * Per slot, not per game, and that is the whole point: a pool slot is handed out
   * again to a different actor when one dies, and with the retail art loaded the
   * hero's strip, a monster token's strip and an NPC's palette-swapped copy are
   * *different images with different cell sizes*. A single `game.actorGeometry` read
   * from the drawn placeholder sheet cropped every one of them at 44 x 56 and drew
   * nothing recognisable — which is why no character was visible on screen while the
   * simulation had the hero at the middle of the viewport and 11 NPCs standing in the
   * town.
   *
   * Refs rather than numbers because the renderer's `each` reuses a mounted node for
   * the same slot: a plain number that changed under it would never repaint.
   */
  frameWidth: SignalRef<number>
  frameHeight: SignalRef<number>
  columns: SignalRef<number>
  flash: SignalRef<number>
  /** Health-bar fill, 0..1. */
  hp: SignalRef<number>
  /** Health-bar presence, 0..1 — kept numeric so the node never unmounts. */
  barOpacity: SignalRef<number>
}

/** A pooled static prop. Plain numbers — props never move, so they subscribe to nothing. */
export interface PropSlot {
  readonly kind: 'prop'
  active: boolean
  /**
   * The 3D actor layer drew this prop's own model this frame: the sprite must
   * stand down (set per frame by `three-d/game-actors.ts`, never stored).
   */
  model3d?: boolean
  image: CanvasImageSource
  x: number
  y: number
  frame: number
  scale: number
}

/** A pooled ground drop. */
export interface LootSlot {
  readonly kind: 'loot'
  active: boolean
  x: SignalRef<number>
  y: SignalRef<number>
  opacity: SignalRef<number>
  label: SignalRef<string>
  labelColor: SignalRef<string>
  image: CanvasImageSource
  frame: number
}

/** A pooled floating number (damage, pickup, level-up). */
export interface FloatSlot {
  readonly kind: 'float'
  active: boolean
  x: SignalRef<number>
  y: SignalRef<number>
  opacity: SignalRef<number>
  text: SignalRef<string>
  color: SignalRef<string>
}

/** A pooled spell effect: an expanding ring. */
export interface EffectSlot {
  readonly kind: 'effect'
  active: boolean
  x: SignalRef<number>
  y: SignalRef<number>
  radius: SignalRef<number>
  opacity: SignalRef<number>
  color: SignalRef<string>
  thickness: SignalRef<number>
}

// ---------------------------------------------------------------------------
// Entities — the simulation side
// ---------------------------------------------------------------------------

export interface Monster {
  id: number
  kind: MonsterKind
  /**
   * The monster's own animations, when the export has them.
   *
   * Keyed by `monstats.Code`, so two monsters of the same archetype but different
   * classes carry different art — which is the point: `kind` picks the behaviour
   * and the drawn fallback, and this picks what the creature actually looks like.
   */
  art?: ActorArt | null
  /**
   * The monster's behaviour, from the tables' own AI parameters.
   *
   * Present only when the monster tables are loaded: every number the brain uses
   * (awareness, standoff, attack cooldown, which attack) is read from the AI's
   * parameters rather than invented.
   */
  brain?: MonsterBrain | null
  x: number
  y: number
  dir: number
  hp: number
  maxHp: number
  cooldown: number
  hitFlash: number
  /** Seconds left of the attack swing (`a1`); set at the swing, decays per step. */
  attackTimer: number
  /** Seconds left of the skill cast (`sc`); set when the brain casts, decays. */
  castTimer: number
  aggro: boolean
  wanderAngle: number
  wanderTimer: number
  walkPhase: number
  /** The ground this monster actually covered last step, in tiles (0 = blocked). */
  movedLastStep: number
  slot: ActorSlot | null
}

export interface Item {
  name: string
  rarity: Rarity
  icon: LootIcon
  /**
   * The generator's own item, when this one came out of the tables.
   *
   * The fields above are the *view*: a name, a rarity, an icon and the printed stat
   * lines. The stash works on the generated item — it has to, because its grid is
   * sized by the base item's `invWidth`/`invHeight` and its stacks by `maxstack` — so
   * the generator's object travels with the view instead of being dropped at pickup
   * and re-invented at deposit.
   */
  source?: GeneratedItemItem
  /** The `global/items` DC6 name the game draws, or null for a made-up drop. */
  graphic: string | null
  /**
   * The item's stat lines, as the game would print them.
   *
   * Present for a retail item: the generators produce real affix text, and
   * showing it is the difference between "a rare sword" and the actual rolls.
   */
  tooltip?: string[]
}

export interface Drop {
  x: number
  y: number
  ttl: number
  kind: 'gold' | 'health' | 'mana' | 'item'
  gold: number
  item: Item | null
  slot: LootSlot | null
}

interface Projectile {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  damage: number
  slot: ActorSlot | null
  /**
   * The missile's own animation, when the export has it.
   *
   * `missiles.txt` says which animation a skill's missile plays — the Amazon's
   * Magic Arrow is `SafeArrow` — so the sheet is the game's, not a drawn ball.
   * Null for a skill the tables do not describe, and the drawn sheet stands in.
   */
  art: FlatAnimation | null
  /** The missile that plays where this one lands, for the impact effect. */
  impact: FlatAnimation | null
  /** How long it has been in flight, for the animation's frame. */
  age: number
}

interface Floating {
  x: number
  y: number
  life: number
  maxLife: number
  rise: number
  slot: FloatSlot | null
}

interface Effect {
  /** What the effect is for, which is what decides the overlay it plays. */
  kind: EffectArtKind
  x: number
  y: number
  life: number
  maxLife: number
  radius: number
  thickness: number
  /** The drawn ring. Used when the kind has no art, or its art has not loaded. */
  slot: EffectSlot | null
  /** The game's own overlay, drawn *instead of* the ring when there is one. */
  art: FlatAnimation | null
  artSlot: ActorSlot | null
  /** Simulation time when it spawned, for the overlay's frame. */
  started: number
}

export interface SkillView {
  id: SkillId
  name: string
  cooldown: number
  maxCooldown: number
  mana: number
  ready: boolean
  affordable: boolean
}

export interface BossView {
  name: string
  hp: number
  maxHp: number
}

/**
 * A minimap dot.
 *
 * The positions are refs and the objects are reused for the lifetime of the
 * thing they track: `each` keys instances by identity, so handing it freshly
 * built dots eight times a second would tear down and rebuild the whole
 * minimap rather than move three pixels.
 */
export interface MinimapBlip {
  id: number
  kind: 'hero' | 'monster' | 'boss'
  x: SignalRef<number>
  y: SignalRef<number>
}

export interface LogEntry {
  id: number
  text: string
  rarity: Rarity
}

/**
 * The retail content a real area brings with it: its `.ds1` placements and the
 * dialogue table.
 *
 * Both are optional and independent. A build with the maps but no `vo.json`
 * still gets the town's NPCs and props; one with neither falls back to the
 * generated map, which is what the game did before either existed.
 */
export interface WorldContent {
  placements: readonly Placement[]
  dialogue: DialogueIndex | null
  /**
   * Rows from `strings_quests.json`, the quest log's own step text.
   *
   * There are three quest tables and the loader builds one of them (the dialogue
   * index). This is the second: with it, each quest's log steps come from the
   * game's own quest strings. Without it the quests still have their names (from
   * `gamedata_quests.json`) and their dialogue (from `vo.json`), and only the
   * step text and the sub-instructions are missing — see `d2/quests.ts`.
   */
  questStrings?: readonly TableRow[] | null
  /** The display name for a monster id, from `monstats.NameStr`. */
  nameOf?(monsterId: string): string | null
}

/**
 * The three economies, as `d2/economy-source.ts` builds them.
 *
 * Each part is independently optional and null when its source is absent, so the
 * panel that shows it can say which table or layout is missing rather than drawing
 * invented contents.
 */
export interface EconomyContent {
  readonly stash: Stash | null
  readonly storePages: StorePageTable | null
  readonly npcTerms: NpcTermsTable | null
  readonly hirelings: HirelingTable | null
  readonly gamble: GambleTable | null
  /** Every table that was not found. */
  readonly missing: readonly string[]
}

/**
 * A unit that stands in the world and does nothing else: the town's livestock.
 *
 * A cow is a `monstats` row with `AI: Idle` and no `npc` flag, so the placement
 * reader cannot call it an NPC — and calling it a monster made the town's two cows and
 * five chickens spawn as hostile skeletons. They are their own list precisely so that
 * no combat rule has to remember to skip them: nothing that fights iterates this.
 */
export interface Critter {
  /** `monstats.txt` id, e.g. `cow`. */
  readonly id: string
  /** The name the string tables give it, or the id. */
  readonly displayName: string
  readonly x: number
  readonly y: number
  readonly slot: ActorSlot
}

/** A town NPC the player can talk to. */
export interface Npc {
  /** `monstats.txt` id, e.g. `greed`. */
  readonly id: string
  /** The name the HUD shows, e.g. `Gheed`. */
  readonly displayName: string
  /** Tile position, from the area's own placement. */
  readonly x: number
  readonly y: number
  readonly slot: ActorSlot
}

/** What the dialogue box is showing. */
export interface DialogueView {
  /** `monstats.txt` id of the speaker. */
  readonly speaker: string
  /** The speaker's display name. */
  readonly displayName: string
  /** The speaker's keys, so the panel can step through them. */
  readonly keys: readonly string[]
  /** Index into `keys`. */
  readonly index: number
  /** The line's text. */
  readonly text: string
}

/** Everything the HUD reads. One object so `render.tsx` never reaches into the sim. */
export interface HudState {
  health: SignalRef<number>
  maxHealth: SignalRef<number>
  mana: SignalRef<number>
  maxMana: SignalRef<number>
  /**
   * Stamina, whose capacity comes from `charstats.txt` and whose consumption is not
   * modelled; see `HeroState.stamina`.
   */
  stamina: SignalRef<number>
  maxStamina: SignalRef<number>
  level: SignalRef<number>
  xpRatio: SignalRef<number>
  gold: SignalRef<number>
  kills: SignalRef<number>
  potions: SignalRef<number>
  maxPotions: number
  skills: SignalRef<SkillView[]>
  boss: SignalRef<BossView | null>
  areaName: SignalRef<string>
  objective: SignalRef<string>
  fps: SignalRef<number>
  alive: SignalRef<boolean>
  respawnIn: SignalRef<number>
  log: SignalRef<LogEntry[]>
  minimap: SignalRef<MinimapBlip[]>
  monsterCount: SignalRef<number>
  targetName: SignalRef<string>
  stickActive: SignalRef<boolean>
  stickX: SignalRef<number>
  stickY: SignalRef<number>
  stickOriginX: SignalRef<number>
  /** The name of the NPC the hero is standing next to, or empty. */
  npcPrompt: SignalRef<string>
  /** The dialogue box, or null when nothing is being said. */
  dialogue: SignalRef<DialogueView | null>
  stickOriginY: SignalRef<number>
  aiming: SignalRef<boolean>
  aimAngle: SignalRef<number>
  /** Where the aim dot sits, in canvas CSS pixels. */
  aimDotX: SignalRef<number>
  aimDotY: SignalRef<number>
  mapWidth: number
  mapHeight: number
  /**
   * The ways out of the area the player is in, for the HUD to list.
   *
   * The list is the simulation's rather than the HUD's because *which* areas can be
   * entered is a fact about the tables (`lvlprest.txt`), and the HUD has no access
   * to them; see {@link Game.syncTravelHud}.
   */
  travel: SignalRef<TravelRow[]>
}

/**
 * One way out of the current area, as the HUD lists it.
 *
 * `areaId` is what {@link Game.travelTo} takes, so a row is a button as well as a
 * label: the doors of an area are tiles, and the roads between areas that carry no
 * tile (a waypoint, or a door the tables leave as an object) can only be offered as
 * a list.
 */
export interface TravelRow {
  areaId: number
  /** The destination as the player sees it, e.g. `Outer Cloister`. */
  label: string
  /** How the road gets there, and why it cannot be taken when it cannot. */
  note: string
  /** Whether this build can assemble the destination. */
  loadable: boolean
}

/** mulberry32 — a tiny deterministic PRNG so a demo run is reproducible. */
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

const PALETTES: Record<'hero' | 'npc' | MonsterKind, ActorPalette> = {
  hero: {
    armor: '#3f6fa8',
    armorDark: '#2b4d78',
    skin: '#e2b48c',
    accent: '#d8c07a',
    weapon: '#d3dae4',
    eye: '#20242c',
  },
  // Town NPCs are not a monster kind: they share the actor geometry so they sit
  // in the same pools, but wear cloth rather than the hero's plate.
  npc: {
    armor: '#6b5b3e',
    armorDark: '#463a26',
    skin: '#e0b489',
    accent: '#b9a06a',
    weapon: '#c9c2ae',
    eye: '#2a2118',
  },
  skeleton: {
    armor: '#4a4a46',
    armorDark: '#33332f',
    skin: '#ded7c0',
    accent: '#6d6a5c',
    weapon: '#a9a396',
    eye: '#1d1d1a',
  },
  zombie: {
    armor: '#5b6340',
    armorDark: '#3c4229',
    skin: '#8fae6a',
    accent: '#4a5230',
    weapon: '#8c7a52',
    eye: '#c9302c',
  },
  brute: {
    armor: '#7a2018',
    armorDark: '#4d120d',
    skin: '#b4553f',
    accent: '#e0a94a',
    weapon: '#c9ccd4',
    eye: '#ffd24a',
    aura: 'rgba(255,96,40,0.5)',
  },
}

const ITEM_PREFIXES = ['Rusted', 'Sturdy', 'Keen', 'Grim', 'Hallowed', 'Runed', 'Savage']
const ITEM_BASES = ['Blade', 'Warhammer', 'Hauberk', 'Greaves', 'Signet', 'Ward', 'Crown']
const ITEM_SUFFIXES = ['of the Bear', 'of Flame', 'of Haste', 'of Warding', 'of the Wolf']

/**
 * How long one swing holds the `a1` mode, and one cast the `sc` mode: the mode
 * selects the animation, and the 3D layer's state machine plays the retail clip
 * to its own length regardless.
 */
const SWING_MODE_SECONDS = 0.4
const CAST_MODE_SECONDS = 0.6

/**
 * The retail animation modes a held weapon selects — the suffix of the player
 * clip family (`1hs_attack1`, `bow_walk`, …; `hth` is unarmed). The game's own
 * player clip sets carry all eight (the amazon set has 213 clips across them).
 */
export type WeaponMode = 'hth' | '1hs' | '1ht' | '2hs' | '2ht' | 'bow' | 'xbow' | 'stf'

/**
 * `weapons.txt`'s `type` codes → the animation mode that type holds. The
 * codes are the table's own (`swor`, `jave`, `xbow`, …); a type this table
 * does not name falls back to `1hs`, the one-handed swing, rather than
 * freezing the actor.
 */
const WEAPON_MODE_BY_TYPE: Record<string, WeaponMode> = {
  // One-handed melee.
  swor: '1hs',
  axe: '1hs',
  mace: '1hs',
  scep: '1hs',
  club: '1hs',
  knif: '1hs',
  wand: '1hs',
  orb: '1hs',
  h2h: '1hs',
  h2h2: '1hs',
  // Two-handed melee.
  hamm: '2hs',
  // Thrown / javelin.
  jave: '1ht',
  tkni: '1ht',
  taxe: '1ht',
  tpot: '1ht',
  // Thrusting two-handers.
  spea: '2ht',
  pole: '2ht',
  aspe: '2ht',
  // Launchers and staves.
  bow: 'bow',
  abow: 'bow',
  xbow: 'xbow',
  staf: 'stf',
}

/**
 * The animation mode a weapon selects: its type's mode, with one-handers
 * promoted to the two-handed swing when the item itself is two-handed
 * (`twoHanded`, the `2handed` column).
 */
export function weaponModeOf(base: { type: string; twoHanded: boolean }): WeaponMode {
  const mode = WEAPON_MODE_BY_TYPE[base.type.trim().toLowerCase()] ?? '1hs'
  if (base.twoHanded && mode === '1hs') return '2hs'
  return mode
}

interface HeroState {
  x: number
  y: number
  dir: number
  facing: number
  hp: number
  maxHp: number
  mana: number
  maxMana: number
  /**
   * Stamina, from the class's own `charstats.txt` row.
   *
   * Only the *capacity* is modelled from the tables: what spends stamina is running,
   * which this build does not distinguish from walking, so the pool starts full and
   * the HUD's stamina strip reads the capacity. Nothing here invents a drain rate.
   */
  stamina: number
  maxStamina: number
  damage: number
  armor: number
  walkPhase: number
  /**
   * The ground the hero actually covered last step, in tiles. Zero while
   * pushed against a wall — the 3D layer uses it to plant the feet (a walker
   * that is blocked does not walk on the spot).
   */
  movedLastStep: number
  cooldown: number
  hitFlash: number
  /** Seconds left of the attack swing (`a1`); set at the swing, decays per step. */
  attackTimer: number
  /** Seconds left of the cast (`sc`); set when a skill fires, decays per step. */
  castTimer: number
  /** The held weapon's animation mode (`hth` unarmed); selects the clip family. */
  weaponMode: WeaponMode
  potions: number
  level: number
  xp: number
  xpToNext: number
  gold: number
  kills: number
  alive: boolean
  respawnTimer: number
}

/**
 * The area's map, as one object that outlives a travel.
 *
 * `render.tsx` reads `game.map` **once**, when the canvas mounts, and hands that
 * object to the ground `image` node — so a swap cannot be a new object: the node
 * would go on drawing the area the player left. What the node *does* re-read is the
 * props it was built from, through the computed the JSX compiler wraps a member
 * expression in (`map.ground` becomes `() => map.ground`), and that means the five
 * fields a travel changes have to be signals: the bitmap and the four numbers that
 * place it.
 *
 * Everything else is a plain forward to the map in hand. The simulation reads
 * `tiles`, `width` and the rest many times a frame — `isWalkable`, the path-finder,
 * the spawner — and has no reason to be woken by them, so they stay out of the
 * reactive graph and cost exactly what they cost before.
 */
/**
 * Drop a baked bitmap's pixels now.
 *
 * Setting a canvas' dimensions to zero frees its backing store immediately; a
 * canvas that is merely unreferenced waits for the collector, and a baked map is
 * far too large to keep two of them resident across a travel.
 */
function releaseCanvas(canvas: HTMLCanvasElement | undefined): void {
  if (canvas === undefined) return
  canvas.width = 0
  canvas.height = 0
}

class AreaMapView implements WorldMap {
  private current: WorldMap
  private readonly groundImage: SignalRef<HTMLCanvasElement>
  private readonly roofImage: SignalRef<HTMLCanvasElement>
  private readonly groundAtX: SignalRef<number>
  private readonly groundAtY: SignalRef<number>
  private readonly groundSizeX: SignalRef<number>
  private readonly groundSizeY: SignalRef<number>

  constructor(map: WorldMap) {
    this.current = map
    this.groundImage = ref(map.ground)
    this.roofImage = ref(map.roof)
    this.groundAtX = ref(map.groundX)
    this.groundAtY = ref(map.groundY)
    this.groundSizeX = ref(map.groundWidth)
    this.groundSizeY = ref(map.groundHeight)
  }

  /** Make a freshly baked map the one the scene tree draws. */
  adopt(map: WorldMap): void {
    // Hand the outgoing area's bitmaps back before taking the new ones. A bake is
    // (width + height) * 80 by (width + height) * 40 pixels — 129 MB for the
    // town's 57x41 grid, and twice that with the roof pass — so leaving the old
    // pair alive until the collector notices keeps two areas resident through a
    // travel, which is when the WebGL context was being lost.
    releaseCanvas(this.current?.ground)
    releaseCanvas(this.current?.roof)
    this.current = map
    this.groundImage.value = map.ground
    this.roofImage.value = map.roof
    this.groundAtX.value = map.groundX
    this.groundAtY.value = map.groundY
    this.groundSizeX.value = map.groundWidth
    this.groundSizeY.value = map.groundHeight
  }

  get ground(): HTMLCanvasElement {
    return this.groundImage.value
  }

  get wallCells(): WallCell[] {
    return this.current.wallCells
  }

  get roof(): HTMLCanvasElement {
    return this.roofImage.value
  }

  get groundX(): number {
    return this.groundAtX.value
  }

  get groundY(): number {
    return this.groundAtY.value
  }

  get groundWidth(): number {
    return this.groundSizeX.value
  }

  get groundHeight(): number {
    return this.groundSizeY.value
  }

  get width(): number {
    return this.current.width
  }

  get height(): number {
    return this.current.height
  }

  get tiles(): Tile[] {
    return this.current.tiles
  }

  get props(): PropPlacement[] {
    return this.current.props
  }

  get heroStart(): { x: number; y: number } {
    return this.current.heroStart
  }

  get spawnPoints(): Array<{ x: number; y: number }> {
    return this.current.spawnPoints
  }

  get bossSpawn(): { x: number; y: number } {
    return this.current.bossSpawn
  }

  /** The area's own level grid, so movement can ask for sub-cell flags. */
  get realLevel(): RealLevelGrid | null {
    return this.current.realLevel
  }
}

/**
 * How close the hero has to be to a door tile for the door to count as used.
 *
 * A door is an orientation-10 tile in a *wall* layer, so whether a walker may stand
 * on it depends on the level: the Rogue Encampment's three tiles are all walkable and
 * `Act 1 - Courtyard 2`'s single tile is not. The rule is therefore "on the tile, or
 * one tile from it" — the same "walk into the doorway" gesture either way — and one
 * tile is what an isometric door reads as on screen.
 */
const DOOR_REACH = 1.35

export class Game {
  /**
   * The area's map, as the stable object the scene tree draws.
   *
   * Private because a caller must not swap it: `adoptArea` is the one place a map
   * changes, and it has a good deal more to do than change the bitmap. See
   * {@link AreaMapView} for why `map` is a view rather than the map itself.
   */
  private readonly areaMap: AreaMapView
  /**
   * The minimap's own picture of the ground, as a data URL.
   *
   * A signal rather than a string for the same reason the map is a view: the HUD's
   * `<img src={game.minimapImage}>` is a prop the DOM binder re-reads, and a plain
   * string would leave the town's minimap drawn over the Cloister.
   */
  private readonly minimapSource: SignalRef<string>

  /**
   * The travel runtime, handed in once the tables have loaded.
   *
   * A setter rather than a constructor argument: it is built from tables this class
   * does not load, it is the piece that fetches, and a build without the export has
   * no travel at all rather than a travel that cannot work.
   */
  private travel: TravelRuntime | null = null
  /** The current area's door tiles, so the per-frame check has something to test. */
  private sites: readonly ExitSite[] = []
  /** One travel at a time: the loop sees the same door on every frame. */
  private travelling = false
  /**
   * Whether the door under the hero may fire.
   *
   * Cleared when a travel starts and re-armed once the hero is away from every door,
   * which is what stops the door the hero *arrives* at from sending them straight
   * back: `loadArea` deliberately places a walker at the destination's own door back.
   */
  private doorArmed = true

  /**
   * The area's map.
   *
   * A getter, not a field, because the object it returns is the one the scene tree
   * captured when it mounted: a travel *adopts into* it rather than replacing it. See
   * {@link AreaMapView}.
   */
  get map(): WorldMap {
    return this.areaMap
  }

  /**
   * The minimap's picture of the ground, as a data URL.
   *
   * A getter over a signal for the same reason: `hud.tsx` binds it as an `<img src>`,
   * and a plain string would keep drawing the area the player left.
   */
  get minimapImage(): string {
    return this.minimapSource.value
  }

  readonly sheets: {
    hero: SpriteSheet
    heroFlash: SpriteSheet
    skeleton: SpriteSheet
    skeletonFlash: SpriteSheet
    zombie: SpriteSheet
    zombieFlash: SpriteSheet
    brute: SpriteSheet
    bruteFlash: SpriteSheet
    props: SpriteSheet
    loot: SpriteSheet
    fireball: SpriteSheet
  }

  /** Sheet geometry, exported so the scene tree can size its sprites. */
  readonly actorGeometry: { frameWidth: number; frameHeight: number; columns: number }
  readonly lootGeometry: { frameWidth: number; frameHeight: number; columns: number }
  readonly propGeometry: { frameWidth: number; frameHeight: number; columns: number }
  readonly fireballGeometry: { frameWidth: number; frameHeight: number; columns: number }
  readonly propKinds = PROP_KINDS

  readonly actorSlots: ActorSlot[] = []
  readonly propSlots: PropSlot[] = []
  readonly lootSlots: LootSlot[] = []
  readonly floatSlots: FloatSlot[] = []
  readonly effectSlots: EffectSlot[] = []

  /** Depth-sorted, culled list the scene tree renders. `each` reorders this. */
  readonly renderList: SignalRef<Array<ActorSlot | PropSlot | LootSlot | FloatSlot | EffectSlot>> = ref([])

  readonly heroSlot: ActorSlot

  readonly monsters: Monster[] = []
  readonly drops: Drop[] = []
  readonly hud: HudState

  readonly cameraX: SignalRef<number> = ref(0)
  readonly cameraY: SignalRef<number> = ref(0)

  private readonly projectiles: Projectile[] = []
  private readonly floats: Floating[] = []
  private readonly effects: Effect[] = []
  private readonly cooldowns = new Map<SkillId, number>()
  private readonly random: () => number
  private readonly hero: HeroState
  private readonly commands = {
    moveX: 0,
    moveY: 0,
    moving: false,
    path: null as Array<{ x: number; y: number }> | null,
    pathIndex: 0,
    attackTarget: null as Monster | null,
    aimActive: false,
    aimAngle: 0,
    holdCast: null as SkillId | null,
  }
  private readonly onScreen = new Set<object>()
  private readonly minimapBlips = new Map<number, MinimapBlip>()
  /** The retail rule tables, or null when they were not exported. */
  private readonly realData: GameData | null = null
  /** The player's real skills, used for the action bar labels. */
  private readonly realSkills: SkillRow[] = []
  private readonly areaNameOverride: string | null = null
  /**
   * The quests, from the three tables that describe them.
   *
   * See `d2/quests.ts`: the names come from `gamedata_quests.json`, the dialogue
   * from `vo.json`, and the log steps from `strings_quests.json` when the loader
   * supplied it.
   */
  private readonly quests: QuestIndex
  /** The act the current area belongs to, so the log defaults to it. */
  private currentAct = 1
  /** The NPCs the player has spoken to, by `monstats` id. */
  private readonly talkedTo = new Set<string>()
  /** Whether the area's superunique has been killed. */
  private bossSlain = false
  /** What the objective reads when no quest table was loaded. */
  private static readonly OBJECTIVE_FALLBACK = 'Slay the Warden haunting the sanctum'
  /** Retail mana cost per action-bar slot, when the tables are loaded. */
  private readonly realMana = new Map<SkillId, number>()
  /** Real monsters that spawn in the current act, by id. */
  private readonly monsterPool: MonsterRow[] = []
  /** Display name → monstats id, so a spawned monster can find its own AI row. */
  private readonly monsterNameToId = new Map<string, string>()
  /** Real item generation, or null when the item tables were not exported. */
  private readonly dropResolver: DropResolver | null = null
  /**
   * The game's own generator, in the shape the item module expects.
   *
   * One generator for the whole game, so a run is still reproducible from the
   * seed: drops and spawns draw from the same sequence.
   */
  private readonly itemRandom = {
    next: (): number => this.random(),
    int: (maxExclusive: number): number =>
      maxExclusive <= 1 ? 0 : Math.floor(this.random() * maxExclusive),
    range: (min: number, max: number): number => {
      const low = Math.min(min, max)
      const high = Math.max(min, max)
      return low + Math.floor(this.random() * (high - low + 1))
    },
  }
  /** Real monster tables, or null when they were not exported. */
  private readonly monsterTables: MonsterTables | null = null
  /** The calc-driven skill runtime, or null when the skill tables are absent. */
  private readonly skillRuntime: SkillRuntime | null = null
  /** The class attribute table, for the character sheet. */
  private readonly charStats: CharStatsTable | null = null
  /**
   * `itemstatcost.txt`, needed for the character's attribute links.
   *
   * A character's mana is not a flat number: it is `energy × ManaPerMagic` plus a
   * base, and that dependency is an `op`-8 link in this table. Without it the
   * sheet reports zero mana.
   */
  private readonly statTable: StatTable | null = null
  /**
   * The area's monster level, from `levels.txt`.
   *
   * This is what the tables scale a monster by, so it has to be the real area
   * level and not the character's: Blood Moor is level 2 and the Cathedral is 11
   * regardless of who walks in.
   */
  private areaMonsterLevel = 1
  /**
   * Whether the area spawns its own monsters.
   *
   * `levels.txt` gives a town a `MonDen` of 0, which is the game's own way of
   * saying the area has no ambient population. Without this the Rogue
   * Encampment spawns skeletons, and no amount of correct NPC placement hides
   * that.
   */
  private areaHasMonsters = true
  private readonly soundHandlers = new Set<(cue: SoundCue) => void>()
  private accumulator = 0
  private elapsed = 0
  private spawnTimer = 7
  private nextMonsterId = 1
  private nextLogId = 1
  private fpsAccumulator = 0
  private fpsFrames = 0
  private minimapTimer = 0
  private paused = false
  private readonly economy: EconomyContent | null
  private readonly world: WorldContent | null
  private readonly heroArt: ActorArt | null
  private readonly monsterArt: ReadonlyMap<string, ActorArt> | null
  /**
   * The missiles and overlays the run plays, and what the tables said about them.
   *
   * Filled in the background by {@link warmFlatArt}: *which* animation a missile
   * plays depends on which skill fires it, so the key is read from `skills.txt`'s
   * missile column and `missiles.txt`'s `CelFile` at the moment of the cast, and
   * cannot be handed in with the rest of the art. Until it is filled the drawn
   * ball and ring stand in, which is what a build with no export keeps.
   */
  private flatArt: FlatArtCache | null = null
  /** What the flat-key art answered, for the startup report. */
  private readonly flatArtCounts = { projectileArt: 0, projectilesDrawn: 0, effectArt: 0, effectsDrawn: 0 }
  /** Seconds since the hero's current mode began, for the animation frame. */
  private heroModeTime = 0
  private heroMode: ActorMode = 'nu'
  /**
   * `global/AnimData.D2`, the game's own animation clock.
   *
   * Null when the export is absent. Every frame the app draws for an actor comes from
   * it — see `src/d2/anim-timing.ts` — and {@link timingOf} names what happens for an
   * animation it does not list rather than falling back to a rate of the app's own.
   */
  private animData: AnimDataFile | null = null
  /** The area's NPCs, in placement order. Public so the HUD can mark them. */
  readonly npcs: Npc[] = []
  /** The area's passive units, in placement order. Drawn and never fought. */
  readonly critters: Critter[] = []
  /** The NPC the prompt is currently offering, or null. */
  private nearbyNpc: Npc | null = null
  /** What the last `placeAreaContent` put on the map, for the startup report. */
  private areaContent: {
    npcs: number
    critters: number
    monsters: number
    props: number
    skippedForRoom: number
    total: number
  } | null = null
  /** NPC sheets: the same actor geometry with an NPC palette. */
  private npcSheet!: SpriteSheet
  private npcFlash!: SpriteSheet

  constructor(
    seed = 20261013,
    /** Original art, when the player has extracted some. Optional. */
    art: {
      loot?: Partial<Record<LootIcon, CanvasImageSource>>
      terrain?: TerrainArt
    } = {},
    /** The game's own rule tables, when they have been exported. */
    data?: GameData,
    /** A real area's grid, when level tables and files are available. */
    level?: RealLevelGrid | null,
    /** Real item generation, when the item tables are exported. */
    items?: DropResolver | null,
    /** Real monster tables, when they are exported. */
    monsters?: MonsterTables | null,
    /** The real skill runtime, when the skill tables are exported. */
    skills?: SkillRuntime | null,
    /** The parsed `charstats.txt`, when the tables are exported. */
    charStats?: CharStatsTable | null,
    /** The parsed `itemstatcost.txt`, needed to resolve attribute links. */
    statTable?: StatTable | null,
    /**
     * The area's own `.ds1` placements and the dialogue table.
     *
     * Only meaningful with a real `level`: a generated map has no placements to
     * place. NPCs and props come from here, so a town is furnished by the same
     * data the retail game furnishes it with.
     */
    world?: WorldContent | null,
    /**
     * The hero's real animations, when they have been exported.
     *
     * Present, they replace the drawn actor sheet for the hero: the mode follows
     * the hero's state (`wl` while walking, `a1` on an attack, `dd` on death) and
     * the frame follows the animation rather than the drawn walk cycle.
     */
    heroArt?: ActorArt | null,
    /** Every monster token's art, by lower-cased `monstats.Code`. */
    monsterArt?: ReadonlyMap<string, ActorArt> | null,
    /**
     * The three economies, when the tables and the panels are exported.
     *
     * Optional and independent, like every other table this app takes: a build with
     * the stash but no `hireling.txt` has a working stash and a hireling panel that
     * says so.
     */
    economy?: EconomyContent | null,
  ) {
    this.economy = economy ?? null
    this.random = createRandom(seed)
    this.dropResolver = items ?? null
    this.monsterTables = monsters ?? null
    this.skillRuntime = skills ?? null
    this.charStats = charStats ?? null
    this.statTable = statTable ?? null
    this.world = world ?? null
    this.heroArt = heroArt ?? null
    this.monsterArt = monsterArt ?? null
    this.areaMap = new AreaMapView(generateWorld(seed, art.terrain ?? {}, level ?? null))
    this.minimapSource = ref(createMinimapImage(this.areaMap))

    const heroStyle: ActorStyle = { palette: PALETTES.hero, cape: '#8c2f2f', helm: true }
    const styles: Record<MonsterKind, ActorStyle> = {
      skeleton: { palette: PALETTES.skeleton },
      zombie: { palette: PALETTES.zombie },
      brute: { palette: PALETTES.brute, scale: MONSTERS.brute.scale, helm: true },
    }

    this.sheets = {
      hero: createActorSheet(heroStyle),
      heroFlash: createFlashSheet(heroStyle),
      skeleton: createActorSheet(styles.skeleton),
      skeletonFlash: createFlashSheet(styles.skeleton),
      zombie: createActorSheet(styles.zombie),
      zombieFlash: createFlashSheet(styles.zombie),
      brute: createActorSheet(styles.brute),
      bruteFlash: createFlashSheet(styles.brute),
      props: createPropSheet(PROP_KINDS),
      loot: createLootSheet(art.loot),
      fireball: createFireballSheet(),
    }

    // Town NPCs are drawn with the actor geometry in their own palette, so the
    // packed sheet is built here rather than inside the placement loop.
    const npcStyle: ActorStyle = { palette: PALETTES.npc, cape: '#3f4a63', helm: false }
    this.npcSheet = createActorSheet(npcStyle)
    this.npcFlash = createFlashSheet(npcStyle)

    const geometry = (sheet: SpriteSheet): { frameWidth: number; frameHeight: number; columns: number } => ({
      frameWidth: sheet.frameWidth,
      frameHeight: sheet.frameHeight,
      columns: sheet.columns,
    })
    this.actorGeometry = geometry(this.sheets.hero)
    this.lootGeometry = geometry(this.sheets.loot)
    this.propGeometry = geometry(this.sheets.props)
    this.fireballGeometry = geometry(this.sheets.fireball)

    for (let i = 0; i < 48; i++) this.actorSlots.push(this.createActorSlot())
    for (let i = 0; i < PROPS_IN_POOL; i++) {
      this.propSlots.push({
        kind: 'prop',
        active: false,
        image: this.sheets.props.image,
        x: 0,
        y: 0,
        frame: 0,
        scale: 1,
      })
    }
    for (let i = 0; i < 36; i++) {
      this.lootSlots.push({
        kind: 'loot',
        active: false,
        x: ref(-9999),
        y: ref(-9999),
        opacity: ref(1),
        label: ref(''),
        labelColor: ref('#ffffff'),
        image: this.sheets.loot.image,
        frame: 0,
      })
    }
    for (let i = 0; i < 26; i++) {
      this.floatSlots.push({
        kind: 'float',
        active: false,
        x: ref(-9999),
        y: ref(-9999),
        opacity: ref(1),
        text: ref(''),
        color: ref('#ffffff'),
      })
    }
    for (let i = 0; i < 14; i++) {
      this.effectSlots.push({
        kind: 'effect',
        active: false,
        x: ref(-9999),
        y: ref(-9999),
        radius: ref(0),
        opacity: ref(1),
        color: ref('#ffffff'),
        thickness: ref(3),
      })
    }


    this.realData = data && hasGameData(data) ? data : null
    if (this.realData) {
      // Two skills from one class, so the bar reads as one character's kit
      // rather than a mix of classes. Damaging skills only: a passive like
      // Warmth has no icon of its own and cannot be "cast".
      const castable = this.realData.skills.filter(
        (skill) => skill.charClass && skill.mana > 0 && skill.missile.length > 0,
      )
      const chosen = castable.filter((skill) => skill.charClass === castable[0]?.charClass)
      const first = chosen[0]
      const second = chosen[1]
      this.realSkills = [first, second].filter((skill): skill is SkillRow => Boolean(skill))
      // Pin each slot's cost to the retail number so the bar drains what the
      // game drains.
      if (this.realSkills[0]) this.realMana.set('fireball', this.realSkills[0].mana)
      if (this.realSkills[1]) this.realMana.set('nova', this.realSkills[1].mana)
      // Level id 0 is the table's "Null" placeholder, not a place: skip it and
      // prefer the act-1 town, which is where a character starts.
      const act1 = this.realData.levels.filter((level) => level.act === 1 && level.devName !== 'Null')
      const area = act1.find((level) => level.devName.includes('Town')) ?? act1[0]
      if (area) {
        this.areaNameOverride = area.name
        this.currentAct = area.act
        // The area's own monster level, which is what the scaling tables use.
        if (area.monsterLevel > 0) this.areaMonsterLevel = area.monsterLevel
      }

      // `levels.txt` again, this time for the density: `monsters.ts` indexes the
      // same rows, so the area is found by the dev name the two tables share.
      const info = this.monsterTables?.areas.find((entry) => entry.name === area?.devName) ?? null
      if (info !== null) this.areaHasMonsters = info.density.normal > 0

      // The spawn pool is the real act-1 roster from monstats, so what walks
      // toward the player is the game's own monster with its own name and health
      // rather than a placeholder archetype.
      this.monsterPool = this.realData.monsters.filter(
        (monster) => monster.acts.includes(area?.act ?? 1) && monster.maxHp > 0 && monster.level > 0,
      )
      // The pool is what a spawn draws from, so the name→id map has to be built
      // here, after the pool exists: a spawn looks its own AI row up by name.
      for (const row of this.monsterPool) this.monsterNameToId.set(row.name, row.id)
    }

    // The missiles and the overlays are loaded in the background: which animation
    // a missile plays is named by the skill that fires it, so the keys cannot be
    // handed in with the rest of the art (see `warmFlatArt`). Started here, while
    // the player is still in the menu, so the first arrow already has its own art.
    if (this.skillRuntime !== null) void this.warmFlatArt()
    // The animation clock is not part of the art: it is one table that every actor's
    // every mode reads, so it is fetched once, in the background, and until it lands
    // every animation plays at the table's modal rate rather than at a rate of ours.
    void this.warmAnimData()

    // The class's real starting life and mana, when the attribute table is
    // loaded: the hero's pools are the game's, not a number chosen to feel right.
    const sheet = this.characterSheetFor(1)
    const startingHp = sheet?.maxLife ?? HERO.maxHealth
    const startingMana = sheet?.maxMana ?? HERO.maxMana
    const startingStamina = sheet?.maxStamina ?? 0

    this.hero = {
      x: this.map.heroStart.x,
      y: this.map.heroStart.y,
      dir: 4,
      facing: Math.PI / 2,
      hp: startingHp,
      maxHp: startingHp,
      mana: startingMana,
      maxMana: startingMana,
      stamina: startingStamina,
      maxStamina: startingStamina,
      damage: HERO.damage,
      armor: 0,
      walkPhase: 0,
      movedLastStep: 0,
      cooldown: 0,
      hitFlash: 0,
      attackTimer: 0,
      castTimer: 0,
      weaponMode: 'hth',
      potions: START_POTIONS,
      level: 1,
      xp: 0,
      // The real table's cost of the first level, not a curve of our own. It is
      // 1,000 in retail and the constructor corrects it below when the table has
      // loaded, so a build without the table still has a sane first step.
      xpToNext: this.xpForNextLevel(1),
      gold: 0,
      kills: 0,
      alive: true,
      respawnTimer: 0,
    }

    const heroSlot = this.claimActorSlot(this.sheets.hero, this.sheets.heroFlash)!
    this.heroSlot = heroSlot

    this.placeMapProps()
    this.placeAreaContent(this.world?.placements ?? [])

    // The quest tables, read once. Every source is optional inside `parseQuests`,
    // so this is the whole wiring: the names from the act table the app already
    // loads, the dialogue from the index it already built, and the log steps from
    // the quest strings when the loader passes them through `WorldContent`.
    this.quests = parseQuests({
      questStrings: this.world?.questStrings ?? null,
      voice: this.world?.dialogue ?? null,
      actQuests: this.realData?.quests ?? null,
    })

    // Real content, when the tables are present: the area name and the player's
    // first two castable skills come from the game's own data.
    this.hud = {
      health: ref(Math.round(this.hero.hp)),
      maxHealth: ref(this.hero.maxHp),
      mana: ref(Math.round(this.hero.mana)),
      maxMana: ref(this.hero.maxMana),
      stamina: ref(this.hero.stamina),
      maxStamina: ref(this.hero.maxStamina),
      level: ref(1),
      xpRatio: ref(0),
      gold: ref(0),
      kills: ref(0),
      potions: ref(START_POTIONS),
      maxPotions: MAX_POTIONS,
      skills: ref([]),
      boss: ref(null),
      areaName: ref(this.areaNameOverride ?? 'The Ashen Marches'),
      objective: ref(this.questObjective()),
      fps: ref(0),
      alive: ref(true),
      respawnIn: ref(0),
      log: ref([]),
      minimap: ref([]),
      monsterCount: ref(0),
      targetName: ref(''),
      npcPrompt: ref(''),
      dialogue: ref(null),
      stickActive: ref(false),
      stickX: ref(0),
      stickY: ref(0),
      stickOriginX: ref(0),
      stickOriginY: ref(0),
      aiming: ref(false),
      aimAngle: ref(0),
      aimDotX: ref(0),
      aimDotY: ref(0),
      mapWidth: this.map.width,
      mapHeight: this.map.height,
      travel: ref(this.travelRows()),
    }

    // The opening population obeys the same density rule as later spawns: a town
    // with `MonDen` 0 starts empty, which is what a town is for.
    if (this.areaHasMonsters) {
      this.spawnBoss()
      for (let i = 0; i < 9; i++) this.spawnMonster()
    }
    this.syncHud()
    this.syncMinimap()
  }


  // -- area content ---------------------------------------------------------

  /**
   * Places the area's own NPCs and objects.
   *
   * The positions and the roster are the `.ds1`'s: Rogue Encampment's east
   * quarter yields Gheed, Kashya, Charsi, Warriv, Akara, a chicken, a cow and
   * five Rogue guards, at the sub-tile coordinates the retail map stores. Props
   * are placed from the same list, so the town is furnished by `objects.txt`.
   *
   * A few things are deliberately skipped and counted rather than drawn:
   * placements with no `monstats` row, spawn directives (`place_fallen` and
   * friends, which are the level generator's instructions), and objects whose
   * `NU` mode has no frames, which is how the tables mark a dummy.
   */
  private placeAreaContent(placements: readonly Placement[]): void {
    const content = this.world
    if (content === null || placements.length === 0) return

    let npcs = 0
    let critters = 0
    let monsters = 0
    let props = 0
    let skippedForRoom = 0

    for (const placement of placements) {
      if (placement.kind === 'object') {
        const def = placement.object
        if (def === null) continue
        // Frame 0 is the idle mode; a record with no frames has no art at all.
        if ((def.modes[0]?.frames ?? 0) === 0) continue
        const slot = this.propSlots.find((candidate) => !candidate.active)
        if (!slot) {
          skippedForRoom += 1
          continue
        }
        slot.active = true
        // The drawn prop sheet stands in until the object's own art is loaded;
        // the index is kept in range rather than left to chance.
        slot.frame = PROP_KINDS.indexOf(propKindFor(def))
        slot.x = placement.tileX
        slot.y = placement.tileY
        slot.scale = 1
        props += 1
        continue
      }

      if (placement.kind !== 'monster') continue
      if (!placement.npc && !placement.hostile) {
        // A passive unit: the cows and chickens. Drawn from its own `Code`'s art and
        // never entered into `monsters`, so every combat rule is spared having to ask
        // whether a chicken is an enemy.
        const slot = this.claimActorSlot(this.npcSheet, this.npcFlash, 1)
        if (!slot) {
          skippedForRoom += 1
          continue
        }
        slot.opacity.value = 1
        this.critters.push({
          id: placement.name,
          displayName: content.nameOf?.(placement.name) ?? placement.name,
          x: placement.tileX,
          y: placement.tileY,
          slot,
        })
        critters += 1
        continue
      }
      if (!placement.npc) {
        // A `.ds1` record that is not an NPC is the area's own monster roster, and
        // this path used to drop every one of them: the town placed 7 beside its 11
        // townspeople and spawned none, so the whole game had nothing to fight.
        const spawned = this.spawnMonster(undefined, {
          at: { x: placement.tileX, y: placement.tileY },
          defId: placement.name,
        })
        if (spawned === null) skippedForRoom += 1
        else monsters += 1
        continue
      }
      const slot = this.claimActorSlot(this.npcSheet, this.npcFlash, 1)
      if (!slot) {
        skippedForRoom += 1
        continue
      }
      // The position is the *tile* the `.ds1` places them at, not a screen point:
      // `syncActors` projects it every frame, the same way it does for a monster.
      slot.opacity.value = 1
      const npc: Npc = {
        id: placement.name,
        displayName: content.nameOf?.(placement.name) ?? placement.name,
        x: placement.tileX,
        y: placement.tileY,
        slot,
      }
      this.npcs.push(npc)
      npcs += 1
    }

    this.areaContent = { npcs, critters, monsters, props, skippedForRoom, total: placements.length }
  }

  /** Places the baked map's own props into the prop pool. */
  private placeMapProps(): void {
    for (const prop of this.map.props) {
      const slot = this.propSlots.find((candidate) => !candidate.active)
      if (!slot) break
      slot.active = true
      slot.frame = PROP_KINDS.indexOf(prop.kind)
      slot.x = prop.x
      slot.y = prop.y
      slot.scale = prop.scale
    }
  }

  /** What the area's own placements produced, for the startup report. */
  get areaPlacementSummary(): {
    npcs: number
    critters: number
    monsters: number
    props: number
    skippedForRoom: number
    total: number
  } | null {
    return this.areaContent
  }

  // -- travel ---------------------------------------------------------------

  /**
   * Hands in the piece that knows where the player can go, and adopts the area the
   * game started in.
   *
   * `main.tsx` has already assembled that area in order to build the map, so the
   * runtime is *told* about it rather than asked to build it again: a load would fetch
   * and bake the same level a second time. `start` must therefore be the area the
   * map came from — the same preset, the same seed — which is why the caller that
   * built the map is the one that passes it.
   *
   * A null runtime — a build with no exported tables — turns travel off, which is
   * the honest state for it: this game then has one area and no way to name another.
   */
  setTravelRuntime(
    runtime: TravelRuntime | null,
    start: { area: AreaRef; level: Level } | null = null,
  ): void {
    this.travel = runtime
    this.sites = []
    this.doorArmed = true
    if (runtime !== null) {
      if (start !== null) {
        runtime.adopt(start.area, start.level)
        this.hud.areaName.value = start.area.displayName
      }
      this.sites = runtime.doorSites
    }
    this.syncTravelHud()
  }

  /** The ways out of the area the player is in, in the order the tables give them. */
  travelOptions(): readonly TravelOption[] {
    return this.travel?.options() ?? []
  }

  /**
   * Travel to an area by `levels.txt` id.
   *
   * The one entry point for a HUD row, a key and the door check. Two rules are
   * enforced here rather than in the runtime, because they are rules about *this*
   * game rather than about the tables:
   *
   * - **only what this area leads to.** A caller can ask for any area id and
   *   `travel.ts` will assemble it — it is a loader, not a rule — but a player in the
   *   Rogue Encampment cannot reach the Catacombs, so a destination the current area
   *   does not name is refused rather than honoured.
   * - **one at a time**, because the loop sees the same door on every frame.
   *
   * @returns what happened, or `null` when a travel was already in flight.
   */
  async travelTo(areaId: number): Promise<TravelOutcome | null> {
    const runtime = this.travel
    if (runtime === null) {
      this.pushLog('Travel needs the level tables, which this build did not load', 'common')
      return null
    }
    if (this.travelling) return null

    const option = this.travelOptions().find((entry) => entry.destination.id === areaId) ?? null
    if (option === null) {
      const area = runtime.areaById(areaId)
      const detail =
        area === null
          ? `levels.txt has no area with id ${areaId}`
          : `nothing in ${runtime.current?.displayName ?? 'this area'} leads to ${area.displayName}`
      this.pushLog(detail, 'common')
      return { ok: false, area, reason: 'not-reachable', detail, via: null }
    }

    this.travelling = true
    // The hero is standing at a door as this starts; what they do not get is an
    // immediate trip back out of the door they arrive at.
    this.doorArmed = false
    try {
      const outcome = await runtime.travelTo(areaId)
      if (outcome.ok) this.adoptArea(outcome)
      else this.pushLog(describeTravelFailure(outcome), 'common')
      this.syncTravelHud()
      return outcome
    } catch (error) {
      // `loadArea` fails with a reason rather than throwing, but the pieces it calls
      // are allowed to — a malformed `.ds1`, a missing table row. A game that cannot
      // build an area has to say so and stay where it is, not stop the loop.
      const detail = `could not assemble area ${areaId}: ${String(error)}`
      console.error('rasen: travel failed', error)
      this.pushLog(detail, 'common')
      return { ok: false, area: runtime.areaById(areaId), reason: 'assembly-failed', detail, via: null }
    } finally {
      this.travelling = false
    }
  }

  /**
   * Go: take the first way out of this area that can be entered.
   *
   * The keyboard's version of clicking a row. "First" is `travelOptions`' own order —
   * the `.ds1`'s door tiles, then the doors whose objects the tables do not name, then
   * the waypoint list. With nothing loadable to go to it asks for the first door
   * anyway, so a press in the town reports the Blood Moor's refusal rather than
   * staying silent, which is how a player learns why the gate will not open.
   */
  async travelToNextOption(): Promise<TravelOutcome | null> {
    const options = this.travelOptions()
    const current = this.travel?.current?.id ?? -1
    const loadable =
      options.find((option) => option.loadable && option.destination.id !== current) ?? null
    const target = loadable ?? options[0] ?? null
    if (target === null) {
      this.pushLog('The tables name no way out of here', 'common')
      return null
    }
    return await this.travelTo(target.destination.id)
  }

  /**
   * Make a freshly assembled area the one the game is in.
   *
   * The whole of a travel, in order: tear the old area down, swap the map, place the
   * new area's content, move the hero to the door they came through, put the camera
   * there, and tell the HUD. Everything that is per-area lives in one of those steps,
   * which is the reason the order matters — the camera is snapped *after* the hero
   * moves (or it lerps across a map the player has left), and the population is
   * filled *after* the map is in place (or the spawner draws from the old tiles).
   */
  private adoptArea(travel: TravelSuccess): void {
    const loaded = travel.loaded
    const area = loaded.area
    this.clearArea()

    this.areaMap.adopt(loaded.map)
    this.minimapSource.value = createMinimapImage(loaded.map)
    this.areaMonsterLevel = area.monsterLevel > 0 ? area.monsterLevel : this.areaMonsterLevel
    // `MonDen` is what says whether an area has an ambient population: a town's is 0,
    // which is why the Rogue Encampment never spawns anything.
    this.areaHasMonsters = area.monsterDensity > 0
    this.currentAct = area.act + 1
    this.rebuildMonsterPool(area.act)
    this.sites = loaded.sites
    this.doorArmed = false

    this.placeMapProps()
    this.placeAreaContent(loaded.placements)

    const hero = this.hero
    hero.x = loaded.entry.x
    hero.y = loaded.entry.y
    this.snapCamera()

    this.hud.areaName.value = area.displayName
    this.hud.mapWidth = this.map.width
    this.hud.mapHeight = this.map.height
    this.spawnTimer = 7
    if (this.areaHasMonsters) {
      this.spawnBoss()
      for (let i = 0; i < 9; i++) this.spawnMonster()
    }

    this.syncActors()
    this.syncHud()
    this.syncMinimap()
    // The quest log's objective is per-act, and a travel can change the act.
    this.updateObjective()
    this.pushLog(`Travel to ${area.displayName}`, 'magic')
  }

  /**
   * Tear the area down: every entity, every pooled slot and the culling set.
   *
   * The pools are *reused* rather than rebuilt — a travel must not remount the scene
   * tree, and a slot is a ref the tree is already holding — so the slots are released
   * in place. The hero's own slot is the exception: it is the actor the camera
   * follows and the tree holds it by name, so it survives and `syncActors` reprojects
   * it into the new area.
   *
   * `renderList` is the one thing emptied wholesale, because it is the list the tree
   * diffs: leaving the old area's entities in it would keep them mounted.
   */
  private clearArea(): void {
    for (const slot of this.actorSlots) {
      if (slot === this.heroSlot) continue
      this.releaseActorSlot(slot)
    }
    for (const slot of this.propSlots) slot.active = false
    for (const slot of this.lootSlots) {
      slot.active = false
      slot.opacity.value = 0
      slot.x.value = -9999
      slot.y.value = -9999
    }
    for (const slot of this.floatSlots) {
      slot.active = false
      slot.opacity.value = 0
      slot.x.value = -9999
      slot.y.value = -9999
    }
    for (const slot of this.effectSlots) {
      slot.active = false
      slot.opacity.value = 0
      slot.x.value = -9999
      slot.y.value = -9999
    }

    this.monsters.length = 0
    this.npcs.length = 0
    this.critters.length = 0
    this.drops.length = 0
    this.projectiles.length = 0
    this.floats.length = 0
    this.effects.length = 0

    this.onScreen.clear()
    this.renderList.value = []
    this.minimapBlips.clear()
    this.hud.minimap.value = []
    this.hud.boss.value = null
    this.hud.targetName.value = ''
    this.nearbyNpc = null
    this.hud.npcPrompt.value = ''
    this.hud.dialogue.value = null
    this.commands.path = null
    this.commands.pathIndex = 0
    this.commands.attackTarget = null
    this.commands.moving = false
    this.commands.moveX = 0
    this.commands.moveY = 0
    this.commands.holdCast = null
    this.hud.stickActive.value = false
    this.areaContent = null
  }

  /**
   * Rebuild the spawn roster for an act.
   *
   * The pool is what an ambient spawn draws from and what a placed monster's own
   * `monstats` row is looked up by, so it has to follow the area: the game starts in
   * act 1 and a travel can leave it. An act with no rows in the pool keeps the one it
   * had, which is this build's own content rather than nothing.
   */
  private rebuildMonsterPool(areaAct: number): void {
    const data = this.realData
    if (data === null) return
    // `monstats`' own act column is 1-based, and `levels.txt`' `Act` is 0-based.
    const pool = data.monsters.filter(
      (monster) => monster.acts.includes(areaAct + 1) && monster.maxHp > 0 && monster.level > 0,
    )
    if (pool.length === 0) return
    this.monsterPool.length = 0
    this.monsterPool.push(...pool)
    this.monsterNameToId.clear()
    for (const row of pool) this.monsterNameToId.set(row.name, row.id)
  }

  /**
   * Put the camera where the hero is, without the sweep.
   *
   * `syncCamera` lerps at 0.16 per frame, which is right for a walk and wrong for a
   * travel: the player would watch the camera fly across a map they have already
   * left, and the culling set would be computed from the wrong place while it did.
   */
  private snapCamera(): void {
    const screen = toScreen(this.hero.x, this.hero.y)
    this.cameraX.value = window.innerWidth / 2 - screen.x
    this.cameraY.value = window.innerHeight / 2 - screen.y
  }

  /**
   * The doors: walking onto one is how an area is left.
   *
   * The check is the game's own — a door is a tile and the player uses it by standing
   * in it — with one tile of slack, because a warp tile is a marker in a *wall* layer
   * and whether a walker may stand on it depends on the level: the Rogue Encampment's
   * three are walkable and `Act 1 - Courtyard 2`'s single tile is not. `exitAt` is the
   * exact-tile form and is asked first, so a hero standing on a tile is never
   * second-guessed by a nearer neighbour; the slack only decides the doors that
   * cannot be stood on.
   *
   * A site with no destination is a marker the tables never bound, and it is passed
   * over in silence: nothing about it is wrong.
   */
  private checkAreaExit(): void {
    if (this.travel === null || this.sites.length === 0) return
    let site = exitAt(this.sites, Math.round(this.hero.x), Math.round(this.hero.y))
    if (site === null) {
      let nearest = DOOR_REACH * DOOR_REACH
      for (const candidate of this.sites) {
        const dx = candidate.x - this.hero.x
        const dy = candidate.y - this.hero.y
        const distance = dx * dx + dy * dy
        if (distance <= nearest) {
          nearest = distance
          site = candidate
        }
      }
    }
    if (site === null) {
      // Away from every door: the next one walked into may fire.
      this.doorArmed = true
      return
    }
    if (site.destination === null || !this.doorArmed) return
    this.doorArmed = false
    void this.travelTo(site.destination.id)
  }

  /** The HUD's list of ways out, rebuilt whenever the area or the runtime changes. */
  private syncTravelHud(): void {
    this.hud.travel.value = this.travelRows()
  }

  /**
   * The list of ways out, as the HUD shows it.
   *
   * The rows the player can actually take come first, and within each group the
   * tables' own order is kept. That is a presentation rule, not a rule about travel —
   * `travelOptions` is the data's order and stays that way — but the list is eleven
   * rows long in the act 1 town and the two of them that work would otherwise be
   * below the fold.
   */
  private travelRows(): TravelRow[] {
    const runtime = this.travel
    if (runtime === null) return []
    const current = runtime.current
    const rows = runtime.options().map((option) => ({
      areaId: option.destination.id,
      label: option.destination.displayName,
      note: describeTravelOption(option, current),
      loadable: option.loadable,
    }))
    return [...rows.filter((row) => row.loadable), ...rows.filter((row) => !row.loadable)]
  }

  /** The name of the NPC the hero is standing next to, for the HUD prompt. */
  get nearbyNpcName(): string {
    return this.nearbyNpc?.displayName ?? ''
  }

  /**
   * How close the hero has to be to talk.
   *
   * Two tiles, which is about one screen-inch at this zoom and matches the
   * genre's "walk into them" behaviour; a wider radius would let the player
   * talk across a building.
   */
  private static readonly TALK_RANGE = 2

  /**
   * Picks the NPC the prompt should offer.
   *
   * Nearest wins, so standing between two merchants offers the one being faced
   * rather than whichever happens to be first in the list.
   */
  private updateNearbyNpc(): void {
    if (this.npcs.length === 0) {
      if (this.nearbyNpc !== null) {
        this.nearbyNpc = null
        this.hud.npcPrompt.value = ''
      }
      return
    }
    let best: Npc | null = null
    let bestDistance = Game.TALK_RANGE * Game.TALK_RANGE
    for (const npc of this.npcs) {
      const dx = npc.x - this.hero.x
      const dy = npc.y - this.hero.y
      const distance = dx * dx + dy * dy
      if (distance <= bestDistance) {
        bestDistance = distance
        best = npc
      }
    }
    if (best !== this.nearbyNpc) {
      this.nearbyNpc = best
      this.hud.npcPrompt.value = best === null ? '' : `Talk to ${best.displayName}`
    }
  }

  /**
   * Opens the dialogue box for the NPC being offered.
   *
   * The lines are the retail ones that `vo.json` attributes to this speaker; the
   * ones belonging to the quest the player is on come first, because that is what
   * the keys carry the quest for — Akara opens with her `A1Q1Init` line before
   * the quest is taken and with her `A1Q1Successful` line after it, and with her
   * gossip in between. `orderSpeakerLines` does that split; within a phase the
   * table's own order is kept, so `WarrivGossip1` still follows
   * `WarrivAct1IntroGossip1`.
   *
   * Returns false when there is nobody to talk to or the tables carry no lines
   * for them, which is the case for the livestock and the guards.
   */
  // -- the three economies ---------------------------------------------------

  /**
   * The stash, or null when its layout was not loaded.
   *
   * A plain model with no signals of its own: {@link stashRevision} is what a view
   * subscribes to, so a caller that deposits through {@link depositIntoStash} and one
   * that calls the model directly both redraw the panel.
   */
  stash(): Stash | null {
    return this.economy?.stash ?? null
  }

  /** Bumped on every stash change, so a view re-reads the pages. */
  readonly stashRevision = ref(0)

  /**
   * Moves one carried item into the stash, at the first free cell of a page.
   *
   * The address is searched for rather than chosen: a page is a grid and an item may
   * be two cells wide, so "the first place it fits" is `freePositions` above every
   * legal origin. Returns the model's own refusal when nothing fits, which is what the
   * panel shows.
   */
  depositIntoStash(pageId: string, carriedIndex: number): { ok: boolean; message: string } {
    const stash = this.stash()
    const carried = this.inventory.value[carriedIndex]
    if (stash === null || carried === undefined) {
      return { ok: false, message: 'nothing to deposit' }
    }
    const page = stash.pages().find((entry) => entry.id === pageId)
    if (page === undefined) return { ok: false, message: `no stash page ${pageId}` }
    const item = carried.source ?? null
    if (item === null) return { ok: false, message: `${carried.name} did not come from the tables` }
    // A page is a grid and an item may be two cells wide, so the address is searched
    // for rather than chosen: the first origin the item fits at is the first one a
    // player would use.
    const columns = page.columns ?? 1
    const rows = page.rows ?? page.cells
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const result = stash.deposit(pageId, item, stashCell(column, row))
        if (result.ok) {
          this.inventory.value = this.inventory.value.filter((_, at) => at !== carriedIndex)
          this.stashRevision.value += 1
          return { ok: true, message: result.message }
        }
      }
    }
    return { ok: false, message: 'the stash page is full' }
  }

  /**
   * Puts a generated item into the bag, as the view item the panels draw.
   *
   * The one place a generator item becomes a carried one, so the drop, the withdrawal
   * and anything that hands the player an item agree about what a carried item is.
   * Returns false when the bag is full, which is the caller's cue to hand the item
   * back rather than losing it.
   */
  carry(item: GeneratedItemItem): boolean {
    if (this.inventory.value.length >= this.inventorySize) return false
    this.inventory.value = [
      {
        name: item.name ?? 'Item',
        rarity: mapRarity(item.rarity),
        icon: iconForItem(item),
        graphic: item.graphic ?? null,
        source: item,
        tooltip:
          item.tooltip && item.tooltip.length > 0 ? [...item.tooltip] : describeItemStats(item),
      },
      ...this.inventory.value,
    ]
    return true
  }

  /** Takes one stash placement back into the inventory, if there is room. */
  withdrawFromStash(pageId: string, address: StashAddress): { ok: boolean; message: string } {
    const stash = this.stash()
    if (stash === null) return { ok: false, message: 'no stash' }
    if (this.inventory.value.length >= this.inventorySize) {
      return { ok: false, message: 'your inventory is full' }
    }
    const result = stash.withdraw(pageId, address)
    if (!result.ok || result.item === null) return { ok: false, message: result.message }
    if (!this.carry(result.item)) {
      // Hand it back rather than dropping it: the model took it out already.
      stash.deposit(pageId, result.item, address)
      return { ok: false, message: 'your inventory is full' }
    }
    this.stashRevision.value += 1
    return { ok: true, message: result.message }
  }

  /**
   * A vendor's stock for one of the panel's own tabs.
   *
   * The pages are the four the vendor layout's tabs name, and which of them an NPC
   * offers is **not in the data** — `npc.txt` carries the pricing multipliers and no
   * page column, and no other table joins a seller to a store page. So every vendor
   * offers the panel's own four tabs, which is the layout's statement about itself,
   * and nothing is invented about who sells what.
   *
   * The item level is the area's own monster level from `levels.txt`; the number of
   * rolled items is the panel's grid width, because no table states a stock count.
   */
  vendorStock(page: string): VendorStock | null {
    const economy = this.economy
    if (economy === null || economy.storePages === null) return null
    if (this.dropResolver === null) return null
    const terms = this.npcTermsFor(this.vendorNpc()?.id ?? '')
    return vendorStock({
      index: this.dropResolver.index,
      pages: economy.storePages,
      page,
      ilvl: Math.max(1, this.areaMonsterLevel),
      random: this.itemRandom,
      count: 10,
      ...(terms === null ? {} : { terms }),
    })
  }

  /** The four page codes the vendor panel's tabs name, in the tab bar's own order. */
  static readonly VENDOR_TABS: readonly string[] = ['armo', 'weap', 'weap', 'misc']

  /** A vendor's pricing row, or null when no `npc.txt` row names it. */
  npcTermsFor(id: string): NpcTerms | null {
    // `npc.txt` keys its rows by a `monstats` id, and its own accessor is a map by
    // that name; `byName` is the table's own spelling for it.
    return this.economy?.npcTerms?.byName.get(id) ?? null
  }

  /**
   * The NPC whose prices the shop shows.
   *
   * In the game a shop opens by talking to its keeper, so the nearest one wins. This
   * build also opens it with a key, and a key has no keeper standing next to it — so
   * with nobody in reach it falls back to the *first* placed NPC that `npc.txt` prices
   * anything for, which in the act 1 town is a real vendor and not an invented one. The
   * fallback is named in the panel's own note so the readout is never ambiguous about
   * whose prices these are.
   */
  vendorNpc(): { id: string; displayName: string; exact: boolean } | null {
    const priced = (id: string): NpcTerms | null => this.npcTermsFor(id)
    if (this.nearbyNpc !== null && priced(this.nearbyNpc.id) !== null) {
      return { id: this.nearbyNpc.id, displayName: this.nearbyNpc.displayName, exact: true }
    }
    for (const npc of this.npcs) {
      if (priced(npc.id) !== null) {
        return { id: npc.id, displayName: npc.displayName, exact: false }
      }
    }
    return null
  }

  /** The hireable roster, or null without `hireling.txt`. */
  hirelings(): HirelingTable | null {
    return this.economy?.hirelings ?? null
  }

  talk(): boolean {
    const npc = this.nearbyNpc
    const dialogue = this.world?.dialogue ?? null
    if (npc === null || dialogue === null) return false
    const lines = dialogue.forSpeaker(npc.id)
    if (lines.length === 0) {
      this.hud.dialogue.value = null
      this.hud.npcPrompt.value = `${npc.displayName} has nothing to say`
      return false
    }
    // Talking is the one condition the quest tables state themselves: the voice
    // key that opens a quest names the NPC who opens it, so speaking to them is
    // what "started" means here.
    this.talkedTo.add(npc.id)
    const quest = this.currentQuest()
    const entries = orderSpeakerLines(
      lines,
      quest,
      quest === null ? 'active' : this.questStateOf(quest),
    )
    this.hud.dialogue.value = {
      speaker: npc.id,
      displayName: npc.displayName,
      keys: entries.map((entry) => entry.key),
      index: 0,
      text: entries[0].text,
    }
    this.updateObjective()
    return true
  }

  /** Steps to the next line, or closes the box at the end. */
  advanceDialogue(): void {
    const view = this.hud.dialogue.value
    if (view === null) return
    const dialogue = this.world?.dialogue ?? null
    const nextIndex = view.index + 1
    if (dialogue === null || nextIndex >= view.keys.length) {
      this.closeDialogue()
      return
    }
    const entry = dialogue.byKey.get(view.keys[nextIndex])
    if (!entry) {
      this.closeDialogue()
      return
    }
    this.hud.dialogue.value = { ...view, index: nextIndex, text: entry.text }
  }

  closeDialogue(): void {
    if (this.hud.dialogue.value !== null) this.hud.dialogue.value = null
  }

  // -- public input surface -------------------------------------------------

  /**
   * Feed the raw screen-space stick vector.
   *
   * Two conversions happen here, and both must: the stick's screen direction is
   * projected into world space, then snapped to the eight world compass
   * directions. Snapping in *screen* space would be wrong — the 2:1 iso
   * projection does not map 45° screen angles to 45° world angles, so a screen
   * snap produces movement that is neither axis-aligned nor diagonal in the
   * tile grid, and walking a thin corridor becomes impossible to steer.
   */
  setStickFromScreen(x: number, y: number, originX: number, originY: number): void {
    const magnitude = Math.hypot(x, y)
    this.hud.stickOriginX.value = originX
    this.hud.stickOriginY.value = originY
    if (magnitude < 0.16) {
      this.hud.stickX.value = x * 44
      this.hud.stickY.value = y * 44
      return
    }

    const world = toWorld(x, y)
    const snapped = snapToWorldCompass(world.x, world.y)
    this.commands.moveX = snapped.x
    this.commands.moveY = snapped.y
    this.commands.moving = true
    this.commands.path = null
    this.commands.attackTarget = null
    this.hud.stickActive.value = true
    this.hud.stickX.value = x * 44
    this.hud.stickY.value = y * 44
  }

  clearStick(): void {
    this.commands.moving = false
    this.commands.moveX = 0
    this.commands.moveY = 0
    this.hud.stickActive.value = false
    this.hud.stickX.value = 0
    this.hud.stickY.value = 0
  }

  /** Keyboard / gamepad movement, already in world space. */
  setWorldDirection(x: number, y: number): void {
    if (x === 0 && y === 0) {
      this.clearStick()
      return
    }
    const snapped = snapToWorldCompass(x, y)
    this.commands.moveX = snapped.x
    this.commands.moveY = snapped.y
    this.commands.moving = true
    this.commands.path = null
  }

  /** Tap-to-move: walk to a world point, or approach the monster standing there. */
  moveTo(worldX: number, worldY: number): void {
    const target = this.monsterAt(worldX, worldY)
    if (target) {
      this.commands.attackTarget = target
      this.commands.path = findPath(
        this.map,
        { x: this.hero.x, y: this.hero.y },
        { x: target.x, y: target.y },
      )
      this.commands.pathIndex = 0
      this.commands.moving = false
      return
    }
    this.commands.attackTarget = null
    this.commands.path = findPath(
      this.map,
      { x: this.hero.x, y: this.hero.y },
      { x: worldX, y: worldY },
    )
    this.commands.pathIndex = 0
    this.commands.moving = false
  }

  /**
   * Aim state from a skill button drag. `angle` is a world angle — the caller
   * converts its screen delta with `screenDeltaToWorldAngle`.
   */
  setAim(active: boolean, angle: number): void {
    this.commands.aimActive = active
    if (active) this.commands.aimAngle = angle
    this.hud.aiming.value = active
    this.hud.aimAngle.value = angle
  }

  setHoldCast(skill: SkillId | null): void {
    this.commands.holdCast = skill
  }

  /** Spend a skill. Returns true when it actually fired. */
  useSkill(skill: SkillId): boolean {
    if (!this.hero.alive || this.paused) return false
    const definition = SKILLS[skill]
    // The retail skill's own mana cost, when it is known. The invented table is
    // only a fallback for a build without the exported data.
    const realMana = this.realManaFor(skill)
    const manaCost = realMana ?? definition.mana
    if ((this.cooldowns.get(skill) ?? 0) > 0) return false

    if (skill === 'potion') {
      if (this.hero.potions <= 0) {
        this.floatAt(this.hero.x, this.hero.y, 'no potions', COLOURS.damageToHero, 0.7)
        return false
      }
      this.hero.potions--
      const healed = Math.min(POTION_HEAL, this.hero.maxHp - this.hero.hp)
      this.hero.hp += healed
      this.floatAt(this.hero.x, this.hero.y - 0.6, `+${Math.round(healed)}`, COLOURS.heal, 0.9)
      this.spawnEffect('heal', this.hero.x, this.hero.y, 1.3, COLOURS.heal, 0.5, 3)
      this.sound('potion')
      this.cooldowns.set(skill, definition.cooldown)
      this.syncHud()
      return true
    }

    if (this.hero.mana < manaCost) {
      this.floatAt(this.hero.x, this.hero.y, 'not enough mana', COLOURS.mana, 0.7)
      return false
    }

    if (skill === 'fireball') this.castFireball()
    else this.castNova()

    this.hero.castTimer = CAST_MODE_SECONDS
    this.hero.mana -= manaCost
    this.cooldowns.set(skill, definition.cooldown)
    this.syncHud()
    return true
  }

  /**
   * Screen-space input vector → world-space direction.
   *
   * Movement from a keyboard or a pad arrives as a screen vector ("up"), and
   * the isometric projection is what turns that into a world direction. The
   * simulation owns this because the tile grid is the simulation's space.
   */
  screenDeltaToWorld(x: number, y: number): { x: number; y: number } {
    return toWorld(x, y)
  }

  /** Canvas point (CSS px) → world tiles, undoing the camera translation. */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return toWorld(screenX - this.cameraX.value, screenY - this.cameraY.value)
  }

  setPaused(paused: boolean): void {
    this.paused = paused
  }

  /**
   * The damage an action-bar skill deals at the hero's current level.
   *
   * The number comes from the game's own calc expressions when the skill tables
   * are loaded — synergies included, since `damage()` evaluates the `EDmgSymPerCalc`
   * columns against the caster's other skill levels. Without the tables the
   * caller keeps its built-in value.
   */
  skillDamage(skill: SkillId): number | null {
    if (!this.skillRuntime) return null
    const row = skill === 'fireball' ? this.realSkills[0] : skill === 'nova' ? this.realSkills[1] : undefined
    if (!row) return null
    const level = Math.max(1, Math.min(row.maxLevel, this.hero.level))
    try {
      const result = this.skillRuntime.damage(row.name, level, {
        // The hero knows only these two skills, so a synergy that names another
        // skill contributes nothing — which is what the real game does for a
        // character who has not learned it.
        skillLevel: (name: string) => (name === row.name ? level : 0),
        level: this.hero.level,
      } as never)
      let total = 0
      if (result.physical) total += (result.physical.min + result.physical.max) / 2
      if (result.elemental) total += (result.elemental.min + result.elemental.max) / 2
      return total > 0 ? total : null
    } catch {
      return null
    }
  }

  /**
   * The hero's inventory: real items, in the order they were picked up.
   *
   * A reactive list so the panel updates as things drop. Each entry carries the
   * generator's own tooltip, which is the game's item text.
   */
  readonly inventory: SignalRef<Item[]> = ref([])

  /** Capacity, as the game's own inventory is a fixed grid. */
  readonly inventorySize = 40

  /**
   * The character sheet: the hero's attributes from `charstats.txt`.
   *
   * Life, mana and stamina come from the class's own row — the flat starting
   * values, the per-level growth and the per-attribute rates — so they agree with
   * what the game computes for the same class and level.
   */
  /**
   * The class's attribute row evaluated at a level, or null without the tables.
   *
   * Split out of `characterSheet` because the constructor needs it before the
   * hero exists — the hero's starting pools come from it.
   */
  private characterSheetFor(level: number): {
    maxLife: number
    maxMana: number
    maxStamina: number
    strength: number
    dexterity: number
    vitality: number
    energy: number
  } | null {
    if (!this.charStats) return null
    const code = this.heroClass
    if (!code) return null
    const fullName = CHARSTATS_CLASS_NAMES[code] ?? code
    const row = this.charStats.get(fullName)
    if (!row) return null
    const set = createCharacterStats(row, level, { table: this.statTable ?? undefined })
    const read = (name: string, fallback: number): number => {
      try {
        const value = set.get(name)
        return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
      } catch {
        return fallback
      }
    }
    return {
      maxLife: read('maxhp', 0),
      maxMana: read('maxmana', 0),
      // `charstats.txt` carries `stamina` and `StaminaPerLevel`, and `itemstatcost`
      // names the derived stat `maxstamina`, so the capacity is the game's own curve
      // and not a number of this app's.
      maxStamina: read('maxstamina', 0),
      strength: read('strength', row.strength),
      dexterity: read('dexterity', row.dexterity),
      vitality: read('vitality', row.vitality),
      energy: read('energy', row.energy),
    }
  }

  characterSheet(): {
    charClass: string
    level: number
    strength: number
    dexterity: number
    energy: number
    vitality: number
    life: number
    maxLife: number
    mana: number
    maxMana: number
    stamina: number
    startSkills: string[]
  } | null {
    const code = this.heroClass
    if (!code) return null
    const stats = this.characterSheetFor(this.hero.level)
    if (!stats) return null
    const fullName = CHARSTATS_CLASS_NAMES[code] ?? code
    const row = this.charStats?.get(fullName)
    return {
      charClass: code,
      level: this.hero.level,
      strength: stats.strength,
      dexterity: stats.dexterity,
      energy: stats.energy,
      vitality: stats.vitality,
      // The hero's live pools are set from this same row at construction, so the
      // sheet and the HUD globes show the same numbers.
      life: Math.round(this.hero.hp),
      maxLife: Math.round(this.hero.maxHp),
      mana: Math.round(this.hero.mana),
      maxMana: Math.round(this.hero.maxMana),
      stamina: Math.round(this.hero.stamina),
      startSkills: row ? [...row.skills].filter((name) => name.length > 0) : [],
    }
  }

  /**
   * The quest log for an act, from the game's own quest tables.
   *
   * The names are the retail ones ("Den of Evil", "The Search for Cain"), and the
   * act grouping comes from the keys themselves (`qstsa1q2` = act 1, quest 2).
   *
   * `done` is the app's own approximation of the quest's condition, because the
   * game's conditions are compiled rather than tabulated — see
   * {@link questRequirement} in `d2/quests.ts` for exactly which observations
   * each one is built from and why they are stand-ins. What the log does *not* do
   * is invent progress: it advances on a boss dying, a level being reached, a
   * monster count and a conversation, and on nothing else.
   */
  questLog(
    act = this.currentAct,
  ): Array<{ name: string; index: number; done: boolean; current: boolean; state: QuestState }> {
    const quests = this.quests.forAct(act)
    // The area's NPCs are the same for every row, so they are read once: a giver
    // who was never placed here does not wedge the log, because there would be
    // nobody to talk to.
    const placed = this.placedSpeakerIds()
    const stateOf = (quest: Quest): QuestState => this.questStateIn(quest, quests.length, placed)
    const current = quests.find((quest) => stateOf(quest) !== 'done') ?? null
    return quests.map((quest) => {
      const state = stateOf(quest)
      return {
        name: quest.name,
        index: quest.index,
        done: state === 'done',
        current: quest === current,
        state,
      }
    })
  }

  /** The act's quests, in the order the act table lists them. */
  questsFor(act = this.currentAct): readonly Quest[] {
    return this.quests.forAct(act)
  }

  /**
   * The quest the player is on: the act's first one that is not done.
   *
   * Null when the act has no quests, which is the case for a build with no quest
   * tables at all.
   */
  currentQuest(act = this.currentAct): Quest | null {
    const quests = this.quests.forAct(act)
    const placed = this.placedSpeakerIds()
    return (
      quests.find((quest) => this.questStateIn(quest, quests.length, placed) !== 'done') ?? null
    )
  }

  /**
   * What the objective line reads: the quest the player is on, by name.
   *
   * Falls back to the app's own content when no quest table was loaded, so a
   * build without the export is unchanged rather than blank.
   */
  questObjective(act = this.currentAct): string {
    const quest = this.currentQuest(act)
    if (quest !== null) return quest.name
    // Every quest of the act done: the act itself is what is left. The game says
    // so in the log rather than naming a quest, so the app does too.
    if (this.quests.forAct(act).length > 0) return `Act ${act} complete`
    return Game.OBJECTIVE_FALLBACK
  }

  /** One quest's state, from what the simulation has observed. */
  questStateOf(quest: Quest): QuestState {
    return this.questStateIn(quest, this.quests.forAct(quest.act).length, this.placedSpeakerIds())
  }

  /**
   * The state of one quest of an act of `actQuestCount` quests.
   *
   * `placed` is the ids of the NPCs the current area put down, which is what
   * decides whether a quest's giver can be spoken to at all.
   */
  private questStateIn(
    quest: Quest,
    actQuestCount: number,
    placed: ReadonlySet<string>,
  ): QuestState {
    return questState(questRequirement(quest, actQuestCount), {
      talkedTo: this.talkedTo,
      level: this.hero.level,
      kills: this.hero.kills,
      bossSlain: this.bossSlain,
      placedSpeakers: placed,
    })
  }

  private placedSpeakerIds(): Set<string> {
    return new Set(this.npcs.map((npc) => npc.id))
  }

  /** The NPCs the player has spoken to, for the log and for a debug readout. */
  get talkedToNpcs(): readonly string[] {
    return [...this.talkedTo]
  }

  /** Which acts the quest log can show. */
  get acts(): number[] {
    return [...this.quests.acts]
  }

  /** Re-reads the objective after something it depends on changed. */
  private updateObjective(): void {
    const text = this.questObjective()
    if (this.hud.objective.value !== text) this.hud.objective.value = text
  }

  /**
   * Where the hero stands and which way it faces — the read-only slice the 3D
   * actor layer needs (the simulation's hero state stays private).
   */
  heroPlacement(): { x: number; y: number; facing: number; alive: boolean } {
    return {
      x: this.hero.x,
      y: this.hero.y,
      facing: this.hero.facing,
      alive: this.hero.alive,
    }
  }

  /** The class the action bar's skills belong to, or null without the tables. */
  get heroClass(): string | null {
    return this.realSkills[0]?.charClass ?? null
  }

  /**
   * The class name to show, e.g. `Amazon`.
   *
   * The skills' `charClass` is already the `charstats.txt` `class` value, which is
   * the name rather than a token, so this is usually a pass-through. The fallbacks
   * exist because a build with no skill tables has no class at all, and the front
   * end still needs a word.
   */
  characterClassLabel(): string {
    const fromSkills = this.heroClass
    if (fromSkills !== null && fromSkills !== '') return fromSkills
    return this.charStats?.names()[0] ?? 'Adventurer'
  }

  /** The hero's level, for the front end's character row. */
  get heroLevel(): number {
    return Math.max(1, Math.round(this.hero.level))
  }

  /**
   * The hero's class's whole skill list, ready for a skill panel.
   *
   * Every field is the retail value: the icon is the class atlas frame, the mana
   * is the table's cost, the level requirement is `reqlevel`. A skill the hero
   * has not reached is still listed — that is what the game's skill panel does.
   */
  classSkills(): Array<{
    name: string
    icon: string
    mana: number
    requiredLevel: number
    maxLevel: number
    usable: boolean
    learned: boolean
  }> {
    if (!this.realData || this.realSkills.length === 0) return []
    const cls = this.realSkills[0].charClass
    return this.realData.skills
      .filter((skill) => skill.charClass === cls && skill.classCode)
      .map((skill) => ({
        name: skill.nameDisplay,
        icon: `skillicons/${skill.classCode}_${skill.iconFrame}.png`,
        mana: skill.mana,
        requiredLevel: skill.requiredLevel,
        maxLevel: skill.maxLevel,
        // A skill is castable when the hero has the level and can pay for it.
        usable: this.hero.level >= skill.requiredLevel && skill.mana > 0,
        learned: this.hero.level >= skill.requiredLevel,
      }))
  }

  /**
   * The retail icon for an action-bar slot, relative to the assets directory.
   *
   * The class atlases are one sheet of 30 equal frames ordered as `skills.txt`
   * lists that class, so the skill's index among its class's rows is its frame.
   * Returns null when the tables are absent, and the caller keeps its drawn icon.
   */
  iconFor(skill: SkillId): string | null {
    const row =
      skill === 'fireball' ? this.realSkills[0] : skill === 'nova' ? this.realSkills[1] : undefined
    if (!row || !row.classCode) return null
    return `skillicons/${row.classCode}_${row.iconFrame}.png`
  }

  /** The retail mana cost for a slot, or null when the tables are absent. */
  private realManaFor(skill: SkillId): number | null {
    const cost = this.realMana.get(skill)
    return cost !== undefined && cost > 0 ? cost : null
  }

  /** Live hero tile position. Read-only; the HUD and tests both use it. */
  get heroPosition(): { x: number; y: number } {
    return { x: this.hero.x, y: this.hero.y }
  }

  /** Aiming state, for hosts that draw their own indicator. */
  get aimState(): { active: boolean; angle: number } {
    return { active: this.hud.aiming.value, angle: this.hud.aimAngle.value }
  }

  /** The spell effects currently alive, so a test can assert a cast landed. */
  get effectCount(): number {
    return this.effects.length
  }

  /**
   * Subscribe to sound cues.
   *
   * The simulation announces *what happened*; a host adapter decides how it
   * sounds. That keeps WebAudio out of the simulation (which is why the
   * headless simulation never needs an audio context) and it is the same split
   * the input layer uses in the other direction.
   */
  onSound(handler: (cue: SoundCue) => void): () => void {
    this.soundHandlers.add(handler)
    return () => {
      this.soundHandlers.delete(handler)
    }
  }

  private sound(cue: SoundCue): void {
    for (const handler of this.soundHandlers) handler(cue)
  }

  get isPaused(): boolean {
    return this.paused
  }

  // -- loop -----------------------------------------------------------------

  update(dtMs: number): void {
    this.fpsAccumulator += dtMs
    this.fpsFrames++
    if (this.fpsAccumulator >= 500) {
      this.hud.fps.value = Math.round((this.fpsFrames * 1000) / this.fpsAccumulator)
      this.fpsAccumulator = 0
      this.fpsFrames = 0
    }

    if (!this.paused) {
      this.accumulator += dtMs / 1000
      let steps = 0
      while (this.accumulator >= STEP && steps < MAX_STEPS) {
        this.step(STEP)
        this.accumulator -= STEP
        steps++
      }
      // Drop the backlog instead of spiralling: a backgrounded tab must not
      // simulate a minute of combat the instant it comes back.
      if (this.accumulator > STEP * MAX_STEPS) this.accumulator = 0
    }

    this.syncCamera()
  }

  private step(dt: number): void {
    this.elapsed += dt
    this.heroModeTime += dt

    this.updateHero(dt)
    this.updateMonsters(dt)
    this.updateProjectiles(dt)
    this.updateDrops(dt)
    this.updateFloats(dt)
    this.updateEffects(dt)
    this.updateSpawning(dt)
    this.updateNearbyNpc()
    // The doors last, so the hero is where this step put them: a travel is a
    // consequence of walking into a doorway, not of the state before the step.
    this.checkAreaExit()

    for (const [skill, remaining] of this.cooldowns) {
      if (remaining > 0) this.cooldowns.set(skill, Math.max(0, remaining - dt))
    }

    this.syncActors()
    this.syncHud()

    this.minimapTimer -= dt
    if (this.minimapTimer <= 0) {
      this.minimapTimer = 0.12
      this.syncMinimap()
    }
  }

  // -- hero -----------------------------------------------------------------

  private updateHero(dt: number): void {
    const hero = this.hero

    if (!hero.alive) {
      hero.respawnTimer -= dt
      this.hud.respawnIn.value = Math.max(0, hero.respawnTimer)
      if (hero.respawnTimer <= 0) this.respawnHero()
      this.heroSlot.opacity.value = 0.22
      return
    }
    this.heroSlot.opacity.value = 1

    hero.hp = Math.min(hero.maxHp, hero.hp + HERO.healthRegen * dt)
    hero.mana = Math.min(hero.maxMana, hero.mana + HERO.manaRegen * dt)
    hero.cooldown = Math.max(0, hero.cooldown - dt)
    hero.hitFlash = Math.max(0, hero.hitFlash - dt * 4)
    hero.attackTimer = Math.max(0, hero.attackTimer - dt)
    hero.castTimer = Math.max(0, hero.castTimer - dt)

    let dirX = 0
    let dirY = 0

    if (this.commands.path && this.commands.pathIndex < this.commands.path.length) {
      const waypoint = this.commands.path[this.commands.pathIndex]
      const dx = waypoint.x - hero.x
      const dy = waypoint.y - hero.y
      const distance = Math.hypot(dx, dy)
      if (distance < 0.24) {
        this.commands.pathIndex++
        if (this.commands.pathIndex >= this.commands.path.length) this.commands.path = null
      } else {
        dirX = dx / distance
        dirY = dy / distance
      }
    } else if (this.commands.moving) {
      dirX = this.commands.moveX
      dirY = this.commands.moveY
    } else if (this.commands.attackTarget) {
      const target = this.commands.attackTarget
      const dx = target.x - hero.x
      const dy = target.y - hero.y
      const distance = Math.hypot(dx, dy)
      if (target.hp <= 0 || distance > 22) {
        this.commands.attackTarget = null
      } else if (distance > this.meleeReachTo(target) - 0.2) {
        dirX = dx / distance
        dirY = dy / distance
      }
    }

    if (dirX !== 0 || dirY !== 0) {
      const length = Math.hypot(dirX, dirY)
      if (length > 1e-4) {
        hero.facing = Math.atan2(dirY, dirX)
        hero.dir = worldAngleToIso(hero.facing)
        const step = HERO.speed * dt
        const beforeX = hero.x
        const beforeY = hero.y
        this.moveEntity(hero, (dirX / length) * step, (dirY / length) * step)
        hero.movedLastStep = Math.hypot(hero.x - beforeX, hero.y - beforeY)
        // The walk cycle is advanced by the ground covered, not by the clock: its
        // stride comes from the animation's own length and the hero's own speed, so
        // the foot that is down stays down for as long as the ground under it lasts.
        hero.walkPhase = advanceWalk(
          hero.walkPhase,
          this.walkTiming(this.heroArt),
          step,
          HERO.speed,
        )
      }
    }

    // Auto-attack: the nearest monster in reach, so a touch player never has to
    // aim a basic attack.
    const target = this.pickMeleeTarget()
    if (target && hero.cooldown <= 0) {
      hero.cooldown = HERO.cooldown
      hero.attackTimer = SWING_MODE_SECONDS
      hero.facing = Math.atan2(target.y - hero.y, target.x - hero.x)
      hero.dir = worldAngleToIso(hero.facing)
      this.sound('swing')
      this.damageMonster(target, hero.damage + this.random() * 6)
      this.spawnEffect('meleeHit', target.x, target.y, 0.5, '#ffe9a8', 0.2, 2)
    }

    if (this.commands.holdCast && (this.cooldowns.get(this.commands.holdCast) ?? 0) <= 0) {
      this.useSkill(this.commands.holdCast)
    }
  }

  /**
   * The distance at which the hero can hit this monster, in tiles.
   *
   * The monster's own `monstats2` size decides how much of it is body: a 3x3
   * brute is hit from further out than a 1x1 skeleton, because the hero's arm only
   * has to cross the gap between the two bodies rather than their centres.
   */
  private meleeReachTo(monster: Monster): number {
    const size = monster.brain?.def.size
    const bodyTiles = size === undefined ? 1 : Math.max(size.sizeX, size.sizeY)
    return meleeReachTiles(bodyTiles)
  }

  private pickMeleeTarget(): Monster | null {
    let best: Monster | null = null
    let bestDistance = Infinity
    for (const monster of this.monsters) {
      if (monster.hp <= 0) continue
      const distance = Math.hypot(monster.x - this.hero.x, monster.y - this.hero.y)
      if (distance > this.meleeReachTo(monster)) continue
      if (distance >= bestDistance) continue
      bestDistance = distance
      best = monster
    }
    return best
  }

  private respawnHero(): void {
    const hero = this.hero
    hero.alive = true
    hero.hp = hero.maxHp
    hero.mana = hero.maxMana
    hero.x = this.map.heroStart.x
    hero.y = this.map.heroStart.y
    this.commands.path = null
    this.commands.attackTarget = null
    this.hud.alive.value = true
    this.hud.respawnIn.value = 0
  }

  private hurtHero(amount: number): void {
    const hero = this.hero
    const mitigated = amount * (100 / (100 + hero.armor))
    hero.hp -= mitigated
    hero.hitFlash = 1
    this.sound('hit')
    this.floatAt(hero.x, hero.y - 0.7, `-${Math.round(mitigated)}`, COLOURS.damageToHero, 0.8)
    this.spawnEffect('heroHurt', hero.x, hero.y, 0.7, COLOURS.damageToHero, 0.25, 2)

    if (hero.hp <= 0) {
      hero.hp = 0
      hero.alive = false
      this.sound('death')
      hero.respawnTimer = 3.2
      this.hud.alive.value = false
      this.hud.respawnIn.value = hero.respawnTimer
    }
  }

  // -- monsters -------------------------------------------------------------

  private updateMonsters(dt: number): void {
    const hero = this.hero

    for (const monster of this.monsters) {
      const slot = monster.slot
      if (monster.hp <= 0) {
        if (slot) {
          slot.opacity.value = Math.max(0, slot.opacity.value - dt * 1.6)
          slot.flash.value = Math.max(0, slot.flash.value - dt * 5)
          if (slot.opacity.value <= 0.01) this.releaseActorSlot(slot)
        }
        continue
      }

      const profile = MONSTERS[monster.kind]
      monster.cooldown = Math.max(0, monster.cooldown - dt)
      monster.hitFlash = Math.max(0, monster.hitFlash - dt * 5)
      monster.attackTimer = Math.max(0, monster.attackTimer - dt)
      monster.castTimer = Math.max(0, monster.castTimer - dt)
      if (slot) slot.flash.value = monster.hitFlash

      const dx = hero.x - monster.x
      const dy = hero.y - monster.y
      const distance = Math.hypot(dx, dy)

      // The brain decides awareness and reach from the AI's own parameters when
      // the tables are loaded. Sub-tiles are the unit the tables use and one
      // sub-tile is a fifth of a tile, so distance is converted rather than
      // compared against an invented radius.
      const brainAction = monster.brain
        ? monster.brain.tick({
            dt,
            targetDistance: hero.alive ? distance * 5 : null,
            hpFraction: monster.maxHp > 0 ? monster.hp / monster.maxHp : 0,
          })
        : null

      if (brainAction) {
        monster.aggro = brainAction.state !== 'idle' && brainAction.state !== 'wander'
      } else {
        if (hero.alive && distance < profile.aggro) {
          if (!monster.aggro && monster.kind === 'brute') this.sound('roar')
          monster.aggro = true
        }
        if (distance > profile.aggro * 1.8) monster.aggro = false
      }

      let moveX = 0
      let moveY = 0

      if (monster.aggro && hero.alive) {
        // `standoff` is what the AI wants to hold, in the tables' own units.
        const reach =
          brainAction && brainAction.standoff > 0
            ? brainAction.standoff / 5
            : profile.range
        if (distance > reach - 0.1 && distance > 1e-4) {
          // Separation keeps a pack from collapsing into a single pixel.
          let sepx = 0
          let sepy = 0
          for (const other of this.monsters) {
            if (other === monster || other.hp <= 0) continue
            const ox = monster.x - other.x
            const oy = monster.y - other.y
            const od = Math.hypot(ox, oy)
            if (od > 1e-4 && od < 0.85) {
              sepx += ox / od
              sepy += oy / od
            }
          }
          moveX = dx / distance + sepx * 0.7
          moveY = dy / distance + sepy * 0.7
        } else if (monster.cooldown <= 0 && (!brainAction || brainAction.attack !== null)) {
          monster.cooldown = profile.cooldown
          // The brain's own attack kind decides which state plays: a skill
          // option casts (`sc` → the set's `skill1`/`cast` clip), a plain
          // attack swings (`a1`).
          if (brainAction?.attack?.kind === 'skill') monster.castTimer = CAST_MODE_SECONDS
          else monster.attackTimer = SWING_MODE_SECONDS
          this.hurtHero(profile.damage + this.random() * 4)
        }
      } else {
        monster.wanderTimer -= dt
        if (monster.wanderTimer <= 0) {
          monster.wanderTimer = 1.6 + this.random() * 2.6
          monster.wanderAngle = this.random() * Math.PI * 2
        }
        moveX = Math.cos(monster.wanderAngle) * 0.4
        moveY = Math.sin(monster.wanderAngle) * 0.4
      }

      const length = Math.hypot(moveX, moveY)
      if (length > 1e-4) {
        const beforeX = monster.x
        const beforeY = monster.y
        this.moveEntity(
          monster,
          (moveX / length) * profile.speed * dt,
          (moveY / length) * profile.speed * dt,
        )
        monster.movedLastStep = Math.hypot(monster.x - beforeX, monster.y - beforeY)
        const movedX = monster.x - beforeX
        const movedY = monster.y - beforeY
        const moved = Math.hypot(movedX, movedY)
        if (moved > 0.0005) {
          // Same rule as the hero's: the cycle follows the distance this monster
          // actually covered, against the stride its own walk animation implies.
          monster.walkPhase = advanceWalk(
            monster.walkPhase,
            this.walkTiming(monster.art),
            moved,
            profile.speed,
          )
          monster.dir = worldAngleToIso(Math.atan2(movedY, movedX))
        } else {
          monster.wanderAngle += 1.6 + this.random()
        }
      }
    }

    this.hud.monsterCount.value = this.monsters.filter((monster) => monster.hp > 0).length
  }

  /**
   * Spawns one monster.
   *
   * `options.at` and `options.defId` are how the area's own `.ds1` records spawn:
   * the map says *where* and *which* `monstats` row, so a placed monster is not
   * drawn from the act's pool and not moved away from its tile. Without them a
   * monster is picked at random and placed out of the player's sight, which is what
   * the endless waves of a generated map want.
   */
  private spawnMonster(
    kind?: MonsterKind,
    options: { at?: { x: number; y: number }; defId?: string } = {},
  ): Monster | null {
    if (this.monsters.filter((monster) => monster.hp > 0).length >= MAX_MONSTERS) return null

    const chosen =
      kind ?? (this.random() < 0.35 + this.hero.level * 0.03 ? 'skeleton' : 'zombie')
    const profile = { ...MONSTERS[chosen] }
    /**
     * The monster's own art, resolved below when the tables named a real monster.
     *
     * Declared here rather than inside the branch because the monster literal is
     * built after it, and a monster spawned without the tables has none.
     */
    let art: ActorArt | null = null

    // Swap in the real monster's identity and stats when the tables are loaded:
    // same archetype id (so the sprite and behaviour stay consistent), but the
    // name and health come from monstats.
    if (this.monsterPool.length > 0 && chosen !== 'brute') {
      const placed = options.defId === undefined ? null : this.monsterPool.find((row) => row.id === options.defId)
      const real = placed ?? this.monsterPool[Math.floor(this.random() * this.monsterPool.length)]
      if (placed !== null && placed !== undefined) profile.name = placed.name
      profile.name = real.name

      // The table's own scaling when it is available: the monster's level is the
      // area's monster level, and monlvl's columns are percentages of the
      // monstats base values. That is the real rule, not an approximation of it.
      const def = this.monsterTables?.byId.get(real.id)
      // The art is looked up by the row's `Code`, lower-cased: `monstats` gives
      // the act 5 barbarians `0A` and the export files them under `monsters/0a/`.
      art = def === undefined ? null : (this.monsterArt?.get(def.code.trim().toLowerCase()) ?? null)
      const areaLevel = this.areaMonsterLevel
      let scaled = def ? scaleMonster(this.monsterTables!, def, areaLevel) : null

      // The tables know the area's level, but the player out-levels an act by
      // playing: keep the roster relevant by taking the higher of the two.
      const effectiveLevel = Math.max(areaLevel, this.hero.level * 3)
      if (def && effectiveLevel !== areaLevel) {
        scaled = scaleMonster(this.monsterTables!, def, effectiveLevel)
      }

      if (scaled) {
        // A range means the game rolls inside it.
        const hp = scaled.hp.min + this.random() * Math.max(0, scaled.hp.max - scaled.hp.min)
        profile.maxHealth = Math.max(1, Math.round(hp))
        // Damage is per attack: a monster may have a melee attack, a second one
        // and a skill. The archetype fights with its first attack.
        const attack = scaled.damage.attack1 ?? scaled.damage.skill1 ?? scaled.damage.attack2
        const dmg = attack
          ? attack.min + this.random() * Math.max(0, attack.max - attack.min)
          : 1
        profile.damage = Math.max(1, Math.round(dmg))
        profile.xp = Math.max(1, Math.round(scaled.xp))
        profile.speed = Math.max(0.6, Math.min(5, real.speed * 0.5))
        profile.armor = Math.round(scaled.armor)
      } else {
        const base = real.minHp + this.random() * Math.max(0, real.maxHp - real.minHp)
        const scale = 1 + Math.max(0, this.hero.level - 1) * 0.35
        profile.maxHealth = Math.max(12, Math.round(base * scale))
        profile.damage = Math.max(1, Math.round(real.damage * (0.5 + this.hero.level * 0.06)))
        profile.xp = Math.max(1, Math.round(real.xp * scale))
        profile.speed = Math.max(0.8, Math.min(4.5, real.speed * 0.55))
      }
    }
    const slot = this.claimActorSlot(
      this.sheets[chosen],
      this.sheets[`${chosen}Flash` as const],
      profile.scale,
    )
    if (!slot) return null
    const alive = this.monsters
      .filter((monster) => monster.hp > 0)
      .map((monster) => ({ x: monster.x, y: monster.y }))

    // A placed monster stands where the map puts it; a rolled one is placed out of
    // the player's sight, because an ambush out of thin air reads as a bug.
    let point = options.at ?? randomSpawnPoint(this.map, this.random, alive)
    if (options.at === undefined) {
      const screen = toScreen(point.x, point.y)
      const heroScreen = toScreen(this.hero.x, this.hero.y)
      if (Math.abs(screen.x - heroScreen.x) < 420 && Math.abs(screen.y - heroScreen.y) < 340) {
        point = randomSpawnPoint(this.map, this.random, [
          ...alive,
          { x: this.hero.x, y: this.hero.y },
        ])
      }
    }

    // The brain, built from the same monstats row the stats came from — the placed
    // row when the map named one, otherwise the row behind the rolled name.
    const brainDef = this.monsterTables?.byId.get(
      options.defId ??
        (this.monsterPool.length > 0 ? (this.monsterNameToId.get(profile.name) ?? '') : ''),
    )
    const brain = brainDef && this.monsterTables ? new MonsterBrain(brainDef) : null

    const monster: Monster = {
      id: this.nextMonsterId++,
      kind: chosen,
      art,
      brain,
      x: point.x,
      y: point.y,
      dir: Math.floor(this.random() * 8),
      hp: profile.maxHealth,
      maxHp: profile.maxHealth,
      cooldown: 0,
      hitFlash: 0,
      attackTimer: 0,
      castTimer: 0,
      aggro: false,
      wanderAngle: this.random() * Math.PI * 2,
      wanderTimer: this.random() * 2,
      walkPhase: 0,
      movedLastStep: 0,
      slot,
    }

    this.monsters.push(monster)
    return monster
  }

  private spawnBoss(): void {
    const profile = MONSTERS.brute
    const slot = this.claimActorSlot(this.sheets.brute, this.sheets.bruteFlash, profile.scale)
    if (!slot) return
    slot.hp.value = 1
    slot.barOpacity.value = 1
    this.monsters.push({
      id: this.nextMonsterId++,
      kind: 'brute',
      x: this.map.bossSpawn.x,
      y: this.map.bossSpawn.y,
      dir: 6,
      hp: profile.maxHealth,
      maxHp: profile.maxHealth,
      cooldown: 0,
      hitFlash: 0,
      attackTimer: 0,
      castTimer: 0,
      aggro: false,
      wanderAngle: Math.PI,
      wanderTimer: 3,
      walkPhase: 0,
      movedLastStep: 0,
      slot,
    })
  }

  private damageMonster(monster: Monster, amount: number): void {
    if (monster.hp <= 0) return
    const applied = Math.round(amount)
    monster.hp -= applied
    monster.hitFlash = 1
    monster.aggro = true
    this.floatAt(monster.x, monster.y - 1.1, `${applied}`, COLOURS.damageToMonster, 0.75)

    if (monster.hp <= 0) {
      monster.hp = 0
      this.sound('death')
      this.addXp(MONSTERS[monster.kind].xp)
      this.hero.kills++
      // The area's superunique dying is one of the four things a quest's
      // stand-in condition can be built on; see `d2/quests.ts`.
      if (monster.kind === 'brute') this.bossSlain = true
      this.updateObjective()
      this.spawnEffect('monsterDeath', monster.x, monster.y, 1.5, '#ff7b3d', 0.45, 3)
      this.dropLoot(monster)
    }
  }

  // -- projectiles ----------------------------------------------------------

  /**
   * Fires the skill in the first action-bar slot.
   *
   * The dart it fires plays the animation the game's own tables name for it: the
   * favourite skill's `cltmissile` row, and that row's `CelFile` —
   * `missiles/safearrow` for the Amazon's Magic Arrow — with the animation of the
   * missile the row leaves behind (`teethexplode`) kept for the impact. A skill the
   * tables do not name keeps the drawn fireball sheet.
   */
  private castFireball(): void {
    // Drag-to-aim wins; otherwise snap to whatever the player is most plausibly
    // fighting, and only fall back to "straight ahead".
    let angle = this.hero.facing
    if (this.commands.aimActive) {
      angle = this.commands.aimAngle
    } else {
      const target = pickAutoTarget(
        { x: this.hero.x, y: this.hero.y },
        this.monsters.filter((monster) => monster.hp > 0),
        { maxDistance: 13, facing: this.hero.facing, facingTolerance: Math.PI / 2.5 },
      )
      if (target) angle = Math.atan2(target.y - this.hero.y, target.x - this.hero.x)
    }

    const skill = this.realSkills[0]
    const files = skill === undefined ? [] : this.missileArtFiles(skill)
    const flight = this.flatArtFor(files[0] ?? null)
    const impact = this.flatArtFor(files[1] ?? null)

    // The missile's own sheet when the export has it, the drawn ball otherwise —
    // one slot either way, so the pool and the scene tree see no difference. The
    // flash sheet is the same one, as it is for the hero: the slot's frame geometry
    // has to be the sheet it is actually showing.
    const sheet = flight?.sheet ?? this.sheets.fireball
    const slot = this.claimActorSlot(sheet, sheet)
    if (!slot) return
    if (flight === null) this.flatArtCounts.projectilesDrawn += 1
    else this.flatArtCounts.projectileArt += 1

    const speed = 9.5
    this.projectiles.push({
      x: this.hero.x + Math.cos(angle) * 0.4,
      y: this.hero.y + Math.sin(angle) * 0.4,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.5,
      damage: this.skillDamage('fireball') ?? 30 + this.hero.level * 4,
      slot,
      art: flight,
      impact,
      age: 0,
    })
    this.hero.facing = angle
    this.hero.dir = worldAngleToIso(angle)
    this.sound('fireball')
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i]
      projectile.x += projectile.vx * dt
      projectile.y += projectile.vy * dt
      projectile.life -= dt
      projectile.age += dt

      if (projectile.slot) {
        const art = projectile.art
        if (art === null) {
          // The drawn stand-in, for a build with no export. It plays at the same rate
          // the game's missile rows state, which is the rate the animation it stands
          // in for would play at — a placeholder is no reason to pick a frame time.
          projectile.slot.frame.value =
            frameFromRate(FLAT_RATE_PER_SECOND, this.elapsed) % this.fireballGeometry.columns
        } else {
          // The missile's own art, turned to the way it is flying: the composed
          // sheet is the game's eight headings, the same index the actors use. Its
          // rate is the row's own `AnimSpeed`, read as frames per second — the one
          // rate this app applies to a table that states a rate without a unit.
          const direction = worldAngleToIso(Math.atan2(projectile.vy, projectile.vx))
          const frame =
            frameFromRate(FLAT_RATE_PER_SECOND, projectile.age) % art.frames
          projectile.slot.frame.value = art.frameIndex(direction, frame)
        }
      }

      let hit: Monster | null = null
      for (const monster of this.monsters) {
        if (monster.hp <= 0) continue
        if (Math.hypot(monster.x - projectile.x, monster.y - projectile.y) < 0.75) {
          hit = monster
          break
        }
      }

      const blocked = !isWalkable(this.map, projectile.x, projectile.y)
      if (!hit && !blocked && projectile.life > 0) continue

      if (hit) {
        this.damageMonster(hit, projectile.damage)
        // Small splash, so a well-aimed ball punishes the pack rather than
        // exactly one body.
        for (const monster of this.monsters) {
          if (monster === hit || monster.hp <= 0) continue
          if (Math.hypot(monster.x - hit.x, monster.y - hit.y) < 1.5) {
            this.damageMonster(monster, projectile.damage * 0.45)
          }
        }
        this.spawnEffect('missileImpact', hit.x, hit.y, 1.3, '#ff9a2e', 0.35, 4, projectile.impact)
      } else {
        this.spawnEffect('missileBlocked', projectile.x, projectile.y, 0.7, '#ff9a2e', 0.25, 3, projectile.impact)
      }
      this.releaseActorSlot(projectile.slot)
      this.projectiles.splice(i, 1)
    }
  }

  private castNova(): void {
    const radius = 4.2
    const damage = this.skillDamage('nova') ?? 46 + this.hero.level * 6
    this.sound('nova')
    this.spawnEffect('nova', this.hero.x, this.hero.y, radius, '#8fd0ff', 0.55, 6)
    for (const monster of this.monsters) {
      if (monster.hp <= 0) continue
      if (Math.hypot(monster.x - this.hero.x, monster.y - this.hero.y) <= radius) {
        this.damageMonster(monster, damage)
      }
    }
  }

  // -- loot -----------------------------------------------------------------

  private dropLoot(monster: Monster): void {
    const elite = monster.kind === 'brute'
    this.spawnDrop(monster.x, monster.y, 'gold', Math.round((8 + this.random() * 22) * (elite ? 9 : 1)))

    if (elite || this.random() < 0.24) {
      this.spawnDrop(monster.x + this.random() * 0.6 - 0.3, monster.y, 'health', 0)
    }
    if (this.random() < 0.18) {
      this.spawnDrop(monster.x, monster.y + this.random() * 0.6 - 0.3, 'mana', 0)
    }
    if (this.random() < (elite ? 1 : 0.19)) {
      this.spawnDrop(monster.x, monster.y, 'item', 0, this.createItem(elite))
    }
  }

  private createItem(elite: boolean): Item {
    // The retail drop tables when they are loaded: the item is a real base item
    // with real affixes rolled at the monster's level, and its name is the
    // game's own name rather than one assembled from invented word lists.
    if (this.dropResolver) {
      try {
        const level = Math.max(1, Math.round(this.hero.level * 3 + (elite ? 20 : 0)))
        const rolled = this.dropResolver.rollDrops(
          treasureClassFor(level),
          level,
          0,
          // The item module's Random has three members, not one. Adapting only
          // `next` made every roll throw, which the catch below then hid by
          // silently falling back to the built-in loot — the real tables were
          // never reached.
          this.itemRandom,
        )
        const picked = rolled.find((entry) => entry.name) ?? rolled[0]
        if (picked) {
          return {
            name: picked.name ?? 'Item',
            rarity: mapRarity(picked.rarity),
            icon: iconForItem(picked),
            graphic: picked.graphic ?? null,
            source: picked,
            // The generator's own text when it produced any; otherwise the
            // rolled stats, so the panel never shows an item with no numbers.
            tooltip:
              picked.tooltip && picked.tooltip.length > 0
                ? [...picked.tooltip]
                : describeItemStats(picked),
          }
        }
      } catch {
        // A drop that cannot be rolled falls through to the built-in path rather
        // than losing the kill's reward entirely.
      }
    }

    const roll = this.random() + (elite ? 0.35 : 0)
    const rarity: Rarity = roll > 1.2 ? 'unique' : roll > 0.92 ? 'rare' : roll > 0.62 ? 'magic' : 'common'
    const icons: LootIcon[] = ['sword', 'armor', 'ring', 'rune']
    const icon = icons[Math.floor(this.random() * icons.length)]
    const base = ITEM_BASES[Math.floor(this.random() * ITEM_BASES.length)]
    const prefix =
      rarity === 'common'
        ? ''
        : `${ITEM_PREFIXES[Math.floor(this.random() * ITEM_PREFIXES.length)]} `
    const suffix =
      rarity === 'rare' || rarity === 'unique'
        ? ` ${ITEM_SUFFIXES[Math.floor(this.random() * ITEM_SUFFIXES.length)]}`
        : ''
    // The built-in path has no retail base behind it, so there is no graphic to
    // name: the HUD draws its own stand-in for these.
    return { name: `${prefix}${base}${suffix}`, rarity, icon, graphic: null, tooltip: [] }
  }

  private spawnDrop(x: number, y: number, kind: Drop['kind'], gold: number, item: Item | null = null): void {
    const slot = this.lootSlots.find((candidate) => !candidate.active)
    if (!slot) return
    slot.active = true
    slot.x.value = x
    slot.y.value = y
    slot.opacity.value = 1
    slot.label.value = item ? item.name : ''
    slot.labelColor.value = item ? rarityColor(item.rarity) : '#ffffff'
    slot.frame = LOOT_ICONS.indexOf(
      kind === 'gold'
        ? 'gold'
        : kind === 'health'
          ? 'health'
          : kind === 'mana'
            ? 'mana'
            : item?.icon ?? 'sword',
    )
    this.drops.push({ x, y, ttl: 9999, kind, gold, item, slot })
  }

  private updateDrops(dt: number): void {
    const hero = this.hero
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i]
      drop.ttl -= dt
      const distance = Math.hypot(drop.x - hero.x, drop.y - hero.y)

      // Auto-pickup: a touch player should never have to fight the screen for a
      // drop that is already under their feet.
      if (hero.alive && distance < 1.25) {
        this.collect(drop)
        this.releaseLootSlot(drop.slot)
        this.drops.splice(i, 1)
        continue
      }
      if (drop.ttl <= 0) {
        this.releaseLootSlot(drop.slot)
        this.drops.splice(i, 1)
      }
    }
  }

  private collect(drop: Drop): void {
    const hero = this.hero
    if (drop.kind === 'gold') {
      hero.gold += drop.gold
      this.sound('pickup-gold')
      this.floatAt(hero.x, hero.y - 0.9, `+${drop.gold} gold`, COLOURS.gold, 0.8)
      return
    }
    if (drop.kind === 'health') {
      if (hero.potions >= MAX_POTIONS) return
      hero.potions++
      this.floatAt(hero.x, hero.y - 0.9, '+1 potion', COLOURS.heal, 0.8)
      return
    }
    if (drop.kind === 'mana') {
      hero.mana = Math.min(hero.maxMana, hero.mana + 26)
      this.floatAt(hero.x, hero.y - 0.9, '+26 mana', COLOURS.mana, 0.8)
      return
    }
    if (drop.item) {
      this.sound('pickup-item')
      this.pushLog(`${drop.item.name} — ${drop.item.rarity}`, drop.item.rarity)
      this.floatAt(hero.x, hero.y - 1.1, drop.item.name, rarityColor(drop.item.rarity), 1.3)
      // Picking a weapon up equips it — the demo has no equipment screen — and
      // the equipped type selects the retail clip family (`1hs`/`bow`/`stf`/…)
      // the actor layer animates the hero with.
      const generated = drop.item.source
      if (generated !== undefined && generated.base.kind === 'weapon') {
        hero.weaponMode = weaponModeOf(generated.base)
      }
      // Into the bag, so the panel can show what was found.
      if (this.inventory.value.length < this.inventorySize) {
        this.inventory.value = [drop.item, ...this.inventory.value]
      }
    }
  }

  private releaseLootSlot(slot: LootSlot | null): void {
    if (!slot) return
    slot.active = false
    slot.label.value = ''
    slot.x.value = -9999
    slot.y.value = -9999
  }

  // -- floats & effects -----------------------------------------------------

  private floatAt(x: number, y: number, text: string, color: string, life: number): void {
    const slot = this.floatSlots.find((candidate) => !candidate.active)
    if (!slot) return
    slot.active = true
    slot.text.value = text
    slot.color.value = color
    slot.opacity.value = 1
    this.floats.push({ x, y, life, maxLife: life, rise: 26, slot })
  }

  private updateFloats(dt: number): void {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const floating = this.floats[i]
      floating.life -= dt
      if (floating.life <= 0) {
        if (floating.slot) floating.slot.active = false
        this.floats.splice(i, 1)
        continue
      }
      // `floatAt` is handed a WORLD tile position (a hero's `x`/`y`), and the
      // slot is read as screen pixels — so the projection has to happen here.
      // It did not, which pinned every damage number and every "+12" to the
      // world origin.
      const slot = floating.slot
      if (!slot) continue
      const point = toScreen(floating.x, floating.y)
      const progress = 1 - floating.life / floating.maxLife
      slot.x.value = point.x
      slot.y.value = point.y - 24 - progress * floating.rise
      slot.opacity.value = Math.min(1, (floating.life / floating.maxLife) * 3)
    }
  }

  /**
   * Spawns an effect at a point.
   *
   * The kind is what decides the art: {@link EFFECT_ART_FILE} names one fixed
   * overlay for the kinds that have one (the potion burst is the game's own
   * `healing` overlay), a caller passes the art it resolved itself for the kinds
   * whose animation belongs to something else (a missile's impact is the animation
   * of the missile that landed), and a kind with neither keeps the drawn ring.
   *
   * Where there *is* art it **replaces** the ring rather than being drawn under it:
   * the overlay is this effect, drawn the way the game draws it, and a ring over the
   * game's art would be the app's flourish, not the game's.
   */
  private spawnEffect(
    kind: EffectArtKind,
    x: number,
    y: number,
    radius: number,
    color: string,
    life: number,
    thickness: number,
    art: FlatAnimation | null = null,
  ): void {
    const overlay = art ?? this.flatArtFor(EFFECT_ART_FILE[kind] ?? null)
    if (overlay !== null) {
      const artSlot = this.claimActorSlot(overlay.sheet, overlay.sheet)
      if (artSlot) {
        // The effect lasts at least as long as the animation it plays: the game's
        // own frames are the effect, and cutting a 13-frame explosion off after
        // five of them is the app's clock overriding the art.
        const duration = Math.max(life, overlay.frames / FLAT_RATE_PER_SECOND)
        artSlot.opacity.value = 1
        this.flatArtCounts.effectArt += 1
        this.effects.push({
          kind,
          x,
          y,
          life: duration,
          maxLife: duration,
          radius,
          thickness,
          slot: null,
          art: overlay,
          artSlot,
          started: this.elapsed,
        })
        return
      }
    }

    const slot = this.effectSlots.find((candidate) => !candidate.active)
    if (!slot) return
    this.flatArtCounts.effectsDrawn += 1
    slot.active = true
    slot.color.value = color
    slot.thickness.value = thickness
    slot.opacity.value = 1
    slot.radius.value = radius
    this.effects.push({
      kind,
      x,
      y,
      life,
      maxLife: life,
      radius,
      thickness,
      slot,
      art: null,
      artSlot: null,
      started: this.elapsed,
    })
  }

  private updateEffects(dt: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i]
      effect.life -= dt
      if (effect.life <= 0) {
        if (effect.slot) effect.slot.active = false
        if (effect.artSlot) this.releaseActorSlot(effect.artSlot)
        this.effects.splice(i, 1)
      }
    }
  }

  // -- the game's own missile and overlay art --------------------------------

  /**
   * Loads the animations the run will play, in the background.
   *
   * A missile's animation is named by `missiles.txt`'s `CelFile` for the row that
   * `skills.txt`'s missile column points at, so the key only exists once a skill
   * fires — which is why this is read here rather than handed in with the rest of
   * the art. The manifest is read once for the whole run and the handful of
   * animations the action bar needs are composed straight away; anything else,
   * including the impact of a missile the tables name later, is composed when it is
   * first played.
   */
  private async warmFlatArt(): Promise<void> {
    try {
      const base = exportBase()
      const index = await loadAnimIndex(base)
      if (index === null) return
      const cache = new FlatArtCache(base, index)
      this.flatArt = cache
      const files: FlatArtFile[] = []
      for (const file of Object.values(EFFECT_ART_FILE)) if (file !== undefined) files.push(file)
      for (const skill of this.realSkills) files.push(...this.missileArtFiles(skill))
      await cache.loadForFiles(files)
    } catch (error) {
      // The drawn ball and ring stand in, which is what a build with no export
      // plays anyway.
      console.warn('rasen: missile and overlay art unavailable', String(error))
    }
  }

  /**
   * The animation clock every actor's every mode is timed from.
   *
   * Loaded once, beside the flat art, because it is one table for the whole run rather
   * than one per actor. A build with no export keeps `null` and every animation plays
   * at {@link unlistedTiming}'s rate, which is the table's modal value; nothing here
   * invents a frame rate.
   */
  private async warmAnimData(): Promise<void> {
    try {
      this.animData = await loadAnimData(exportBase())
    } catch (error) {
      console.warn('rasen: animation timing table unavailable', String(error))
    }
  }

  /**
   * The clock for one composed animation, from `AnimData.D2`.
   *
   * Keyed by the animation's own key — `chars/am/nu/hth` — because that key *is* the
   * table's token in lower case, so there is no second naming scheme to keep in step.
   * An animation the table does not list, and every animation in a build with no
   * export, gets {@link unlistedTiming}, whose rate is the table's modal value and
   * whose frame count is the drawn sheet's.
   */
  private timingOf(animation: { key: string; frames: number } | null | undefined): AnimTiming {
    if (animation === null || animation === undefined) return unlistedTiming(1)
    const timing = this.animData === null ? null : timingFor(this.animData, animation.key)
    return timing ?? unlistedTiming(animation.frames)
  }

  /**
   * The clock for an actor's walk, where the *phase* is advanced rather than the time.
   *
   * Walking is the one mode driven by distance (`advanceWalk`), so it is the one mode
   * that needs its timing where the entity moves rather than where it is drawn.
   */
  private walkTiming(art: ActorArt | null | undefined): AnimTiming {
    return this.timingOf(art?.sheetFor('wl') ?? null)
  }

  /**
   * The art files a skill's missile plays, flight first and impact second.
   *
   * `cltmissile` is the client's own choice of visual and `srvmissile` the
   * server's; the client's is what a player sees, so it wins where the two differ.
   * That row's `CelFile` names the flight animation (`SafeArrow`), and its
   * `ExplosionMissile` names the missile that plays where it lands
   * (`teethexplode`, whose own `CelFile` is the impact art). Both are read from the
   * tables, so no name here is one this module chose.
   */
  private missileArtFiles(skill: SkillRow): FlatArtFile[] {
    const missiles = this.skillRuntime?.missilesFor(skill.name) ?? null
    const flight = missiles?.client ?? missiles?.server ?? null
    if (flight === null) return []
    const files: FlatArtFile[] = [{ tree: 'missiles', fileName: celFileOf(flight) }]
    const explosion =
      flight.explosionMissile === null ? undefined : this.skillRuntime?.missile(flight.explosionMissile)
    if (explosion !== undefined) files.push({ tree: 'missiles', fileName: celFileOf(explosion) })
    return files.filter((file) => file.fileName !== '')
  }

  /**
   * The art a table named, **if it has already been composed**.
   *
   * Synchronous on purpose: a cast cannot wait, so a frame that arrives before the
   * art has loaded draws the fallback and the next frame draws the real thing.
   */
  private flatArtFor(file: FlatArtFile | null): FlatAnimation | null {
    if (file === null || this.flatArt === null) return null
    return this.flatArt.peekForFile(file.tree, file.fileName)
  }

  /**
   * What the flat-key art did, for the startup report.
   *
   * Counted per spawn rather than per animation, because that is the question that
   * matters: how many projectiles flew with the game's own missile art and how many
   * fell back to the drawn sheet, and the same for effects and their overlays.
   */
  get flatArtSummary(): {
    loaded: number
    missing: readonly string[]
    projectiles: { real: number; drawn: number }
    effects: { real: number; drawn: number }
  } {
    return {
      loaded: this.flatArt?.loaded ?? 0,
      missing: this.flatArt?.missing ?? [],
      projectiles: {
        real: this.flatArtCounts.projectileArt,
        drawn: this.flatArtCounts.projectilesDrawn,
      },
      effects: { real: this.flatArtCounts.effectArt, drawn: this.flatArtCounts.effectsDrawn },
    }
  }

  // -- progression ----------------------------------------------------------

  private addXp(amount: number): void {
    const hero = this.hero
    hero.xp += amount
    this.floatAt(hero.x, hero.y - 1.5, `+${amount} xp`, COLOURS.mana, 0.9)
    while (hero.xp >= hero.xpToNext) {
      hero.xp -= hero.xpToNext
      hero.level++
      hero.xpToNext = this.xpForNextLevel(hero.level)
      hero.maxHp += 26
      hero.hp = hero.maxHp
      hero.maxMana += 11
      hero.mana = hero.maxMana
      hero.damage += 2.4
      hero.armor += 2.5
      hero.potions = Math.min(MAX_POTIONS, hero.potions + 2)
      this.sound('levelup')
      this.spawnEffect('levelUp', hero.x, hero.y, 3.2, '#ffd75e', 0.8, 5)
      this.floatAt(hero.x, hero.y - 2, `LEVEL ${hero.level}`, COLOURS.gold, 1.6)
      this.pushLog(`Level ${hero.level} — attributes increased`, 'magic')
    }
  }

  private pushLog(text: string, rarity: Rarity): void {
    const entry: LogEntry = { id: this.nextLogId++, text, rarity }
    this.hud.log.value = [entry, ...this.hud.log.value].slice(0, 5)
  }

  private updateSpawning(dt: number): void {
    // A town is a refuge: `MonDen` is 0 for it, so nothing wanders in.
    if (!this.areaHasMonsters) return
    this.spawnTimer -= dt
    if (this.spawnTimer > 0) return
    this.spawnTimer = Math.max(3.5, 11 - this.hero.level * 0.5)
    const wanted = Math.min(4, 1 + Math.floor(this.hero.level / 2))
    for (let i = 0; i < wanted; i++) this.spawnMonster()
  }

  // -- movement & helpers ---------------------------------------------------

  /**
   * Move with per-axis sliding.
   *
   * When the diagonal step is blocked the entity still gets whichever axis is
   * open. Without it, a touch player sticks to every wall corner in the map,
   * because the stick points at a wall and the character simply stops.
   */
  private moveEntity(entity: { x: number; y: number }, dx: number, dy: number): void {
    const nextX = entity.x + dx
    const nextY = entity.y + dy

    // The game's own rule: the walker occupies a cross (its cell plus the four
    // neighbours), so it stops a sub-cell earlier than a point test would.
    //
    // The escape hatch matters: if the walker is ALREADY overlapping something
    // (a spawn point, a door offset, a level whose art disagrees with its flags),
    // requiring a free footprint at the destination traps it — 13% of this town's
    // open tiles were immobile that way, including moves straight away from the
    // wall. Someone already overlapping may step out; only a walker in a legal
    // spot is held to the footprint.
    const freeHere = isWalkableBody(this.map, entity.x, entity.y)
    const fits = (x: number, y: number): boolean =>
      freeHere ? isWalkableBody(this.map, x, y) : isWalkable(this.map, x, y)

    if (fits(nextX, nextY)) {
      entity.x = nextX
      entity.y = nextY
      return
    }
    if (Math.abs(dx) > 1e-6 && fits(nextX, entity.y)) {
      entity.x = nextX
      return
    }
    if (Math.abs(dy) > 1e-6 && fits(entity.x, nextY)) {
      entity.y = nextY
    }
  }

  private monsterAt(worldX: number, worldY: number): Monster | null {
    let best: Monster | null = null
    let bestDistance = 0.85
    for (const monster of this.monsters) {
      if (monster.hp <= 0) continue
      const distance = Math.hypot(monster.x - worldX, monster.y - worldY)
      if (distance < bestDistance) {
        bestDistance = distance
        best = monster
      }
    }
    return best
  }

  // -- slot plumbing --------------------------------------------------------

  private createActorSlot(): ActorSlot {
    return {
      kind: 'actor',
      active: false,
      x: ref(-9999),
      y: ref(-9999),
      width: ref(0),
      height: ref(0),
      frame: ref(0),
      opacity: ref(0),
      image: ref(this.sheets.hero.image),
      flashImage: ref(this.sheets.heroFlash.image),
      frameWidth: ref(this.sheets.hero.frameWidth),
      frameHeight: ref(this.sheets.hero.frameHeight),
      columns: ref(this.sheets.hero.columns),
      flash: ref(0),
      hp: ref(1),
      barOpacity: ref(0),
    }
  }

  /**
   * Points a slot at a sheet: the image *and* the grid it is cut into.
   *
   * Every path that draws an actor from real art goes through here. Setting the image
   * without the cell size was the bug that hid every character: the hero's composed
   * strip is 3392 x 87 and the placeholder's grid said 44 x 56 in 4 columns, so every
   * `drawImage` cropped a corner of the strip that is transparent.
   */
  private bindSlot(slot: ActorSlot, sheet: SpriteSheet, scale = 1): void {
    slot.image.value = sheet.image
    slot.frameWidth.value = sheet.frameWidth
    slot.frameHeight.value = sheet.frameHeight
    slot.columns.value = sheet.columns
    slot.width.value = sheet.frameWidth * scale
    slot.height.value = sheet.frameHeight * scale
  }

  /**
   * An NPC's own animation, when the export has the art for its `monstats` row.
   *
   * An NPC is a `monstats` row like any other, so its art is filed under the row's
   * `Code`; `placeAreaContent` places NPCs by `Id`. Without the row — or without the
   * art — the palette-swapped copy of the hero sheet stands in, which is what a town
   * of identical silhouettes would have been.
   */
  private npcArtFor(id: string): ActorArt | null {
    const code = this.monsterTables?.byId.get(id)?.code
    if (code === undefined || code === '') return null
    return this.monsterArt?.get(code.toLowerCase()) ?? null
  }

  private claimActorSlot(
    sheet?: SpriteSheet,
    flashSheet?: SpriteSheet,
    scale = 1,
  ): ActorSlot | null {
    const slot = this.actorSlots.find((candidate) => !candidate.active)
    if (!slot) return null
    slot.active = true
    const geometry = sheet ?? this.sheets.hero
    this.bindSlot(slot, geometry, scale)
    slot.flashImage.value = (flashSheet ?? this.sheets.heroFlash).image
    slot.opacity.value = 1
    slot.flash.value = 0
    slot.barOpacity.value = 0
    slot.frame.value = 0
    slot.hp.value = 1
    return slot
  }

  private releaseActorSlot(slot: ActorSlot | null): void {
    if (!slot) return
    slot.active = false
    slot.opacity.value = 0
    slot.flash.value = 0
    slot.barOpacity.value = 0
    slot.x.value = -9999
    slot.y.value = -9999
  }

  // -- render sync ----------------------------------------------------------

  private syncCamera(): void {
    const heroScreen = toScreen(this.hero.x, this.hero.y)
    if (this.hud.aiming.value) {
      // The aim angle is a world angle; a dot placed in world space would drag
      // behind the hand, so project the direction to screen and pin the dot a
      // fixed distance out — it reads as "this is where it will land".
      const projected = toScreen(Math.cos(this.hud.aimAngle.value), Math.sin(this.hud.aimAngle.value))
      const length = Math.hypot(projected.x, projected.y) || 1
      this.hud.aimDotX.value = heroScreen.x + this.cameraX.value + (projected.x / length) * 76
      this.hud.aimDotY.value = heroScreen.y + this.cameraY.value + (projected.y / length) * 76
    }

    const screen = toScreen(this.hero.x, this.hero.y)
    const targetX = window.innerWidth / 2 - screen.x
    const targetY = window.innerHeight / 2 - screen.y
    this.cameraX.value += (targetX - this.cameraX.value) * 0.16
    this.cameraY.value += (targetY - this.cameraY.value) * 0.16
  }

  /** Project every live entity into its slot, then rebuild the culled sorted list. */
  private syncActors(): void {
    const hero = this.hero

    const heroArt = this.heroArt
    if (heroArt === null) {
      const heroAnchor = this.spriteAnchor(hero.x, hero.y, this.sheets.hero, 1)
      this.heroSlot.x.value = heroAnchor.x
      this.heroSlot.y.value = heroAnchor.y
      this.heroSlot.frame.value = spriteFrame(
        hero.dir,
        hero.alive && this.heroMoving() ? 1 + (Math.floor(hero.walkPhase) % 3) : 0,
      )
    } else {
      // The mode is the hero's state and the frame is the animation's: walking is
      // advanced by distance in `updateHero`, everything else by the animation's own
      // clock over the seconds it has been playing. Neither passes through a rate
      // this app chose — `timingOf` reads both from `AnimData.D2`.
      const mode = this.heroAnimMode()
      if (mode !== this.heroMode) {
        this.heroMode = mode
        // The clock reads "seconds this mode has been playing", so a mode
        // change restarts it — an attack would otherwise start mid-swing.
        this.heroModeTime = 0
      }
      const animation = heroArt.sheetFor(this.heroMode)
      const timing = this.timingOf(animation)
      const progress =
        this.heroMode === 'wl' ? hero.walkPhase : framesElapsed(timing, this.heroModeTime)
      const frame = frameIndexOf(progress, timing, animation.frames)
      // The composed cell has the unit's origin at (anchorX, anchorY), so the cell
      // is placed at the point minus the anchor — not centred, which is what the
      // drawn sheet wanted and the real art does not.
      const point = toScreen(hero.x, hero.y)
      this.heroSlot.x.value = point.x - animation.anchorX
      this.heroSlot.y.value = point.y - animation.anchorY
      this.bindSlot(this.heroSlot, animation.sheet)
      this.heroSlot.frame.value = animation.frameIndex(hero.dir, frame)
    }
    this.heroSlot.flash.value = hero.hitFlash

    for (const monster of this.monsters) {
      const slot = monster.slot
      if (!slot || monster.hp <= 0) continue
      const profile = MONSTERS[monster.kind]
      const anchor = this.spriteAnchor(monster.x, monster.y, this.sheets[monster.kind], profile.scale)
      slot.x.value = anchor.x
      slot.y.value = anchor.y
      const closing = monster.aggro && Math.hypot(hero.x - monster.x, hero.y - monster.y) > profile.range - 0.1
      const art = monster.art
      if (art === null || art === undefined) {
        slot.frame.value = spriteFrame(monster.dir, closing ? 1 + (Math.floor(monster.walkPhase) % 3) : 0)
      } else {
        // The mode follows the same priority the hero's does (attack, hit,
        // closing, idle), and the frame comes from the same table: the walk
        // phase while closing, the animation's own clock otherwise.
        const mode = this.monsterAnimMode(monster)
        const animation = art.sheetFor(mode)
        const timing = this.timingOf(animation)
        const progress =
          mode === 'wl' ? monster.walkPhase : framesElapsed(timing, this.elapsed)
        const frame = frameIndexOf(progress, timing, animation.frames)
        // The composed cell carries the unit's origin at its anchor, so the cell is
        // placed at the point minus the anchor — not at the drawn sheet's centred
        // position, which is a different convention.
        const point = toScreen(monster.x, monster.y)
        slot.x.value = point.x - animation.anchorX * profile.scale
        slot.y.value = point.y - animation.anchorY * profile.scale
        this.bindSlot(slot, animation.sheet, profile.scale)
        slot.frame.value = animation.frameIndex(monster.dir, frame)
      }
      slot.hp.value = monster.hp / monster.maxHp
      slot.barOpacity.value = monster.hp < monster.maxHp ? 1 : 0
    }

    // The town's own people. They stand where the area places them and face south
    // until they have something to do — `monstats`' `Idle` AI, which is what the
    // retail game gives a shopkeeper.
    for (const unit of [...this.npcs, ...this.critters]) {
      const slot = unit.slot
      const art = this.npcArtFor(unit.id)
      if (art === null) {
        const anchor = this.spriteAnchor(unit.x, unit.y, this.npcSheet, 1)
        this.bindSlot(slot, this.npcSheet)
        slot.x.value = anchor.x
        slot.y.value = anchor.y
        slot.frame.value = spriteFrame(2, 0)
      } else {
        const animation = art.sheetFor('nu')
        const point = toScreen(unit.x, unit.y)
        this.bindSlot(slot, animation.sheet)
        slot.x.value = point.x - animation.anchorX
        slot.y.value = point.y - animation.anchorY
        slot.frame.value = animation.frameIndex(2, 0)
      }
    }

    for (const projectile of this.projectiles) {
      if (!projectile.slot) continue
      if (projectile.art === null) {
        const anchor = this.spriteAnchor(projectile.x, projectile.y, this.sheets.fireball, 1, 0.5)
        projectile.slot.x.value = anchor.x
        projectile.slot.y.value = anchor.y
      } else {
        // The composed cell carries the missile's own anchor — the point the art
        // was drawn around — so the cell goes at the point minus it, the same way
        // the hero's and the monsters' art is placed.
        const point = toScreen(projectile.x, projectile.y)
        projectile.slot.x.value = point.x - projectile.art.anchorX
        projectile.slot.y.value = point.y - projectile.art.anchorY
      }
    }

    for (const drop of this.drops) {
      if (!drop.slot) continue
      const anchor = this.spriteAnchor(drop.x, drop.y, this.sheets.loot, 1, 0.9)
      const bob = Math.sin(this.elapsed * 3.4 + drop.x * 1.7) * 2.5
      drop.slot.x.value = anchor.x
      drop.slot.y.value = anchor.y + bob
    }

    for (const floating of this.floats) {
      if (!floating.slot) continue
      const progress = 1 - floating.life / floating.maxLife
      const anchor = toScreen(floating.x, floating.y - progress * (floating.rise / TILE_HEIGHT))
      floating.slot.x.value = anchor.x
      floating.slot.y.value = anchor.y
      floating.slot.opacity.value = Math.min(1, floating.life / (floating.maxLife * 0.6))
    }

    for (const effect of this.effects) {
      const anchor = toScreen(effect.x, effect.y)
      const art = effect.art
      const artSlot = effect.artSlot
      if (art !== null && artSlot !== null) {
        artSlot.x.value = anchor.x - art.anchorX
        artSlot.y.value = anchor.y - art.anchorY
        const age = Math.max(0, this.elapsed - effect.started)
        artSlot.frame.value = art.frameIndex(
          0,
          Math.min(art.frames - 1, frameFromRate(FLAT_RATE_PER_SECOND, age)),
        )
        continue
      }
      if (!effect.slot) continue
      const progress = 1 - effect.life / effect.maxLife
      effect.slot.x.value = anchor.x
      effect.slot.y.value = anchor.y
      // The effect art is authored against a 64-pixel cell, so its size follows
      // the world's cell: at 160 a blast covers the same fraction of a cell it
      // always did.
      effect.slot.radius.value = effect.radius * (0.3 + progress * 0.8) * (TILE_WIDTH / 64)
      effect.slot.opacity.value = Math.max(0, 1 - progress)
    }

    // Culling happens in world-screen space, then the camera offset is applied.
    // The margin is deliberately asymmetric between first sight and last sight:
    // hysteresis stops a prop from flickering in and out while the camera
    // creeps along its edge.
    const originX = -this.cameraX.value
    const originY = -this.cameraY.value
    const viewportW = window.innerWidth
    const viewportH = window.innerHeight

    const isVisible = (slot: object, x: number, y: number): boolean => {
      const seen = this.onScreen.has(slot)
      const marginX = seen ? TILE_WIDTH * 1.5 : TILE_WIDTH * 4
      const marginY = seen ? TILE_HEIGHT * 2 : TILE_HEIGHT * 5
      const visible =
        x > originX - marginX &&
        x < originX + viewportW + marginX &&
        y > originY - marginY &&
        y < originY + viewportH + marginY
      if (visible) this.onScreen.add(slot)
      else this.onScreen.delete(slot)
      return visible
    }

    const staged: Array<{
      slot: ActorSlot | PropSlot | LootSlot | FloatSlot | EffectSlot
      depth: number
    }> = []
    const stage = (
      slot: ActorSlot | PropSlot | LootSlot | FloatSlot | EffectSlot,
      worldX: number,
      worldY: number,
      x: number,
      y: number,
    ): void => {
      if (!isVisible(slot, x, y)) return
      staged.push({ slot, depth: depthOf(worldX, worldY) })
    }

    // The hero's slot already carries its own anchor, whichever art it is drawn
    // with, so the staged position comes from the slot rather than a recomputed one.
    stage(this.heroSlot, hero.x, hero.y, this.heroSlot.x.value, this.heroSlot.y.value)

    for (const prop of this.propSlots) {
      // A prop whose own 3D model stands in the actor layer draws no sprite.
      if (!prop.active || prop.model3d === true) continue
      const anchor = this.spriteAnchor(prop.x, prop.y, this.sheets.props, prop.scale)
      stage(prop, prop.x, prop.y, anchor.x, anchor.y)
    }
    for (const monster of this.monsters) {
      const slot = monster.slot
      if (!slot || monster.hp <= 0) continue
      stage(slot, monster.x, monster.y, slot.x.value, slot.y.value)
    }
    // The town's people are staged like anything else that stands on a tile, and so
    // are the animals.
    for (const npc of this.npcs) stage(npc.slot, npc.x, npc.y, npc.slot.x.value, npc.slot.y.value)
    for (const critter of this.critters) {
      stage(critter.slot, critter.x, critter.y, critter.slot.x.value, critter.slot.y.value)
    }
    for (const projectile of this.projectiles) {
      if (!projectile.slot) continue
      stage(projectile.slot, projectile.x, projectile.y, projectile.slot.x.value, projectile.slot.y.value)
    }
    for (const drop of this.drops) {
      if (!drop.slot) continue
      // Half a tile south of the tile centre so a drop never hides behind the
      // body that dropped it.
      stage(drop.slot, drop.x, drop.y + 0.5, drop.slot.x.value, drop.slot.y.value)
    }
    for (const effect of this.effects) {
      // An effect is one node or the other: the game's own overlay occupies an
      // actor slot, and a kind with no overlay keeps the drawn ring.
      const slot = effect.artSlot ?? effect.slot
      if (!slot) continue
      stage(slot, effect.x, effect.y + 0.25, slot.x.value, slot.y.value)
    }
    for (const floating of this.floats) {
      // Floats are always drawn last — a damage number behind a monster is
      // unreadable.
      if (floating.slot) staged.push({ slot: floating.slot, depth: Number.MAX_SAFE_INTEGER })
    }

    staged.sort((a, b) => a.depth - b.depth)
    const next = staged.map((entry) => entry.slot)

    const current = this.renderList.value
    let changed = current.length !== next.length
    if (!changed) {
      for (let i = 0; i < next.length; i++) {
        if (current[i] !== next[i]) {
          changed = true
          break
        }
      }
    }
    if (changed) this.renderList.value = next
  }

  /** Sprite top-left so the sprite's feet land on the tile centre. */
  private spriteAnchor(
    worldX: number,
    worldY: number,
    sheet: SpriteSheet,
    scale: number,
    heightFactor = 1,
  ): { x: number; y: number } {
    const point = toScreen(worldX, worldY)
    return {
      x: point.x - (sheet.frameWidth * scale) / 2,
      y: point.y - sheet.frameHeight * scale * heightFactor,
    }
  }

  /**
   * What the next level costs, from `experience.txt`.
   *
   * The game's table stores **cumulative totals per class**, so the cost of a level
   * is the difference between two rows: 500 to be level 1 and 1500 to be level 2
   * makes level 2 cost 1000. The app's own curve is kept only as the fallback for a
   * build with no `table_experience.json`, because a levelling curve is the one
   * number an action RPG cannot do without.
   *
   * Returns 0 at the cap, which the caller treats as "nothing more to gain" rather
   * than dividing by it.
   */
  private xpForNextLevel(level: number): number {
    const table = this.realData?.experience ?? null
    if (table !== null) {
      const className = experienceClassOf(table, this.heroClass ?? '')
      return table.xpToNext(className, level)
    }
    return Math.round(90 * Math.pow(Math.max(1, level), 1.35))
  }

  private heroMoving(): boolean {
    return (
      this.commands.moving ||
      (this.commands.path !== null && this.commands.pathIndex < this.commands.path.length)
    )
  }

  /**
   * Whether the current area is a town — `levels.txt` gives a town `MonDen` 0,
   * the game's own marker. Selects the retail town stances (`townneutral`,
   * `townwalk`) and the town fidgets.
   */
  get inTown(): boolean {
    return !this.areaHasMonsters
  }

  /**
   * The hero's animation mode this step — the ONE state source both drawn
   * layers animate from: the classic sheet (`heroArt.sheetFor`) and the 3D
   * state machine (`./three-d/anim-state.ts`).
   */
  heroAnimMode(): ActorMode {
    const hero = this.hero
    if (!hero.alive) return 'dd'
    if (hero.attackTimer > 0) return 'a1'
    if (hero.castTimer > 0) return 'sc'
    if (hero.hitFlash > 0.4) return 'gh'
    return this.heroMoving() ? 'wl' : 'nu'
  }

  /** The hero's held-weapon animation mode (`hth` unarmed) — selects the clips. */
  heroWeaponMode(): WeaponMode {
    return this.hero.weaponMode
  }

  /**
   * How fast the hero's locomotion clip plays, relative to its own pace.
   *
   * The retail clips step in place, so the playback rate IS the speed match:
   * a hero moving slower than the clip's authored pace plays it slower, and
   * one standing still has its clock frozen (see `hero.movedLastStep`). One
   * is the clip's own rate; the hero's speed is the reference, and the ratio
   * of the speed actually covered to the speed commanded is what a blocked
   * or sliding walk changes.
   */
  heroMoveScale(): number {
    return this.moveScale(this.hero.movedLastStep, HERO.speed, this.stepSeconds())
  }

  /** Whether the hero's feet are planted (blocked) — the 3D clock stands still. */
  heroFeetPlanted(): boolean {
    return this.hero.movedLastStep <= 0
  }

  /** The same, for a monster (its profile's speed is the reference). */
  monsterMoveScale(monster: Monster): number {
    const profile = MONSTERS[monster.kind]
    return this.moveScale(monster.movedLastStep, profile.speed, this.stepSeconds())
  }

  /**
   * The playback rate for a walker: the pace it actually covered over the
   * pace it was told to cover, relative to one (the clip's own rate).
   *
   * The commanded distance is the speed times the step's duration, so a
   * walker that moved the whole way plays at 1, one that was slowed by the
   * world plays slower, and one that did not move at all is handled by the
   * caller freezing the clock.
   */
  private moveScale(moved: number, speed: number, dt: number): number {
    const commanded = speed * dt
    if (!(commanded > 0) || !(moved > 0)) return 1
    return Math.max(0.25, Math.min(2.5, moved / commanded))
  }

  /** The duration of the last simulation step, in seconds. */
  private stepSeconds(): number {
    return STEP
  }

  /** A monster's animation mode this step; same priority as {@link heroAnimMode}. */
  monsterAnimMode(monster: Monster): ActorMode {
    if (monster.hp <= 0) return 'dd'
    if (monster.castTimer > 0) return 'sc'
    if (monster.attackTimer > 0) return 'a1'
    if (monster.hitFlash > 0.4) return 'gh'
    const profile = MONSTERS[monster.kind]
    const closing =
      monster.aggro &&
      Math.hypot(this.hero.x - monster.x, this.hero.y - monster.y) > profile.range - 0.1
    return closing ? 'wl' : 'nu'
  }

  // -- HUD ------------------------------------------------------------------

  private syncHud(): void {
    const hero = this.hero
    const hud = this.hud
    hud.health.value = Math.round(hero.hp)
    hud.maxHealth.value = hero.maxHp
    hud.mana.value = Math.round(hero.mana)
    hud.maxMana.value = hero.maxMana
    hud.stamina.value = Math.round(hero.stamina)
    hud.maxStamina.value = hero.maxStamina
    hud.level.value = hero.level
    hud.xpRatio.value = hero.xp / hero.xpToNext
    hud.gold.value = hero.gold
    hud.kills.value = hero.kills
    hud.potions.value = hero.potions

    const boss = this.monsters.find((monster) => monster.kind === 'brute' && monster.hp > 0)
    hud.boss.value = boss
      ? { name: MONSTERS.brute.name, hp: boss.hp / boss.maxHp, maxHp: boss.maxHp }
      : null

    // With the retail tables present the two castable slots carry the real
    // skill's name, so the bar reads as the game's own skill rather than ours.
    const realName = (id: SkillId, fallback: string): string => {
      // The localized display name, so the bar reads "Magic Arrow" rather than
      // the table's internal key.
      if (id === 'fireball' && this.realSkills[0]) return this.realSkills[0].nameDisplay
      if (id === 'nova' && this.realSkills[1]) return this.realSkills[1].nameDisplay
      return fallback
    }

    hud.skills.value = (Object.keys(SKILLS) as SkillId[]).map((id) => {
      const remaining = this.cooldowns.get(id) ?? 0
      const affordable = id === 'potion' ? hero.potions > 0 : hero.mana >= SKILLS[id].mana
      return {
        id,
        name: realName(id, SKILLS[id].name),
        cooldown: remaining,
        maxCooldown: SKILLS[id].cooldown,
        mana: SKILLS[id].mana,
        ready: remaining <= 0,
        affordable,
      }
    })

    const threat = this.monsters
      .filter((monster) => monster.hp > 0 && monster.aggro && monster.kind === 'brute')
      .sort(
        (a, b) =>
          Math.hypot(a.x - hero.x, a.y - hero.y) - Math.hypot(b.x - hero.x, b.y - hero.y),
      )[0]
    hud.targetName.value = threat ? MONSTERS.brute.name : ''
  }

  private syncMinimap(): void {
    const ordered: MinimapBlip[] = []
    const seen = new Set<number>()

    const place = (id: number, kind: MinimapBlip['kind'], x: number, y: number): void => {
      seen.add(id)
      let blip = this.minimapBlips.get(id)
      if (!blip) {
        blip = { id, kind, x: ref(x), y: ref(y) }
        this.minimapBlips.set(id, blip)
      }
      blip.kind = kind
      blip.x.value = x
      blip.y.value = y
      ordered.push(blip)
    }

    place(0, 'hero', this.hero.x, this.hero.y)
    let budget = 26
    for (const monster of this.monsters) {
      if (monster.hp <= 0 || budget-- <= 0) continue
      place(monster.id, monster.kind === 'brute' ? 'boss' : 'monster', monster.x, monster.y)
    }
    for (const id of this.minimapBlips.keys()) {
      if (!seen.has(id)) this.minimapBlips.delete(id)
    }
    this.hud.minimap.value = ordered
  }
}

/**
 * A compact readout of a retail item's rolled stats.
 *
 * The item module can render the game's full item text, but that needs the
 * property templates; when they are not available the rolled stats themselves
 * are still real numbers, and showing them beats showing nothing.
 */
function describeItemStats(item: {
  name?: string
  rarity?: string
  baseName?: string
  stats?: readonly { property: string; value: number; min: number; max: number }[]
  minDamage?: number
  maxDamage?: number
  defense?: number
  reqLevel?: number
}): string[] {
  const lines: string[] = []
  if (item.baseName) lines.push(item.baseName)
  if (item.minDamage && item.maxDamage) lines.push(`Damage: ${item.minDamage} to ${item.maxDamage}`)
  if (item.defense) lines.push(`Defense: ${item.defense}`)
  for (const stat of item.stats ?? []) {
    const value = stat.min === stat.max ? stat.min : `${stat.min}-${stat.max}`
    lines.push(`${stat.property}: ${value}`)
  }
  if (typeof item.reqLevel === 'number' && item.reqLevel > 1) {
    lines.push(`Required Level: ${item.reqLevel}`)
  }
  return lines
}

/**
 * `charstats.txt` spells the class out; `skills.txt` uses a two-letter code.
 *
 * The two tables are keyed differently and there is no third table joining them,
 * so the mapping is stated once here rather than guessed at each call site.
 */
const CHARSTATS_CLASS_NAMES: Record<string, string> = {
  ama: 'Amazon',
  sor: 'Sorceress',
  nec: 'Necromancer',
  pal: 'Paladin',
  bar: 'Barbarian',
  dru: 'Druid',
  ass: 'Assassin',
  war: 'Warlock',
}

/** Map the item module's rarity onto the HUD's four-tier colouring. */
function mapRarity(rarity: string): Rarity {
  switch (rarity) {
    case 'unique':
      return 'unique'
    case 'set':
    case 'rare':
      return 'rare'
    case 'magic':
      return 'magic'
    default:
      return 'common'
  }
}

/** Which of the drawn icons suits an item, by its kind. */
function iconForItem(item: { kind?: string; base?: { type?: string } }): LootIcon {
  const type = item.base?.type ?? item.kind ?? ''
  if (type.includes('rune') || type.includes('Rune')) return 'rune'
  if (type.includes('armor') || type.includes('helm') || type.includes('body')) return 'armor'
  if (type.includes('ring') || type.includes('amulet')) return 'ring'
  return 'sword'
}

export function rarityColor(rarity: Rarity): string {
  switch (rarity) {
    case 'common':
      return '#e6e6e6'
    case 'magic':
      return '#6ea8ff'
    case 'rare':
      return '#ffe066'
    case 'unique':
      return '#c08bff'
  }
}

/** Exposed for the HUD, which shows the skill catalogue without the sim. */
export const SKILL_ORDER: SkillId[] = ['fireball', 'nova', 'potion']

export { MONSTERS, SKILLS }
