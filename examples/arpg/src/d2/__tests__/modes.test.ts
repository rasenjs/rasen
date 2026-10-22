import { describe, expect, it } from 'vitest'
import {
  MODE_DEAD,
  MODE_DEATH,
  MODE_NEUTRAL,
  MODE_TOWN_NEUTRAL,
  MODE_TOWN_WALK,
  PLAYER_MODES,
  TOWN_LEVEL_IDS,
  TOWN_WAYPOINT_CLASS,
  isDeadMode,
  isTownArea,
  modeOfToken,
  playersExperienceMultiplier,
  playersLifeMultiplier,
  townWaypointClass,
} from '../modes'

/**
 * The mode numbering is a contract with the engine rather than data, so these tests are
 * the contract written down. `tools/verify-modes.ts` checks the same numbers against
 * `plrmode.txt`; this file keeps them honest without an export present.
 */
describe('the player mode numbering', () => {
  it('numbers the modes the way plrmode.txt orders them', () => {
    expect(PLAYER_MODES.map((mode) => mode.name)).toEqual([
      'Death',
      'Neutral',
      'Walk',
      'Run',
      'Get Hit',
      'Town Neutral',
      'Town Walk',
      'Attack1',
      'Attack2',
      'Block',
      'Cast',
      'Throw',
      'Kick',
      'Skill1',
      'Skill2',
      'Skill3',
      'Skill4',
      'Dead',
      'Sequence',
      'Knock back',
    ])
    // The index is the position, which is what makes it usable as the mode value.
    for (const [position, mode] of PLAYER_MODES.entries()) expect(mode.index).toBe(position)
  })

  it('reads a token back to its mode', () => {
    expect(modeOfToken('NU')?.index).toBe(MODE_NEUTRAL)
    expect(modeOfToken(' tn ')?.index).toBe(MODE_TOWN_NEUTRAL)
    expect(modeOfToken('tw')?.index).toBe(MODE_TOWN_WALK)
    expect(modeOfToken('nope')).toBeNull()
    // `gh`, `GH` and `gh` are the table's one ambiguity: three rows share a token, so a
    // lookup by token answers the first and cannot distinguish them.
    expect(PLAYER_MODES.filter((mode) => mode.token === 'gh').length).toBe(3)
    expect(modeOfToken('gh')?.index).toBe(4)
  })

  it("uses the engine's own dead test: the death animation counts as dead", () => {
    expect(isDeadMode(MODE_DEATH)).toBe(true)
    expect(isDeadMode(MODE_DEAD)).toBe(true)
    // The reference records the test as "mode 0 or 0x11", so the second number is this.
    expect(MODE_DEAD).toBe(0x11)
    for (const alive of [MODE_NEUTRAL, MODE_TOWN_NEUTRAL, MODE_TOWN_WALK, 7, 10]) {
      expect(isDeadMode(alive)).toBe(false)
    }
  })
})

describe('the five towns', () => {
  it('knows the ids the reference measured', () => {
    expect([...TOWN_LEVEL_IDS]).toEqual([1, 40, 75, 103, 109])
    expect(isTownArea(1)).toBe(true)
    expect(isTownArea(40)).toBe(true)
    expect(isTownArea(109)).toBe(true)
    // The Blood Moor is the area next to the act 1 town and is not one.
    expect(isTownArea(2)).toBe(false)
    expect(isTownArea(0)).toBe(false)
  })

  it("gives each town its own waypoint object, and no other id one", () => {
    // The act 1 town's waypoint, from `objects.txt` row 119 (`WaypointOutsideAct1`).
    expect(townWaypointClass(1)).toBe(119)
    expect(townWaypointClass(109)).toBe(430)
    expect(townWaypointClass(2)).toBeNull()
    expect(Object.keys(TOWN_WAYPOINT_CLASS)).toHaveLength(TOWN_LEVEL_IDS.length)
  })
})

describe('the monster-count setting', () => {
  it('multiplies life by 1 + (players - 1) / 2', () => {
    expect(playersLifeMultiplier(1)).toBe(1)
    expect(playersLifeMultiplier(2)).toBe(1.5)
    expect(playersLifeMultiplier(3)).toBe(2)
    // The one value the reference measured on a running game.
    expect(playersLifeMultiplier(8)).toBe(4.5)
  })

  it('clamps to the eight steps the game offers', () => {
    expect(playersLifeMultiplier(0)).toBe(1)
    expect(playersLifeMultiplier(-3)).toBe(1)
    expect(playersLifeMultiplier(99)).toBe(4.5)
    expect(playersLifeMultiplier(2.7)).toBe(1.5)
  })

  it('is the same shape for experience, and says so', () => {
    // Stated as the published rule rather than a second measurement; see the module.
    for (const players of [1, 2, 5, 8]) {
      expect(playersExperienceMultiplier(players)).toBe(playersLifeMultiplier(players))
    }
  })
})
