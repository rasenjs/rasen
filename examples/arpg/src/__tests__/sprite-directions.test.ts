/**
 * The eight sprite directions, and the world angles they stand for.
 *
 * A sprite has to face the way its unit walks ON SCREEN: walking to the
 * world's +X moves the unit to the screen's lower right, so the sprite
 * drawn for that walk has to look to the lower right too. The isometric
 * projection turns the world axes into diagonals, so the screen's compass
 * and the world's compass do not line up — getting that wrong made every
 * character walk with its shoulder to the direction it was heading.
 *
 * The retail order is the screen's compass with south first: south,
 * south-west, west, north-west, north, north-east, east, south-east.
 */

import { describe, expect, it } from 'vitest'
import { spriteDirToWorldAngle, toScreen, worldAngleToIso } from '../iso'

describe('the eight sprite directions', () => {
  it('maps a world angle to the sprite direction that faces the same way on screen', () => {
    for (let step = 0; step < 8; step += 1) {
      const worldAngle = step * (Math.PI / 4)
      const dir = worldAngleToIso(worldAngle)
      // The sprite direction stands for this world angle...
      const spriteAngle = spriteDirToWorldAngle(dir)
      // ...and the two must look the same on the screen.
      const moved = toScreen(Math.cos(worldAngle), Math.sin(worldAngle))
      const faced = toScreen(Math.cos(spriteAngle), Math.sin(spriteAngle))
      expect(faced.x).toBeCloseTo(moved.x, 6)
      expect(faced.y).toBeCloseTo(moved.y, 6)
    }
  })

  it('puts south first, the way the retail sheets are ordered', () => {
    // South is straight down the screen: the world direction that maps to
    // it is +X+Y (the isometric diagonal).
    expect(worldAngleToIso(Math.PI / 4)).toBe(0)
    // East is to the right of the screen: world +X-Y.
    expect(worldAngleToIso(-Math.PI / 4)).toBe(6)
    // West is to the left: world -X+Y.
    expect(worldAngleToIso((3 * Math.PI) / 4)).toBe(2)
    // North is up the screen: world -X-Y.
    expect(worldAngleToIso((5 * Math.PI) / 4)).toBe(4)
  })

  it('round-trips a world angle through the sprite direction', () => {
    for (let step = 0; step < 8; step += 1) {
      const worldAngle = step * (Math.PI / 4)
      expect(spriteDirToWorldAngle(worldAngleToIso(worldAngle))).toBeCloseTo(worldAngle, 6)
    }
  })
})
