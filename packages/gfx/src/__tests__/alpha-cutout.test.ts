/**
 * Alpha cutout: the shader throws away transparent pixels instead of blending
 * them, and the batch keeps items that disagree about the cutoff apart.
 *
 * The second half matters as much as the first: the cutoff is a shader UNIFORM,
 * so if two items with different cutoffs merged into one draw, one of them would
 * silently render with the other's threshold.
 */

import { describe, expect, it } from 'vitest'
import { cutoffByteOf, mergedGroupKey, type BatchItem } from '../renderer/base'
import { DEFAULT_FRAGMENT_SHADER_ES3 } from '../renderer/gl/shader'

/** The minimum an item needs for the grouping rules under test. */
function item(over: Partial<BatchItem> = {}): BatchItem {
  return {
    vertices: new Float32Array(9),
    color: { r: 1, g: 1, b: 1, a: 1 },
    transform: {} as never,
    ...over,
  }
}

describe('the cutout in the shader', () => {
  it('declares the uniform and discards below it', () => {
    expect(DEFAULT_FRAGMENT_SHADER_ES3).toContain('uniform float u_alphaCutoff;')
    expect(DEFAULT_FRAGMENT_SHADER_ES3).toContain(
      'if (u_alphaCutoff > 0.0 && alpha < u_alphaCutoff) discard;',
    )
  })

  it('tests the alpha BEFORE anything consumes it', () => {
    // The discard has to sit between the alpha being known and the lighting /
    // tonemap writing a colour, or a discarded pixel would still have shaded.
    const text = DEFAULT_FRAGMENT_SHADER_ES3
    const alpha = text.indexOf('float alpha = base.a * v_color.a;')
    const cut = text.indexOf('u_alphaCutoff) discard')
    const lighting = text.indexOf('if (u_useLighting)')
    expect(alpha).toBeGreaterThan(0)
    expect(cut).toBeGreaterThan(alpha)
    expect(lighting).toBeGreaterThan(cut)
  })

  it('leaves the test off by default, so nothing existing changes', () => {
    // The uniform is 0 unless asked for, and 0 disables the test.
    expect(cutoffByteOf(item())).toBe(0)
    expect(cutoffByteOf(item({ alphaCutoff: 0 }))).toBe(0)
  })
})

describe('batching by cutoff', () => {
  it('gives two different cutoffs different group keys', () => {
    const a = item({ alphaCutoff: 0.5 })
    const b = item({ alphaCutoff: 0.25 })
    expect(mergedGroupKey(a)).not.toBe(mergedGroupKey(b))
  })

  it('gives the same cutoff the same group key', () => {
    expect(mergedGroupKey(item({ alphaCutoff: 0.5 }))).toBe(
      mergedGroupKey(item({ alphaCutoff: 0.5 })),
    )
  })

  it('separates a cutout item from a blended one', () => {
    expect(mergedGroupKey(item({ alphaCutoff: 0.5 }))).not.toBe(mergedGroupKey(item()))
  })

  it('keeps every other flag meaningful alongside the cutoff', () => {
    // The cutoff occupies bits 8+; the existing flags live below.
    const plain = mergedGroupKey(item({ alphaCutoff: 0.5 }))
    const textured = mergedGroupKey(item({ alphaCutoff: 0.5, texture: 7 as never }))
    expect(textured).not.toBe(plain)
    expect(textured & 0xff).toBe(4)
    expect(plain >> 8).toBe(128)
  })

  it('rounds the cutoff to a byte, and clamps', () => {
    expect(cutoffByteOf(item({ alphaCutoff: 1 }))).toBe(255)
    expect(cutoffByteOf(item({ alphaCutoff: 2 }))).toBe(255)
    expect(cutoffByteOf(item({ alphaCutoff: -1 }))).toBe(0)
  })
})
