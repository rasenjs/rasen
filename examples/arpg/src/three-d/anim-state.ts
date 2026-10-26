/**
 * The retail actor animation state machine.
 *
 * This is game logic, and it is written here rather than in `@rasenjs/animation`
 * on purpose: which state a mode maps to, which clip suffixes each state tries,
 * which actions may interrupt a swing, and what a corpse does are all Diablo II's
 * decisions. The library supplies the three mechanisms this is built from —
 * clip-name resolution, the playhead clock, and the crossfade weight — and
 * nothing else.
 *
 * The retail game drives its 3D characters from an `AnimationStateMachine` asset:
 * states carry `animationBindings` (weapon mode → clip-name candidates) and
 * `loopCount` (0 = loop, 1 = play once), and every transition in the table
 * crossfades in 0.2 s. That table is what {@link STATES} restates.
 *
 * Clip naming follows the retail sets, which is what {@link CLIP_PREFIXES} is:
 *
 * - player clip names carry the weapon mode as a prefix — `1hs_attack1`,
 *   `1hs_townwalk`, … (the amazon set has 213 clips across 8 weapon modes);
 * - monster and NPC sets name clips bare — `attack1`, `walk`, `neutral`.
 *
 * A set that lacks a clip (diablo has no `gethit`) keeps whatever it was playing
 * rather than freezing into a statue.
 */

import type { ActorMode } from '../d2/anim-art'

/** A set of named clips: lengths, and the ground pace each was authored for. */
export interface ClipSet {
  has(name: string): boolean
  /** Clip length in seconds. */
  duration(name: string): number
  /** The clip's authored ground pace, in clip units per second; 0 if it stays put. */
  pace?(name: string): number
}

/** How the playhead advances one frame. */
export interface ClockRate {
  /** Wall-clock multiplier (1 = the clip's own speed). */
  timeScale?: number
  /** Stand the clock still. */
  frozen?: boolean
  /** Ground covered this frame, in world tiles. */
  distance?: number
  /** Clip units per world tile. */
  unitsPerTile?: number
}

/** Crossfade length: 0.2 s on every entry of the retail transition table. */
export const CROSSFADE_SECONDS = 0.2

/** One played pose: the current clip plus the tail of the clip it replaced. */
export interface AnimPose {
  name: string
  time: number
  /** The outgoing clip while a crossfade runs; null once it has finished. */
  fade: AnimFade | null
}

export interface AnimFade {
  name: string
  time: number
  /** 0 = just started (all old pose), 1 = finished (all new pose). */
  alpha: number
}

/** The corpse state: a body that has finished dying and never re-resolves. */
export type D2State = ActorMode | 'dead'

/** One state of the retail table. */
interface ClipState {
  /** Candidate clip suffixes, first one the set carries wins. */
  clips(town: boolean): readonly string[]
  /** Plays once and then hands over (the retail `loopCount: 1`). */
  oneShot?: boolean
  /** The state a finished one-shot hands over to. */
  then?: D2State
  /** Always takes over a playing one-shot, whatever it is. */
  interrupts?: boolean
  /** The clock runs on ground covered rather than wall time. */
  locomotion?: boolean
  /** A body that stays down. */
  corpse?: boolean
  /** Standing still, so the fidget timer runs. */
  idle?: boolean
}

const STATES: Readonly<Record<D2State, ClipState>> = {
  // Town swaps in the retail town stances the way the game does when the area is
  // a town; everything else is the same list.
  nu: {
    clips: (town) => (town ? ['townneutral', 'neutral'] : ['neutral']),
    idle: true,
  },
  wl: {
    clips: (town) => (town ? ['townwalk', 'walk'] : ['walk']),
    locomotion: true,
  },
  rn: {
    // The monster sets name their run `run`/`run2`; a set without one
    // (skeleton1, brute2) walks instead of freezing.
    clips: () => ['run', 'walk'],
    locomotion: true,
  },
  a1: { clips: () => ['attack1'], oneShot: true, interrupts: true },
  sc: {
    // The retail states bind "cast"; the monster sets name that clip `skill1`
    // (their state machines' Skill states bind it).
    clips: () => ['cast', 'skill1'],
    oneShot: true,
    interrupts: true,
  },
  gh: { clips: () => ['gethit'], oneShot: true, interrupts: true },
  dd: {
    clips: () => ['death', 'dead'],
    oneShot: true,
    interrupts: true,
    then: 'dead',
  },
  dead: { clips: () => ['dead', 'death'], corpse: true },
}

