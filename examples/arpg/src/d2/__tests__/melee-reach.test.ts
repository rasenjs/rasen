/**
 * How far a melee attack reaches.
 *
 * The bug this pins: reach used to be one invented constant (`1.55`) measured
 * between CENTRES, so a monster three tiles wide could stand with its body against
 * the hero and still be out of range — its centre was far even though its edge was
 * close. The game measures the gap between bodies, which is one tile plus half of
 * the target's own width.
 */

import { describe, expect, it } from 'vitest'
import { meleeReachTiles } from '../../game'

describe('meleeReachTiles', () => {
  it('grows with the target body', () => {
    // A 1x1 monster keeps the old feel; a 3x3 one is hittable from a full tile
    // further out, which is what its body occupies.
    expect(meleeReachTiles(1)).toBe(1.5)
    expect(meleeReachTiles(2)).toBe(2)
    expect(meleeReachTiles(3)).toBe(2.5)
  })

  it('adds a weapon rangeadder in sub-tiles', () => {
    // A spear is rangeadder 4: four sub-tiles of five, so 0.8 of a tile on top of
    // the bare-handed reach against the same body.
    const bare = meleeReachTiles(1)
    expect(meleeReachTiles(1, 4) - bare).toBeCloseTo(0.8, 6)
  })

  it('reaches a wide monster its centre alone would put out of range', () => {
    const distance = 2.2
    expect(distance).toBeGreaterThan(1.5) // a 1x1 body: out of reach
    expect(distance).toBeLessThanOrEqual(meleeReachTiles(3)) // a 3x3 body: in reach
  })
})
