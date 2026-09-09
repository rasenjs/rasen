/**
 * Spine clipping attachments — `computeClippingWorld` and the parsed
 * attachment shape (end slot). The renderer-side clip wiring is covered by
 * the canvas-2d component test (mock ctx path assertions).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'node:url'
import {
  parseSpineJson,
  Skeleton,
  computeClippingWorld,
  type SkeletonData
} from '../index'

const here = dirname(fileURLToPath(import.meta.url))

function makeSkeleton(attachment: SkeletonData['skins'][number]['attachments'][string][string]): Skeleton {
  const data: SkeletonData = {
    format: 'spine',
    version: '4.1.0',
    bones: [{ name: 'root' }, { name: 'b', parent: 'root', x: 10, y: 20 }],
    slots: [{ name: 'clip', bone: 'b', attachment: 'clip' }],
    skins: [{ name: 'default', attachments: { clip: { clip: attachment } } }],
    animations: {}
  }
  return new Skeleton(data)
}

describe('computeClippingWorld', () => {
  it('transforms an unweighted polygon by the slot bone', () => {
    const sk = makeSkeleton({
      type: 'clipping',
      end: 'other',
      vertexCount: 3,
      vertices: [0, 0, 10, 0, 0, 10]
    })
    const slot = sk.slotMap.get('clip')!
    const att = sk.findAttachment('clip', 'clip')!
    // Bone "b" sits at (10, 20) with identity rotation → pure translation.
    // (Bone world matrices go through cos/sin decomposition — epsilon compare.)
    const poly = computeClippingWorld(att, slot, sk)!
    expect(poly).toHaveLength(6)
    expect(poly[0]).toBeCloseTo(10, 10)
    expect(poly[1]).toBeCloseTo(20, 10)
    expect(poly[2]).toBeCloseTo(20, 10)
    expect(poly[3]).toBeCloseTo(20, 10)
    expect(poly[4]).toBeCloseTo(10, 10)
    expect(poly[5]).toBeCloseTo(30, 10)
  })

  it('evaluates weighted vertices against their bones', () => {
    // Weighted layout: [boneCount, boneIdx, x, y, weight]. Vertex (1, 2)
    // bound to bone "b" (index 1) at (10, 20) → world (11, 22).
    const sk = makeSkeleton({
      type: 'clipping',
      end: 'other',
      vertexCount: 1,
      vertices: [1, 1, 1, 2, 1],
      bones: [1, 1, 1, 2, 1]
    })
    const slot = sk.slotMap.get('clip')!
    const att = sk.findAttachment('clip', 'clip')!
    const poly = computeClippingWorld(att, slot, sk)!
    expect(poly).toHaveLength(2)
    expect(poly[0]).toBeCloseTo(11, 10)
    expect(poly[1]).toBeCloseTo(22, 10)
  })

  it('returns null for non-clipping attachments', () => {
    const sk = makeSkeleton({ type: 'region', width: 10, height: 10 })
    const slot = sk.slotMap.get('clip')!
    const att = sk.findAttachment('clip', 'clip')!
    expect(computeClippingWorld(att, slot, sk)).toBeNull()
  })

  it('parses the end slot and evaluates the real spineboy clipping fixture', () => {
    const data = parseSpineJson(
      JSON.parse(readFileSync(resolve(here, '../../../../../examples/canvas-2d/src/spineboy-pro.json'), 'utf8'))
    )
    const sk = new Skeleton(data)
    const slot = sk.slotMap.get('clipping')!
    const att = sk.findAttachment('clipping', 'clipping')!
    expect(att.type).toBe('clipping')
    expect((att as { end?: string }).end).toBe('head-bb')
    const poly = computeClippingWorld(att, slot, sk)!
    expect(poly).toHaveLength(18) // vertexCount 9
    for (const v of poly) expect(Number.isFinite(v)).toBe(true)
  })
})