/** The retail town fidgets the unit definitions name, in their own order. */
const FIDGETS_TOWN = ['town_fidget_01', 'town_fidget_02', 'town_fidget_03']
const FIDGETS_FIELD = ['fidget_01', 'fidget_02', 'fidget']

/** Seconds of standing around before a town NPC/hero fidgets (measured). */
const FIDGET_PERIOD = 3.7

/** The first `prefix + '_' + suffix` the set carries, walking both lists in order. */
function firstExistingName(
  set: ClipSet,
  prefixes: readonly string[],
  suffixes: readonly string[],
): string | null {
  for (const suffix of suffixes) {
    for (const prefix of prefixes) {
      const name = prefix === '' ? suffix : `${prefix}_${suffix}`
      if (set.has(name)) return name
    }
  }
  return null
}

/**
 * The retail naming chain: the weapon mode, the hand-to-hand family, then bare.
 *
 * This chain is this game's convention (the same action is `1hs_attack1`,
 * `hth_attack1` and `attack1` in one set), so it lives here; the library walks
 * whatever chain it is handed.
 */
export const CLIP_PREFIXES = (weaponMode: string): readonly string[] => [weaponMode, 'hth', '']

/** Resolve a clip name the way this game names them. */
export function resolveClip(
  set: ClipSet,
  weaponMode: string,
  candidates: readonly string[],
): string | null {
  return firstExistingName(set, CLIP_PREFIXES(weaponMode), candidates)
}

/** The clip a mode resolves to for this set, without starting anything. */
export function clipForMode(
  set: ClipSet,
  weaponMode: string,
  mode: ActorMode,
  town: boolean,
): string | null {
  const state = STATES[mode]
  if (state === undefined) return null
  return resolveClip(set, weaponMode, state.clips(town))
}

/** What a caller may change about a running machine. */
export interface AnimStateMachine {
  update(dt: number, mode: ActorMode, set: ClipSet | null, rate?: ClockRate): AnimPose | null
  /** Adopt a travel into or out of a town (the stances are per-area). */
  setTown(town: boolean): void
  /** Adopt a weapon change: the clip family swaps and crossfades. */
  setPrefixes(prefixes: readonly string[]): void
}

interface Playing {
  state: D2State
  name: string
  clock: number
  oneShot: boolean
}

/**
 * One actor's animation state.
 *
 * Plays one-shots to their retail length (a locomotion request never cuts a swing
 * short, but a new ACTION — another attack, a hit reaction, a death — always takes
 * over, the way the retail transitions do), crossfades every clip change in 0.2 s,
 * and schedules fidgets while standing in town.
 */
