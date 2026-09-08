/**
 * Multi-skin (combined skins) support — official Spine `addSkin` semantics.
 *
 * NIKKE models keep accessory parts (e.g. c810's wingman pod) in a separate
 * skin that must be combined with the default one. These tests pin the lookup
 * chain (`skin` → `extraSkins` → `default`) across attachment resolution,
 * linkedmesh parent resolution, and deform timeline compilation.
 */

import { describe, it, expect } from 'vitest'
import {
  Skeleton,
  applyAnimation,
  computeAttachmentWorld,
  type SkeletonData,
  type SpineAtlas
} from '../index'

function makeData(): SkeletonData {
  const mesh = {
    type: 'mesh' as const,
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    triangles: [0, 1, 2, 0, 2, 3],
    vertices: [0, 0, 10, 0, 10, 10, 0, 10]
  }
  return {
    format: 'spine',
    version: '4.1.0',
    bones: [{ name: 'root' }],
    slots: [
      { name: 'body', bone: 'root', attachment: 'body' },
      { name: 'pod', bone: 'root', attachment: 'pod' }
    ],
    skins: [
      {
        name: 'default',
        attachments: {
          body: { body: { type: 'region', width: 10, height: 10 } }
        }
      },
      {
        name: 'acc',
        attachments: {
          pod: { pod: mesh }
        }
      }
    ],
    animations: {}
  }
}

const stubAtlas = { regions: {}, pages: [] } as unknown as SpineAtlas

describe('Skeleton.findAttachment with combined skins', () => {
  it('resolves attachments from an extra skin (the default fallback misses)', () => {
    const sk = new Skeleton(makeData())
    // Without extras the pod attachment only exists in "acc" — unresolvable.
    expect(sk.findAttachment('pod', 'pod')).toBeUndefined()

    sk.extraSkins = ['acc']
    expect(sk.findAttachment('pod', 'pod')).toBeDefined()
  })

  it('keeps the primary skin ahead of extras (first match wins)', () => {
    const data = makeData()
    // "main" overrides the body attachment.
    data.skins.splice(1, 0, {
      name: 'main',
      attachments: { body: { body: { type: 'region', width: 99, height: 99 } } }
    })
    const sk = new Skeleton(data, 'main')
    sk.extraSkins = ['acc']
    expect(sk.findAttachment('body', 'body')?.width).toBe(99)
  })

  it('still falls back to the default skin when no active skin has the attachment', () => {
    const sk = new Skeleton(makeData())
    sk.extraSkins = ['acc']
    // "body" lives only in "default".
    expect(sk.findAttachment('body', 'body')).toBeDefined()
  })

  it('ignores unknown extra skin names', () => {
    const sk = new Skeleton(makeData())
    sk.extraSkins = ['nope']
    expect(sk.findAttachment('pod', 'pod')).toBeUndefined()
  })
})

describe('linkedmesh parent resolution through combined skins', () => {
  function linkedData(): SkeletonData {
    const data = makeData()
    const podSlot = data.skins[1].attachments.pod
    // The slot's visible attachment is a linked mesh whose parent mesh lives
    // in the "acc" skin under a different attachment name.
    podSlot.pod = { type: 'linkedmesh', parent: 'mesh_src' }
    podSlot.mesh_src = {
      type: 'mesh',
      uvs: [0, 0, 1, 0, 1, 1, 0, 1],
      triangles: [0, 1, 2, 0, 2, 3],
      vertices: [1, 2, 3, 4, 5, 6, 7, 8]
    }
    return data
  }

  it('resolves the parent mesh from an extra skin', () => {
    const sk = new Skeleton(linkedData())
    sk.extraSkins = ['acc']
    const slot = sk.slotMap.get('pod')!
    const att = sk.findAttachment('pod', 'pod')!
    const geo = computeAttachmentWorld(att, slot, sk, stubAtlas, 'pod')
    expect(geo).not.toBeNull()
    expect(geo!.world).toHaveLength(8)
    ;[1, 3, 5, 7].forEach((v, i) => expect(geo!.world[2 * i]).toBeCloseTo(v, 10))
    ;[2, 4, 6, 8].forEach((v, i) => expect(geo!.world[2 * i + 1]).toBeCloseTo(v, 10))
    expect(geo!.triangles).toEqual([0, 1, 2, 0, 2, 3])
  })

  it('returns no geometry when the parent mesh is unreachable', () => {
    const sk = new Skeleton(linkedData())
    sk.extraSkins = ['acc']
    const slot = sk.slotMap.get('pod')!
    // Parent name that no skin defines.
    const att = { type: 'linkedmesh' as const, parent: 'missing' }
    expect(computeAttachmentWorld(att, slot, sk, stubAtlas, 'pod')).toBeNull()
  })
})

describe('deform timelines under combined skins', () => {
  function deformData(): { data: SkeletonData; anim: SkeletonData['animations'][string] } {
    const data = makeData()
    const podSlot = data.skins[1].attachments.pod
    podSlot.pod = {
      type: 'mesh',
      uvs: [0, 0, 1, 0, 1, 1, 0, 1],
      triangles: [0, 1, 2, 0, 2, 3],
      vertices: [0, 0, 10, 0, 10, 10, 0, 10]
    }
    // Deform keyed under the "acc" skin (official binary layout).
    const anim = {
      deform: {
        acc: {
          pod: {
            pod: [{ time: 0, vertices: [3, 4] }]
          }
        }
      }
    }
    return { data, anim }
  }

  it('applies a deform keyed under an extra skin', () => {
    const { data, anim } = deformData()
    const sk = new Skeleton(data)
    sk.extraSkins = ['acc']
    applyAnimation(sk, anim as never, 0, false)
    const deform = sk.slotMap.get('pod')!.deform
    expect(deform).not.toBeNull()
    expect(Array.from(deform as Float64Array).slice(0, 2)).toEqual([3, 4])
    // Padded tail stays zero (keyframe shorter than deformLength).
    expect(Array.from(deform as Float64Array).slice(2)).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('does not apply an extra-skin deform when extras are absent', () => {
    const { data, anim } = deformData()
    const sk = new Skeleton(data)
    applyAnimation(sk, anim as never, 0, false)
    expect(sk.slotMap.get('pod')!.deform).toBeNull()
  })
})
