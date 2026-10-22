import { describe, expect, it } from 'vitest'
import { interleaveForPbr } from './character-material'
import { resolveChannel, type PartSpec } from './model'

function part(): PartSpec {
  return {
    vertices: new Float32Array([1, 2, 3, 4, 5, 6]),
    uv: new Float32Array([0.25, 0.75, 0.5, 0]),
    normals: new Float32Array([0, 1, 0, 0, 0, 1]),
    normalColors: new Float32Array(6),
    tangents: new Float32Array([1, 0, 0, -1, 0, 1, 0, 1]),
    textureSource: null,
  }
}

describe('character material layout', () => {
  it('interleaves [position, normal, uv, tangent] rows of 12 floats', () => {
    const out = interleaveForPbr(part())
    expect(out.length).toBe(2 * 12)
    // Vertex 0: position (1,2,3), normal (0,1,0), uv (0.25, 0.75),
    // tangent (1,0,0) with handedness -1.
    expect(Array.from(out.subarray(0, 12))).toEqual([
      1, 2, 3, 0, 1, 0, 0.25, 0.75, 1, 0, 0, -1,
    ])
    // Vertex 1 follows immediately at offset 12.
    expect(Array.from(out.subarray(12, 24))).toEqual([
      4, 5, 6, 0, 0, 1, 0.5, 0, 0, 1, 0, 1,
    ])
  })

  it('writes a zero tangent for a mesh that ships none', () => {
    // The shader reads a zero tangent as "no tangent": it falls back to the
    // screen-space derivative frame instead of shading with a broken one.
    const withoutTangents = part()
    delete withoutTangents.tangents
    const out = interleaveForPbr(withoutTangents)
    expect(Array.from(out.subarray(8, 12))).toEqual([0, 0, 0, 0])
  })
})

describe('channel resolution', () => {
  it('derives the _nrm/_orm siblings of an albedo path', () => {
    expect(resolveChannel('x/y/body_alb.texture', 'nrm')).toBe('x/y/body_nrm.texture')
    expect(resolveChannel('x/y/body_ALB.texture', 'orm')).toBe('x/y/body_orm.texture')
    expect(resolveChannel('diablo_body_burned_ALB.texture', 'nrm')).toBe('diablo_body_burned_nrm.texture')
  })

  it('refuses a path that is not an albedo', () => {
    expect(resolveChannel('x/y/body_nrm.texture', 'nrm')).toBeNull()
  })
})
