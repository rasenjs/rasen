/**
 * The game's own mode numbering, and the rules that are stated in terms of it.
 *
 * `plrmode.txt` is the table that names a player's or a monster's mode — 20 rows, and
 * **the row number is the mode value the engine stores**: a unit's mode is `u32 [u+0xC]`
 * and 0 is `Death`, 1 is `Neutral`, 7 is `Attack1`. This module is that table as data,
 * because a great deal of engine behaviour is stated as a mode number and reading it
 * back out of a token is how a bug hides.
 *
 * ## Where the numbers come from, and why they can be trusted
 *
 * Two independent sources agree on the same numbering:
 *
 * - **The table itself.** `plrmode.txt`'s rows in file order are `Death`, `Neutral`,
 *   `Walk`, `Run`, `Get Hit`, `Town Neutral`, `Town Walk`, `Attack1`, `Attack2`,
 *   `Block`, `Cast`, `Throw`, `Kick`, `Skill1`..`Skill4`, `Dead`, `Sequence`,
 *   `Knock back` — and {@link PLAYER_MODES} is that order. The final two rows share the
 *   token `GH` with row 4, which is the one place the table is ambiguous and is why
 *   lookups here are by row number rather than by token.
 * - **The reference project's reading of the running game** (`rasenjs/d2r-mobile`,
 *   `dm/host/dm_hud.h`): "D2 player mode 0 = DEATH, in the death animation, 17 = DEAD,
 *   already dead; 0 -> 17 when the death animation ends, and it becomes town standing 5
 *   after reviving back in town". It also records the engine's own dead test, in the
 *   client command dispatch at `main+0x6e5c48`/`0x6e5cc8`: **a player unit whose mode is
 *   0 or 0x11 is handled as dead** — `0x11` is 17 in decimal, which is `Dead`.
 *
 * `tools/verify-modes.ts` asserts every one of those names against the exported table,
 * so a change to the numbering is a failing tool rather than a subtle behaviour change.
 *
 * ## Why the two town modes matter here
 *
 * `Town Neutral` (5) and `Town Walk` (6) are not synonyms for 1 and 2: they select
 * *different art* — the wilderness stance and the town stance are separate animations in
 * every character's COF — and the engine switches to them by area. {@link isTownArea} is
 * the rule the reference measured for when that happens.
 */

/** One `plrmode.txt` row, keyed by the mode number the engine stores. */
export interface PlayerMode {
  /** The row's index, which is the mode value. */
  readonly index: number
  /** The table's `Name` column, verbatim. */
  readonly name: string
  /** The table's `Token` column — the animation's own name, lower-cased. */
  readonly token: string
}

/**
 * `plrmode.txt`, in row order.
 *
 * Spelled out rather than parsed at runtime, because this is a *contract with the
 * engine* rather than data the app may choose to load: a mode number has to mean the
 * same thing in a build with no export as in one with it. `tools/verify-modes.ts`
 * checks it against the table.
 */
export const PLAYER_MODES: readonly PlayerMode[] = [
  { index: 0, name: 'Death', token: 'dt' },
  { index: 1, name: 'Neutral', token: 'nu' },
  { index: 2, name: 'Walk', token: 'wl' },
  { index: 3, name: 'Run', token: 'rn' },
  { index: 4, name: 'Get Hit', token: 'gh' },
  { index: 5, name: 'Town Neutral', token: 'tn' },
  { index: 6, name: 'Town Walk', token: 'tw' },
  { index: 7, name: 'Attack1', token: 'a1' },
  { index: 8, name: 'Attack2', token: 'a2' },
  { index: 9, name: 'Block', token: 'bl' },
  { index: 10, name: 'Cast', token: 'sc' },
  { index: 11, name: 'Throw', token: 'th' },
  { index: 12, name: 'Kick', token: 'kk' },
  { index: 13, name: 'Skill1', token: 's1' },
  { index: 14, name: 'Skill2', token: 's2' },
  { index: 15, name: 'Skill3', token: 's3' },
  { index: 16, name: 'Skill4', token: 's4' },
  { index: 17, name: 'Dead', token: 'dd' },
  { index: 18, name: 'Sequence', token: 'gh' },
  { index: 19, name: 'Knock back', token: 'gh' },
]

/** The mode an animation token names, or null. An ambiguous token returns the first. */
export function modeOfToken(token: string): PlayerMode | null {
  const wanted = token.trim().toLowerCase()
  return PLAYER_MODES.find((mode) => mode.token === wanted) ?? null
}

/** `mode 0` — the death *animation*, which plays before `Dead`. */
export const MODE_DEATH = 0
/** `mode 17` — dead and done animating; nothing more will play. */
export const MODE_DEAD = 17
/** `mode 1` — standing still, outside town. */
export const MODE_NEUTRAL = 1
/** `mode 5` — standing still, in town. The engine uses this after a town revive. */
export const MODE_TOWN_NEUTRAL = 5
/** `mode 6` — walking, in town. */
export const MODE_TOWN_WALK = 6

