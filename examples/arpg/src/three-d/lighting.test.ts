import { describe, expect, it } from 'vitest'
import {
  AMBIENT_GROUND,
  AMBIENT_SKY,
  CAMERA_DIRECTION,
  FILL_DIRECTION,
  LIGHT_COLOR,
  LIGHT_DIRECTION,
  LIGHT_ELEVATION,
  SHADOW_DIRECTION,
  shadowReach,
} from './lighting'

/** Dot product of two 3-vectors. */
function dot(a: readonly number[], b: readonly number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

describe('the lighting rig', () => {
  it('points the key light at the camera-facing side, not away from it', () => {
    // The batch's own `u_lightDir` is a BACK light: it points away from the
    // camera, so the side the player looks at gets ambient only. The rig's
    // key light has to be on the camera's side.
    const batchLight = [-0.906308, 0.323744, -0.271654]
    expect(dot(batchLight, CAMERA_DIRECTION)).toBeLessThan(0)
    expect(dot(LIGHT_DIRECTION, CAMERA_DIRECTION)).toBeGreaterThan(0.3)
  })

  it('keeps the key light above the horizon', () => {
    expect(LIGHT_DIRECTION[1]).toBeGreaterThan(0.5)
    expect(LIGHT_ELEVATION).toBeGreaterThan(Math.PI / 4)
  })

  it('is a unit vector', () => {
    expect(Math.hypot(...LIGHT_DIRECTION)).toBeCloseTo(1, 6)
    expect(Math.hypot(...FILL_DIRECTION)).toBeCloseTo(1, 6)
  })

  it('puts the fill on the other side of the key light', () => {
    // A fill on the key's side would flatten the form it is meant to keep.
    expect(dot(LIGHT_DIRECTION, FILL_DIRECTION)).toBeLessThan(0.6)
  })

  it('keeps the ambient pair averaging the batch flat ambient', () => {
    // The lit side of a character has to reach the albedo's own level — that
    // is where the 2D art sits (the retail textures, drawn through the
    // batch's unlit path).
    for (let c = 0; c < 3; c += 1) {
      const average = (AMBIENT_SKY[c] + AMBIENT_GROUND[c]) / 2
      expect(average).toBeGreaterThan(0.4)
      expect(average).toBeLessThan(0.6)
    }
  })

  it('reproduces the key strength as a radiance', () => {
    // `albedo/π · lightColor` has to come back to the albedo level.
    for (const channel of LIGHT_COLOR) {
      expect(channel / Math.PI).toBeCloseTo(0.55, 6)
    }
  })

  it('puts the lit side of a character at the albedo level', () => {
    // The ambient plus the key: the same level the 2D art sits at.
    const ambient = (AMBIENT_SKY[0] + AMBIENT_GROUND[0]) / 2
    const key = LIGHT_COLOR[0] / Math.PI
    expect(ambient + key).toBeGreaterThan(0.9)
    expect(ambient + key).toBeLessThan(1.15)
  })
})

describe('the shadow geometry', () => {
  it('falls away from the light', () => {
    // The shadow of a body lies AWAY from the light, along the light's
    // ground direction.
    const dotLight = SHADOW_DIRECTION[0] * LIGHT_DIRECTION[0] + SHADOW_DIRECTION[1] * LIGHT_DIRECTION[2]
    expect(dotLight).toBeLessThan(0)
  })

  it('is a unit vector in the ground plane', () => {
    expect(Math.hypot(SHADOW_DIRECTION[0], SHADOW_DIRECTION[1])).toBeCloseTo(1, 6)
  })

  it('reaches further for a taller body', () => {
    // The shadow of a vertical edge reaches height / tan(elevation).
    expect(shadowReach(1)).toBeCloseTo(1 / Math.tan(LIGHT_ELEVATION), 6)
    expect(shadowReach(2)).toBeGreaterThan(shadowReach(1))
  })
})