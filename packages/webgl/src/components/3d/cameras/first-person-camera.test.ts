import { describe, expect, it } from 'vitest'
import { forwardVector, rightVector } from './first-person-camera'

describe('forwardVector', () => {
  it('faces -Z at yaw = 0, pitch = 0', () => {
    const v = forwardVector(0, 0)
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(0)
    expect(v.z).toBeCloseTo(-1)
  })

  it('yaw = π/2 faces +X (turning right)', () => {
    const v = forwardVector(Math.PI / 2, 0)
    expect(v.x).toBeCloseTo(1)
    expect(v.y).toBeCloseTo(0)
    expect(v.z).toBeCloseTo(0)
  })

  it('pitch = π/2 faces straight up', () => {
    const v = forwardVector(0, Math.PI / 2)
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(1)
    expect(v.z).toBeCloseTo(0)
  })

  it('pitch = -π/2 faces straight down', () => {
    const v = forwardVector(0, -Math.PI / 2)
    expect(v.y).toBeCloseTo(-1)
  })

  it('is a unit vector for any yaw/pitch', () => {
    for (const [yaw, pitch] of [
      [0.7, 0.3],
      [-1.2, 0.5],
      [2.0, -0.4],
      [0.1, -1.3],
    ] as const) {
      const v = forwardVector(yaw, pitch)
      const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
      expect(len).toBeCloseTo(1, 6)
    }
  })
})

describe('rightVector', () => {
  it('is +X at yaw = 0', () => {
    const v = rightVector(0)
    expect(v.x).toBeCloseTo(1)
    expect(v.y).toBeCloseTo(0)
    expect(v.z).toBeCloseTo(0)
  })

  it('is -Z at yaw = π/2 (perpendicular to forward)', () => {
    const v = rightVector(Math.PI / 2)
    expect(v.x).toBeCloseTo(0)
    expect(v.z).toBeCloseTo(1)
  })

  it('stays on the XZ plane', () => {
    const v = rightVector(1.3)
    expect(v.y).toBeCloseTo(0)
  })
})
