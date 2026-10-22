/**
 * The HD animation state machine.
 *
 * The retail game drives its 3D characters from an `AnimationStateMachine`
 * asset (`.scratch/gr2/diablo/diablo_state_machine.json` is one): states carry
 * `animationBindings` (weapon mode → clip-name candidates) and `loopCount`
 * (0 = loop, 1 = play once), and every transition in the table crossfades in
 * 0.2 s. This module is that machine, driven by the game's own classic actor
 * modes (`ActorMode`: `nu`/`wl`/`rn`/`a1`/`sc`/`gh`/`dd`) so the 2D layer and
 * the 3D layer animate from one state.
 *
 * Clip naming follows the retail sets:
 *
 * - player clip names carry the weapon mode as a prefix — `1hs_attack1`,
 *   `1hs_townwalk`, … (the amazon set has 213 clips across 8 weapon modes);
 * - monster and NPC sets name clips bare — `attack1`, `walk`, `neutral`.
 *
 * So a mode resolves through a candidate list × a prefix chain
 * (`<weaponMode>_<action>`, `hth_<action>`, `<action>`), and the first name the
 * set actually carries wins. A set that lacks a clip (diablo has no `gethit`)
 * keeps whatever it was playing rather than falling to a statue.
 */

import type { ActorMode } from '../d2/anim-art'

/** Crossfade length: 0.2 s on every entry of the retail transition table. */
export const CROSSFADE_SECONDS = 0.2

/** What a clip set must answer for the machine to resolve and time clips. */
export interface ClipSet {
  has(name: string): boolean
  /** Clip length in seconds (retail clip metadata). */
  duration(name: string): number
  /**
   * The clip's authored ground pace, in model units per clip-second — the rate
   * its planted foot slides backward while it is on the ground. 0 (or absent)
   * when the clip does not walk. See `AnimationRig.paceFor`.
   */
  pace?(name: string): number
}

/**
 * How the clock advances this frame.
 *
 * The retail locomotion clips step IN PLACE (the root bone's loop translation
 * is zero in every walk clip), so the ground and the animation must be tied
 * together by the game — the same job the 2D layer does with `advanceWalk`.
 * That tie is `distance`:
 *
 * - `distance` — the ground the actor actually covered this frame, in tiles.
 *   A clip with an authored `pace` is advanced by `distance × unitsPerTile /
 *   pace` clip-seconds, which is exactly the clock that leaves its planted foot
 *   stationary in the world: faster walkers cycle faster, a blocked walker
 *   stops with its feet down, and the rate can no longer jitter with a single
 *   simulation step's displacement.
 * - `timeScale` — the plain wall-clock multiplier, used by every clip that has
 *   no authored pace (idle, attacks, deaths).
 * - `frozen` — stand the clock still (a walker pushed against a wall).
 */
export interface ClockRate {
  timeScale?: number
  frozen?: boolean
  /** Ground covered this frame, in world tiles. */
  distance?: number
  /** Model units per world tile: converts `distance` into the clip's space. */
  unitsPerTile?: number
}

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

/**
 * Candidate clip suffixes per classic mode. Town swaps in the retail town
 * stances (`townneutral`/`townwalk`) the way the game does when the area is a
 * town; everything else is the same list.
 */
function candidatesFor(mode: ActorMode, town: boolean): string[] {
  switch (mode) {
    case 'nu':
      return town ? ['townneutral', 'neutral'] : ['neutral']
    case 'wl':
      return town ? ['townwalk', 'walk'] : ['walk']
    case 'rn':
      // The monster sets name their run `run`/`run2`; a set without one
      // (skeleton1, brute2) walks instead of freezing.
      return ['run', 'walk']
    case 'a1':
      return ['attack1']
    case 'sc':
      // The retail states bind "cast"; the monster sets name that clip
      // `skill1` (their state machines' Skill states bind it).
      return ['cast', 'skill1']
    case 'gh':
      return ['gethit']
    case 'dd':
      // `death` plays once and hands over to `dead`; a set with only one of the
      // two (the NPC sets have neither) still resolves through the chain.
      return ['death', 'dead']
  }
}

/** The suffix a finished one-shot hands over to. */
function followUpFor(mode: ActorMode, town: boolean): string[] {
  return mode === 'dd' ? ['dead', 'death'] : candidatesFor('nu', town)
}

