import { describe, expect, it } from 'vitest'
import {
  animStateMachine,
  CLIP_PREFIXES,
  CROSSFADE_SECONDS,
  resolveClip,
  type ClipSet,
} from './anim-state'

/** A clip set as the retail metadata makes it: names with durations. */
function setOf(clips: Record<string, number>): ClipSet {
  return {
    has: (name) => name in clips,
    duration: (name) => clips[name] ?? 0,
  }
}

/** The retail-shaped amazon subset: weapon prefix + town stances. */
const AMAZON = setOf({
  '1hs_townneutral': 2,
  '1hs_townwalk': 1,
  '1hs_neutral': 2,
  '1hs_walk': 1,
  '1hs_attack1': 0.5,
  '1hs_gethit': 0.4,
  '1hs_town_fidget_01': 0.5,
  'hth_death': 1,
  'hth_dead': 1,
})

describe('clip resolution', () => {
  it('prefers the weapon-mode prefix, then hth, then the bare name', () => {
    expect(resolveClip(AMAZON, '1hs', ['attack1'])).toBe('1hs_attack1')
    expect(resolveClip(AMAZON, '1hs', ['death'])).toBe('hth_death')
    // NPC sets name clips bare; the same chain lands on them.
    expect(resolveClip(setOf({ neutral: 1 }), 'hth', ['townneutral', 'neutral'])).toBe('neutral')
  })

  it('returns null when the set has no candidate at all', () => {
    expect(resolveClip(AMAZON, '1hs', ['knockback'])).toBeNull()
  })

  it('walks candidates in order and keeps the first hit', () => {
    expect(resolveClip(AMAZON, '1hs', ['townneutral', 'neutral'])).toBe('1hs_townneutral')
    expect(resolveClip(AMAZON, '1hs', ['run', 'walk'])).toBe('1hs_walk')
  })
})

