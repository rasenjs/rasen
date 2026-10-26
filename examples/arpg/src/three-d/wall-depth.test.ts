/**
 * The wall faces a DT1 orientation names, and the depth they imply.
 *
 * The face bits are read out of the data; this pins them so a refactor cannot
 * quietly swap left and right — which would put every wall on the wrong side of
 * the character and look like a depth-sorting bug rather than a bit bug.
 */

import { describe, expect, it } from 'vitest'
import { wallDepthKey, wallFacesOf, wallOffsetOf } from './wall-depth'

describe('wallFacesOf', () => {
  it('reads one bit per face', () => {
    expect(wallFacesOf(1)).toEqual({ left: true, right: false, bottom: false, top: false })
    expect(wallFacesOf(2)).toEqual({ left: false, right: true, bottom: false, top: false })
    expect(wallFacesOf(4)).toEqual({ left: false, right: false, bottom: true, top: false })
    expect(wallFacesOf(8)).toEqual({ left: false, right: false, bottom: false, top: true })
  })

  it('reads the combinations the retail tilesets actually use', () => {
    // Measured present in act1/town/objects.dt1 and fence.dt1: 1, 2, 3, 4, 6,
    // 7, 12, 13.
    expect(wallFacesOf(3)).toEqual({ left: true, right: true, bottom: false, top: false })
    expect(wallFacesOf(6)).toEqual({ left: false, right: true, bottom: true, top: false })
    expect(wallFacesOf(12)).toEqual({ left: false, right: false, bottom: true, top: true })
    expect(wallFacesOf(13)).toEqual({ left: true, right: false, bottom: true, top: true })
  })
})

describe('wallOffsetOf', () => {
  it('puts a single-face wall half a tile out along that face', () => {
    expect(wallOffsetOf(1)).toEqual({ x: -0.5, z: 0 })
    expect(wallOffsetOf(2)).toEqual({ x: 0.5, z: 0 })
    // +Z is the diamond's lower-left edge.
    expect(wallOffsetOf(4)).toEqual({ x: 0, z: 0.5 })
    // -Z is its upper-right edge.
    expect(wallOffsetOf(8)).toEqual({ x: 0, z: -0.5 })
  })

  it('keeps an opposed pair at the tile centre', () => {
    expect(wallOffsetOf(3)).toEqual({ x: 0, z: 0 })
    expect(wallOffsetOf(12)).toEqual({ x: 0, z: 0 })
  })

  it('leans a lopsided block towards the side it covers most', () => {
    // left + bottom + top: two of its three faces are on Z, and one on -X.
    const offset = wallOffsetOf(13)
    expect(offset.x).toBeLessThan(0)
    expect(offset.z).toBeCloseTo(0, 9)
  })

  it('leaves a block with no face bits at the centre', () => {
    expect(wallOffsetOf(0)).toEqual({ x: 0, z: 0 })
  })
})

describe('wallDepthKey', () => {
  it('orders by the ground distance the camera sees', () => {
    // The camera looks from (+X, +Y, +Z), so larger x+z is nearer.
    const far = wallDepthKey(10, 10, 1)
    const near = wallDepthKey(10, 10, 2)
    expect(near).toBeGreaterThan(far)
  })

  it('separates a wall from the centre of its own tile', () => {
    // The whole point of the offset: a +X wall must sort nearer than a character
    // standing at the tile's centre, or it would not hide it.
    const centre = 20 + 20
    expect(wallDepthKey(20, 20, 2)).toBeGreaterThan(centre)
    expect(wallDepthKey(20, 20, 1)).toBeLessThan(centre)
  })

  it('a +Z wall also sorts nearer, because the camera looks along +Z too', () => {
    expect(wallDepthKey(20, 20, 4)).toBeGreaterThan(40)
    expect(wallDepthKey(20, 20, 8)).toBeLessThan(40)
  })
})