/**
 * The engine's own "is this unit dead" test.
 *
 * `mode 0 or mode 17` — the death animation counts as dead, not only its end state.
 * That is from the engine's client command dispatch (`main+0x6e5c48`/`0x6e5cc8` as
 * recorded by the reference), and it is why a death animation is never interrupted by
 * a hit: the unit is already dead as far as every other rule is concerned.
 */
export function isDeadMode(mode: number): boolean {
  return mode === MODE_DEATH || mode === MODE_DEAD
}

/**
 * The five act towns, by `levels.txt`'s `Id`.
 *
 * Recorded in the reference's own HUD header: "Area numbers of the five act towns
 * (levels.txt Id): Rogue Encampment 1, Lut Gholein 40, Kurast Docks 75, Pandemonium
 * Fortress 103, Harrogath 109" (`dm/host/dm_hud.h`, `dm_hud_area_is_town`).
 *
 * This is the rule the engine switches to the town animation modes by, and it is also
 * what makes a town a town for everything else: the area tables place no monsters in
 * one, so "is this a town" is not a guess about the name — it is five ids.
 */
export const TOWN_LEVEL_IDS: readonly number[] = [1, 40, 75, 103, 109]

/** Whether a `levels.txt` id is one of the five towns. */
export function isTownArea(levelId: number): boolean {
  return TOWN_LEVEL_IDS.includes(Math.trunc(levelId))
}

/**
 * The town waypoint object's class, per town.
 *
 * The reference's town-waypoint module names five class ids for the five acts
 * (`dm/host/dm_townwp.c:11`) and attributes them to `objects.txt` row numbers, because a
 * preset unit record's class for an object is the object's **row number** rather than its
 * `Id` column (`dm/host/dm_world.c:449-455`).
 *
 * **Four of the five survive checking against the table and the fifth does not**, which is
 * what `tools/verify-modes.ts` found: the reference pairs act 5's id 109 with class 429,
 * and row 429 is `Shrine2wilderness`. The row 430 is `WaypointExp`, and
 * `WaypointExp` is the expansion's town waypoint. So the fifth pair is off by one in the
 * reference, and this table uses the data.
 *
 * The stronger evidence is the table's own `Class` column, which names each waypoint's
 * role, so the mapping is not an inference from adjacency at all:
 *
 * | town id | row | `objects.txt` `Class` |
 * |---|---|---|
 * | 1 | 119 | `WaypointOutsideAct1` |
 * | 40 | 156 | `WaypointAct2` |
 * | 75 | 237 | `WaypointAct3` |
 * | 103 | 398 | `WaypointAct4Town` |
 * | 109 | 430 | `WaypointExp` |
 *
 * It matters because the act 1 town's own `.ds1` places twenty-five objects and **not one
 * of them is a waypoint or a stash**: the engine materialises those at room load, which is
 * the step the reference names when it says "rooms that are not loaded have no object or
 * exit data — the game generates it only when loading the room"
 * (`dm/host/dm_world.c:367`).
 */
export const TOWN_WAYPOINT_CLASS: Readonly<Record<number, number>> = {
  1: 119,
  40: 156,
  75: 237,
  103: 398,
  109: 430,
}

/** The waypoint object class for a town, or null when the id is not a town. */
export function townWaypointClass(levelId: number): number | null {
  return TOWN_WAYPOINT_CLASS[Math.trunc(levelId)] ?? null
}

/**
 * What the monster-count setting multiplies, and the measurement behind it.
 *
 * The engine's `/players N` is not a table: the reference records the chain
 * (`main+0x415db0` → `main+0x3102c0` → `main+0x1199c50(object, N)`) and the **measured**
 * effect at N = 8: "stat 100 = 8, max life floor(x4.5)"
 * (`rasenjs/d2r-mobile:dm/host/dm_hud.h`). `monster_playercount` is `itemstatcost`'s own
 * name for stat 100 — verified against the exported table, not assumed.
 *
 * The multiplier the measurement implies is the game's published one,
 * `1 + (players - 1) / 2`: 1 at one player, 4.5 at eight. That it reproduces 4.5 exactly
 * is why the arithmetic is written here rather than a table of eight numbers.
 */
export function playersLifeMultiplier(players: number): number {
  const clamped = Math.max(1, Math.min(8, Math.trunc(players)))
  return 1 + (clamped - 1) / 2
}

/**
 * What the monster-count setting multiplies experience by.
 *
 * The same shape, and it is the published rule rather than a second measurement: the
 * reference measured life, not experience. Stated as such, so a reader knows which of the
 * two has a measurement behind it.
 */
export function playersExperienceMultiplier(players: number): number {
  return playersLifeMultiplier(players)
}