/** Actions that play once (the state machine's `loopCount: 1`) and then leave. */
function isOneShot(suffix: string): boolean {
  return (
    suffix.startsWith('attack') ||
    suffix.startsWith('cast') ||
    suffix === 'gethit' ||
    suffix === 'kick' ||
    suffix === 'knockback' ||
    suffix === 'death' ||
    suffix.startsWith('fidget') ||
    suffix.startsWith('town_fidget')
  )
}

/**
 * Clips whose job is locomotion.
 *
 * Only these are treadmills in the sense the ground-lock needs: the clock runs
 * on the distance the actor covers, so the planted foot stays with the floor.
 * An attack or an idle also shifts the feet a little (the measured pace of
 * `1hs_attack1` is 2.4 model units/s), and driving those off the ground would
 * make the swing stall the moment the actor stops — so they keep the wall
 * clock.
 */
function isLocomotion(suffix: string): boolean {
  return suffix === 'walk' || suffix === 'townwalk' || suffix === 'run'
}

/** The clip a mode resolves to for this set, without starting anything. */
export function clipForMode(
  set: ClipSet,
  weaponMode: string,
  mode: ActorMode,
  town: boolean,
): string | null {
  return resolveClip(set, weaponMode, candidatesFor(mode, town))
}

/**
 * Resolve one clip name: every candidate suffix × the prefix chain, first hit
 * wins. `null` means the set has no clip for this mode at all.
 */
export function resolveClip(set: ClipSet, weaponMode: string, candidates: string[]): string | null {
  for (const suffix of candidates) {
    for (const prefix of [weaponMode, 'hth', '']) {
      const name = prefix === '' ? suffix : `${prefix}_${suffix}`
      if (set.has(name)) return name
    }
  }
  return null
}

/** The retail town fidgets the unit definitions name, in their own order. */
const FIDGETS_TOWN = ['town_fidget_01', 'town_fidget_02', 'town_fidget_03']
const FIDGETS_FIELD = ['fidget_01', 'fidget_02', 'fidget']

/** Seconds of standing around before a town NPC/hero fidgets (measured). */
const FIDGET_PERIOD = 3.7

interface Playing {
  /** Resolved suffix (the clip name minus its prefix) — the one-shot test. */
  suffix: string
  name: string
  clock: number
  oneShot: boolean
}

/**
 * One actor's animation state: resolves the mode against its clip set, plays
 * one-shots to their retail length (a locomotion request never cuts a swing
 * short, but a new ACTION — another attack, a hit reaction, a death — always
 * takes over, the way the retail transitions do), crossfades every clip change
 * in 0.2 s, and schedules fidgets while standing in town.
 */
export class AnimStateMachine {
  private current: Playing | null = null
  private fading: { name: string; clock: number } | null = null
  private fadeElapsed = 0
  private idleTimer = 0
  private fidgetIndex = 0
  private weaponMode: string

  constructor(
    /** Weapon mode prefix ('1hs', 'hth', …) — the retail `animationBindings` key. */
    weaponMode: string,
    /** Town areas play the town stances and fidget while standing. */
    private town: boolean,
  ) {
    this.weaponMode = weaponMode
  }

  /** Adopt a travel into/out of a town (the stances are per-area). */
  setTown(town: boolean): void {
    this.town = town
  }

  /**
   * Adopt a weapon change: the clip family swaps (`1hs_*` → `bow_*`) the next
   * frame, and the state machine crossfades into the new family's clip the way
   * any clip change does.
   */
  setWeaponMode(weaponMode: string): void {
    this.weaponMode = weaponMode
  }