describe('AnimStateMachine', () => {
  it('plays the town stances in town and the plain ones outside', () => {
    const town = animStateMachine('1hs', true)
    expect(town.update(0.1, 'nu', AMAZON)?.name).toBe('1hs_townneutral')
    const field = animStateMachine('1hs', false)
    expect(field.update(0.1, 'nu', AMAZON)?.name).toBe('1hs_neutral')
    expect(field.update(0.1, 'wl', AMAZON)?.name).toBe('1hs_walk')
  })

  it('keeps a one-shot playing through a walk request, then returns to neutral', () => {
    const machine = animStateMachine('1hs', true)
    machine.update(0.1, 'a1', AMAZON)
    // The mode drops back to idle immediately (the swing timer is shorter
    // than the clip) — the retail clip still plays out.
    let pose = machine.update(0.1, 'wl', AMAZON)
    expect(pose?.name).toBe('1hs_attack1')
    pose = machine.update(0.4, 'nu', AMAZON)
    // 0.1 + 0.4 = 0.5 = the clip's length: the handover starts this frame.
    expect(pose?.name).toBe('1hs_townneutral')
    expect(pose?.fade?.name).toBe('1hs_attack1')
  })

  it('switches into and out of locomotion without a crossfade', () => {
    // Standing then walking: retail starts the walk cycle on the frame the walker
    // moves. A 0.2 s blend here is 0.8 of a tile at walk speed — the character
    // slides in its standing pose, which reads as floating for a couple of steps.
    const machine = animStateMachine('1hs', true)
    expect(machine.update(0.1, 'nu', AMAZON)?.name).toBe('1hs_townneutral')
    const walking = machine.update(0.1, 'wl', AMAZON)
    expect(walking?.name).toBe('1hs_townwalk')
    expect(walking?.fade).toBeNull()

    // ...and back: stopping is instant too, or the legs keep striding on the spot.
    const standing = machine.update(0.1, 'nu', AMAZON)
    expect(standing?.name).toBe('1hs_townneutral')
    expect(standing?.fade).toBeNull()
  })

  it('still crossfades a swing handing back to a walk', () => {
    // The one-shot's own end is a blend, not a locomotion entry: the arm has to
    // come down from the swing rather than snap.
    const machine = animStateMachine('1hs', true)
    machine.update(0.1, 'a1', AMAZON)
    let pose = machine.update(0.5, 'wl', AMAZON)
    pose = machine.update(0.1, 'wl', AMAZON)
    expect(pose?.name).toBe('1hs_townwalk')
    expect(pose?.fade?.name).toBe('1hs_attack1')
  })

  it('crossfades over the retail 0.2 s and then drops the fade', () => {
    const machine = animStateMachine('1hs', true)
    machine.update(0.1, 'a1', AMAZON)
    machine.update(0.5, 'nu', AMAZON) // 0.1 + 0.5 plays the 0.5 s swing out
    const mid = machine.update(0.1, 'nu', AMAZON)
    expect(mid?.fade?.alpha).toBeCloseTo(0.5, 5)
    const done = machine.update(0.1, 'nu', AMAZON)
    expect(done?.fade).toBeNull()
    expect(CROSSFADE_SECONDS).toBe(0.2)
  })

  it('lets death and hit reactions interrupt a swing', () => {
    const machine = animStateMachine('1hs', true)
    machine.update(0.1, 'a1', AMAZON)
    const hit = machine.update(0.1, 'gh', AMAZON)
    expect(hit?.name).toBe('1hs_gethit')
    expect(hit?.fade?.name).toBe('1hs_attack1')

    machine.update(0.1, 'a1', AMAZON)
    const dying = machine.update(0.1, 'dd', AMAZON)
    expect(dying?.name).toBe('hth_death')
    expect(dying?.fade?.name).toBe('1hs_attack1')
  })

  it('falls from death to the corpse pose and stays there', () => {
    const machine = animStateMachine('1hs', true)
    machine.update(0.1, 'dd', AMAZON)
    const dying = machine.update(1.0, 'dd', AMAZON)
    expect(dying?.name).toBe('hth_dead')
    const corpse = machine.update(5, 'dd', AMAZON)
    expect(corpse?.name).toBe('hth_dead')
  })

  it('fidgets after standing around in town', () => {
    const machine = animStateMachine('1hs', true)
    for (let i = 0; i < 3; i += 1) machine.update(1, 'nu', AMAZON)
    const pose = machine.update(1, 'nu', AMAZON) // 4 s of standing
    expect(pose?.name).toBe('1hs_town_fidget_01')
  })

  it('binds pose (null) when the set carries no clip for the mode', () => {
    const machine = animStateMachine('1hs', true)
    expect(machine.update(0.1, 'sc', AMAZON)).toBeNull()
    expect(machine.update(0.1, 'sc', null)).toBeNull()
  })

  it('swaps the clip family when the weapon changes, with a crossfade', () => {
    const set = setOf({
      '1hs_townneutral': 2,
      'hth_townneutral': 2,
      '1hs_neutral': 2,
      'hth_neutral': 2,
    })
    const machine = animStateMachine('1hs', true)
    expect(machine.update(0.1, 'nu', set)?.name).toBe('1hs_townneutral')
    machine.setPrefixes(CLIP_PREFIXES('hth'))
    const pose = machine.update(0.1, 'nu', set)
    expect(pose?.name).toBe('hth_townneutral')
    expect(pose?.fade?.name).toBe('1hs_townneutral')
  })

  it('advances a locomotion clip by the ground covered, against the clip\'s own pace', () => {
    // A treadmill clip authored for a 1 tile/s walk: its planted foot slides
    // 9 model units per clip-second at 9 model units per tile.
    const set: ClipSet = {
      ...setOf({ walk: 1, neutral: 1 }),
      pace: (name) => (name === 'walk' ? 9 : 0),
    }
    const machine = animStateMachine('hth', false)
    machine.update(0, 'wl', set, { distance: 0, unitsPerTile: 9 })
    // Half a tile of ground plays half a clip-second of the authored pace.
    expect(machine.update(0, 'wl', set, { distance: 0.5, unitsPerTile: 9 })?.time).toBeCloseTo(0.5, 5)
    // A blocked walker covers no ground: its clock stops with its feet down.
    expect(machine.update(0, 'wl', set, { distance: 0, unitsPerTile: 9 })?.time).toBeCloseTo(0.5, 5)
    // Twice the pace of ground covers twice the clip time in the same distance.
    expect(machine.update(0, 'wl', set, { distance: 0.25, unitsPerTile: 9 })?.time).toBeCloseTo(0.75, 5)
  })

  it('keeps the wall clock for clips with no authored pace', () => {
    const set: ClipSet = { ...setOf({ walk: 1, neutral: 1 }), pace: () => 0 }
    const machine = animStateMachine('hth', false)
    machine.update(0, 'nu', set, { distance: 1, unitsPerTile: 9 })
    // An idle clip has no feet to plant, so it runs on the wall clock.
    expect(machine.update(0.25, 'nu', set, { distance: 1, unitsPerTile: 9 })?.time).toBeCloseTo(0.25, 5)
  })

  it('scales the clock by the walker\'s pace and freezes it when the feet are planted', () => {
    const set = setOf({ walk: 1, neutral: 1 })
    const machine = animStateMachine('hth', false)
    // A walker at half the clip's pace plays it at half speed: one second of
    // wall time advances the clip by half a second. (The first update starts
    // the clip, so the clock starts advancing from the next one.)
    machine.update(0, 'wl', set, { timeScale: 0.5 })
    machine.update(1, 'wl', set, { timeScale: 0.5 })
    expect(machine.update(0, 'wl', set, { timeScale: 0.5 })?.time).toBeCloseTo(0.5, 5)
    // Frozen (pushed against a wall): the clock stands still, so the feet do
    // not walk on the spot.
    const frozen = animStateMachine('hth', false)
    frozen.update(0, 'wl', set, { frozen: true })
    frozen.update(1, 'wl', set, { frozen: true })
    expect(frozen.update(0, 'wl', set, { frozen: true })?.time).toBeCloseTo(0, 5)
  })

  it('plays the retail monster clips: run falls back to walk, cast to skill1', () => {
    // skeleton1's set has no `run` (zombie1's does) — the actor keeps moving.
    const skeleton = setOf({ walk: 1, neutral: 1, skill1: 0.5, gethit: 0.4 })
    const machine = animStateMachine('hth', false)
    expect(machine.update(0.1, 'rn', skeleton)?.name).toBe('walk')
    // The monster sets name their cast clip `skill1` (their state machines'
    // Skill states bind it); a set with `cast` prefers it (diablo).
    expect(machine.update(0.1, 'sc', skeleton)?.name).toBe('skill1')
    expect(machine.update(0.1, 'sc', setOf({ cast: 0.5, skill1: 0.5 }))?.name).toBe('cast')
    // brutes have no cast at all: the machine holds the current clip.
    const brute = setOf({ neutral: 1, walk: 1, attack1: 0.5 })
    const bruteMachine = animStateMachine('hth', false)
    expect(bruteMachine.update(0.1, 'rn', brute)?.name).toBe('walk')
    expect(bruteMachine.update(0.1, 'sc', brute)?.name).toBe('walk')
  })
})