export function animStateMachine(
  /** Weapon mode prefix ('1hs', 'hth', …) — the retail `animationBindings` key. */
  weaponMode: string,
  /** Town areas play the town stances and fidget while standing. */
  town: boolean,
): AnimStateMachine {
  let prefixes = CLIP_PREFIXES(weaponMode)
  let inTown = town
  let current: Playing | null = null
  let fading: { name: string; clock: number } | null = null
  let fadeElapsed = 0
  let idleTimer = 0
  let fidgetIndex = 0

  const durationOf = (set: ClipSet, name: string): number => {
    const duration = set.duration(name)
    return duration > 0 ? duration : 1
  }

  const start = (playing: { state: D2State; name: string; clock: number; oneShot?: boolean }, oneShot?: boolean): void => {
    if (current !== null && current.name !== playing.name) {
      // A change into or out of locomotion is instant. The retail game starts the
      // walk cycle on the frame the walker starts moving; blending into it leaves
      // the legs in the standing pose while the body slides — at 4.1 tiles a second
      // a 0.2 s fade is 0.8 of a tile, which reads as the character floating for
      // the first couple of steps and then "becoming" a walk.
      const from = STATES[current.state]
      const to = STATES[playing.state]
      // Only the legs' own standing↔walking switch: a swing handing back to a walk
      // still blends, or the arm would snap down from the follow-through.
      const legsOnly =
        (from?.idle === true && to?.locomotion === true) ||
        (from?.locomotion === true && to?.idle === true) ||
        (from?.locomotion === true && to?.locomotion === true)
      if (legsOnly) {
        fading = null
      } else {
        fading = { name: current.name, clock: current.clock }
      }
      fadeElapsed = 0
    }
    current = { ...playing, oneShot: oneShot ?? playing.oneShot ?? false }
  }

  const resolveDesired = (
    mode: ActorMode,
    set: ClipSet,
    finishedOneShot: boolean,
  ): { state: D2State; name: string; clock: number; oneShot: boolean } | null => {
    // A corpse stays down: re-resolving would restart its own death clip.
    if (current !== null && STATES[current.state]?.corpse === true) return null
    const requested = STATES[mode]
    const target: D2State = finishedOneShot && requested?.then !== undefined ? requested.then : mode
    const state = STATES[target]
    if (state === undefined) return null
    for (const suffix of state.clips(inTown)) {
      const name = firstExistingName(set, prefixes, [suffix])
      if (name !== null) return { state: target, name, clock: 0, oneShot: state.oneShot === true }
    }
    return null
  }

  const update = (
    dt: number,
    mode: ActorMode,
    set: ClipSet | null,
    rate: ClockRate = {},
  ): AnimPose | null => {
    if (set === null) return null
    const requested = STATES[mode]
    if (requested === undefined) return null

    // The clock step, in clip seconds. A locomotion clip is a treadmill — the
    // retail walk clips have zero root travel — so advancing it by the ground
    // covered over its own pace is what keeps the planted foot still at any
    // speed, and what stops a blocked walker from running in place.
    const locomotion = current !== null && STATES[current.state]?.locomotion === true
    const pace = locomotion ? (set.pace?.(current!.name) ?? 0) : 0
    const step =
      rate.frozen === true
        ? 0
        : rate.distance !== undefined && pace > 0
          ? (rate.distance * (rate.unitsPerTile ?? 1)) / pace
          : dt * (rate.timeScale ?? 1)

    // Clocks advance first, so "the clip has played out" is decided on the frame
    // that completes it. The blend stays on wall time: it is presentation, not
    // ground the actor covered.
    if (current !== null) current.clock += step
    if (fading !== null) {
      fading.clock += step
      fadeElapsed += rate.frozen === true ? 0 : dt
      if (fadeElapsed >= CROSSFADE_SECONDS) fading = null
    }

    const playingState = current === null ? null : STATES[current.state]
    const finishedOneShot =
      current !== null && current.oneShot && current.clock >= durationOf(set, current.name)

    const desired = resolveDesired(mode, set, finishedOneShot)
    const changed =
      desired !== null &&
      (current === null || desired.name !== current.name || desired.state !== current.state)
    if (desired !== null && changed) {
      // A one-shot that has not finished holds the floor against a looping
      // request; an action, a hit, a death — or a body already down — takes over.
      const busy = current !== null && current.oneShot && !finishedOneShot
      const interrupting =
        requested.interrupts === true ||
        STATES[desired.state]?.oneShot === true ||
        (current !== null && STATES[current.state]?.corpse === true)
      if (current === null || interrupting || !busy) start(desired)
    }

    // Fidgets: a character standing still cycles through its fidget clips.
    if (
      current !== null &&
      requested.idle === true &&
      playingState?.corpse !== true
    ) {
      idleTimer += step
      if (idleTimer >= FIDGET_PERIOD && !current.oneShot) {
        idleTimer = 0
        const fidgets = inTown ? FIDGETS_TOWN : FIDGETS_FIELD
        const chosen = fidgets[fidgetIndex % fidgets.length]
        fidgetIndex += 1
        // Both lists are tried after the chosen name: NPC sets say `fidget_01`
        // while the player sets spell it `1hs_town_fidget_01`.
        const name = firstExistingName(set, prefixes, [chosen, ...FIDGETS_TOWN, ...FIDGETS_FIELD])
        if (name !== null) start({ state: mode, name, clock: 0 }, true)
      }
    } else {
      idleTimer = 0
    }

    const playing = current
    if (playing === null) return null
    return {
      name: playing.name,
      time: playing.clock,
      fade:
        fading === null
          ? null
          : {
              name: fading.name,
              time: fading.clock,
              alpha: Math.min(1, fadeElapsed / CROSSFADE_SECONDS),
            },
    }
  }

  return {
    update,
    setTown: (next: boolean) => {
      inTown = next
    },
    setPrefixes: (next: readonly string[]) => {
      prefixes = next
    },
  }
}