  update(
    dt: number,
    mode: ActorMode,
    set: ClipSet | null,
    rate: ClockRate = {},
  ): AnimPose | null {
    if (set === null) return null

    // The clock the poses are read from.
    //
    // A locomotion clip is a treadmill: its planted foot slides backward at the
    // clip's authored pace. Advancing the clip by the ground the actor covered,
    // divided by that pace, makes the foot exactly stationary in the world —
    // whatever the walker's speed — and freezes it when the walker is blocked,
    // which a per-step speed ratio could not do without jittering. Everything
    // else (idle, attacks, deaths) runs on the wall clock.
    const scale = rate.timeScale ?? 1
    const locomotion = this.current !== null && isLocomotion(this.current.suffix)
    const pace = locomotion && this.current !== null ? (set.pace?.(this.current.name) ?? 0) : 0
    const step =
      rate.distance !== undefined && pace > 0
        ? (rate.distance * (rate.unitsPerTile ?? 1)) / pace
        : rate.frozen === true
          ? 0
          : dt * scale

    // Clocks advance first, so "the clip has played out" is decided on the
    // frame that completes it. The crossfade stays on wall time: it is a
    // presentation blend, not ground the actor covered.
    if (this.current !== null) this.current.clock += step
    if (this.fading !== null) {
      this.fading.clock += step
      this.fadeElapsed += rate.frozen === true ? 0 : dt
      if (this.fadeElapsed >= CROSSFADE_SECONDS) this.fading = null
    }

    const finishedOneShot =
      this.current !== null &&
      this.current.oneShot &&
      this.current.clock >= this.durationOf(set, this.current.name)
    // A finished death hands over to the corpse pose and stays there.
    const deathDone = this.current?.suffix === 'death' && finishedOneShot
    const effectiveMode: ActorMode = deathDone ? 'dd' : mode

    const desired = this.resolveDesired(effectiveMode, set, finishedOneShot)
    if (desired !== null && (this.current === null || desired.name !== this.current.name)) {
      const current = this.current
      const actionRequest = desired.oneShot
      const corpse = current !== null && (current.suffix === 'death' || current.suffix === 'dead')
      const interrupting =
        effectiveMode === 'dd' || effectiveMode === 'gh' || actionRequest || corpse
      const busy = current !== null && current.oneShot && !finishedOneShot
      if (current === null || interrupting || !busy) {
        this.start(desired)
      }
    }

    // Town fidgets: a standing character idles through the retail fidget clips.
    if (
      this.current !== null &&
      this.current.suffix !== 'death' &&
      this.current.suffix !== 'dead' &&
      mode === 'nu'
    ) {
      this.idleTimer += step
      if (this.idleTimer >= FIDGET_PERIOD && !this.current.oneShot) {
        this.idleTimer = 0
        const fidgets = this.town ? FIDGETS_TOWN : FIDGETS_FIELD
        const suffix = fidgets[this.fidgetIndex % fidgets.length]
        this.fidgetIndex += 1
        // Fallbacks cover both lists: NPC sets name their fidget `fidget_01`
        // while the player sets say `1hs_town_fidget_01`.
        const name = resolveClip(set, this.weaponMode, [suffix, ...FIDGETS_TOWN, ...FIDGETS_FIELD])
        if (name !== null) this.start({ suffix, name, oneShot: true })
      }
    } else {
      this.idleTimer = 0
    }

    const playing = this.current
    if (playing === null) return null
    return {
      name: playing.name,
      time: playing.clock,
      fade:
        this.fading === null
          ? null
          : {
              name: this.fading.name,
              time: this.fading.clock,
              alpha: Math.min(1, this.fadeElapsed / CROSSFADE_SECONDS),
            },
    }
  }

  /** The clip the current mode wants (with the finished-one-shot handover). */
  private resolveDesired(
    mode: ActorMode,
    set: ClipSet,
    finishedOneShot: boolean,
  ): { suffix: string; name: string; oneShot: boolean } | null {
    // A corpse holding `dead` never re-resolves back into its own death clip.
    if (mode === 'dd' && this.current?.suffix === 'dead') return null
    const candidates = finishedOneShot ? followUpFor(mode, this.town) : candidatesFor(mode, this.town)
    for (const suffix of candidates) {
      const name = resolveClip(set, this.weaponMode, [suffix])
      if (name !== null) return { suffix, name, oneShot: isOneShot(suffix) }
    }
    return null
  }

  private start(playing: { suffix: string; name: string; oneShot: boolean }): void {
    const previous = this.current
    if (previous !== null) {
      this.fading = { name: previous.name, clock: previous.clock }
      this.fadeElapsed = 0
    }
    this.current = { ...playing, clock: 0 }
  }

  private durationOf(set: ClipSet, name: string): number {
    const duration = set.duration(name)
    return duration > 0 ? duration : 1
  }
}
