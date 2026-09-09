import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'node:url'
import {
  parseSpineJson,
  parseSpineBinary,
  parseSpineAtlas,
  Skeleton,
  AnimationState,
  applyAnimation,
  getAnimationDuration,
  computeAttachmentWorld,
  computeAttachmentWorldVertices,
  type SkeletonData
} from '../index'

// --- Shared fixtures ---
const here = dirname(fileURLToPath(import.meta.url))

// spineboy-pro (JSON)
const jsonPath = resolve(here, '../../../../../examples/canvas-2d/src/spineboy-pro.json')
const atlasPath = resolve(here, '../../../../../examples/canvas-2d/images/spineboy.atlas')
const data = parseSpineJson(JSON.parse(readFileSync(jsonPath, 'utf8')))
const atlas = parseSpineAtlas(readFileSync(atlasPath, 'utf8'))

// 777 (binary) — for color interpolation & FFD deform tests
const data777 = parseSpineBinary(new Uint8Array(readFileSync(join(here, '__fixtures__', '777.skel'))))

// 777 atlas (for FFD deform vertex tests)
const dir777 = resolve(here, '../../../../../examples/nikke-viewer/public')
const atlas777 = parseSpineAtlas(readFileSync(resolve(dir777, '777.atlas'), 'utf8'))
const data777Full = parseSpineBinary(new Uint8Array(readFileSync(resolve(dir777, '777.skel'))))

describe('Spine animation', () => {
  it('reports a finite, non-negative duration for every animation', () => {
    for (const name of Object.keys(data.animations)) {
      const dur = getAnimationDuration(data.animations[name])
      expect(Number.isFinite(dur)).toBe(true)
      expect(dur).toBeGreaterThanOrEqual(0)
    }
  })

  it('changes the pose over time (walk produces a different skeleton pose)', () => {
    const sk = new Skeleton(data)
    const walk = data.animations['walk']
    const snapshot = () =>
      sk.bones.map((b) => `${b.rotation.toFixed(3)},${b.x.toFixed(2)},${b.y.toFixed(2)}`).join('|')
    applyAnimation(sk, walk, 0, true)
    const pose0 = snapshot()
    applyAnimation(sk, walk, getAnimationDuration(walk) * 0.5, true)
    const pose1 = snapshot()
    expect(pose0).not.toBe(pose1)
  })

  it('produces finite geometry for every slot across all animations', () => {
    const sk = new Skeleton(data)
    const state = new AnimationState(sk)
    for (const name of state.animationNames) {
      const anim = data.animations[name]
      const dur = getAnimationDuration(anim)
      for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
        state.setAnimation(name, false)
        state.update(dur * frac)
        state.apply()
        for (const slot of sk.slots) {
          if (!slot.attachment) continue
          const att = sk.findAttachment(slot.data.name, slot.attachment)
          if (!att) continue
          const geo = computeAttachmentWorld(att, slot, sk, atlas, slot.attachment)
          if (!geo) continue
          expect(geo.world.some(Number.isNaN)).toBe(false)
          expect(geo.uvs.some(Number.isNaN)).toBe(false)
        }
      }
    }
  })

  it('solves 2-bone IK so the rear-shin tip reaches its target', () => {
    const sk = new Skeleton(data)
    const walk = data.animations['walk']
    applyAnimation(sk, walk, getAnimationDuration(walk) * 0.3, true)
    const target = sk.boneMap.get('rear-leg-target')!
    const shin = sk.boneMap.get('rear-shin')!
    // After 2-bone IK, the shin tip should land exactly on its target.
    const tipX = shin.worldX + shin.a * (shin.data.length ?? 0)
    const tipY = shin.worldY + shin.c * (shin.data.length ?? 0)
    const dist = Math.hypot(tipX - target.worldX, tipY - target.worldY)
    expect(Number.isFinite(dist)).toBe(true)
    expect(dist).toBeLessThan(1)
  })

  it('setToSetupPose resets bones to their setup values', () => {
    const sk = new Skeleton(data)
    const walk = data.animations['walk']
    applyAnimation(sk, walk, getAnimationDuration(walk) * 0.5, true)
    const animatedRot = sk.boneMap.get('hip')!.rotation
    sk.setToSetupPose()
    expect(sk.boneMap.get('hip')!.rotation).toBe(data.bones.find((b) => b.name === 'hip')!.rotation ?? 0)
    expect(sk.boneMap.get('hip')!.rotation).not.toBe(animatedRot)
  })
})

describe('attachment / color / draworder timeline edge cases', () => {
  // Minimal skeleton: three slots on one bone. `eyes` is visible in setup and
  // animated to disappear at t=2; `front` is reordered by a draworder timeline.
  const skeletonData: SkeletonData = {
    format: 'spine',
    version: '4.1',
    bones: [{ name: 'root' }],
    slots: [
      { name: 'back', bone: 'root', attachment: 'back-img' },
      { name: 'front', bone: 'root', attachment: 'front-img' },
      { name: 'eyes', bone: 'root', attachment: 'eyes-open' }
    ],
    skins: [
      {
        name: 'default',
        attachments: {
          back: { 'back-img': { type: 'region' } },
          front: { 'front-img': { type: 'region' } },
          eyes: { 'eyes-open': { type: 'region' }, 'eyes-closed': { type: 'region' } }
        }
      }
    ],
    animations: {
      soda: {
        slots: {
          // Eyes disappear (attachment -> null) at t=2, but the first keyframe
          // is NOT at t=0, so before t=2 the setup attachment must stand.
          eyes: { attachment: [{ time: 2, name: undefined }] },
          // Fade the eyes slot to alpha 0 at t=2 (color timeline, first kf > 0).
          back: { color: [{ time: 2, color: 'FFFFFF00' }] }
        },
        // front moves one slot toward the back at t=1.
        draworder: [{ time: 1, offsets: [{ slot: 'front', offset: -1 }] }]
      }
    }
  }

  it('keeps the setup attachment before the first attachment keyframe', () => {
    const sk = new Skeleton(skeletonData)
    const soda = skeletonData.animations.soda
    applyAnimation(sk, soda, 1, false) // before t=2
    expect(sk.slotMap.get('eyes')!.attachment).toBe('eyes-open')
    applyAnimation(sk, soda, 3, false) // after t=2
    expect(sk.slotMap.get('eyes')!.attachment).toBeUndefined()
  })

  it('keeps the setup color before the first color keyframe', () => {
    const sk = new Skeleton(skeletonData)
    const soda = skeletonData.animations.soda
    applyAnimation(sk, soda, 1, false) // before t=2
    expect(sk.slotMap.get('back')!.color).toBe('FFFFFFFF')
    applyAnimation(sk, soda, 3, false) // after t=2
    expect(sk.slotMap.get('back')!.color).toBe('FFFFFF00')
  })

  it('reorders drawOrder from the setup order after the first keyframe', () => {
    const sk = new Skeleton(skeletonData)
    const soda = skeletonData.animations.soda
    applyAnimation(sk, soda, 0.5, true) // before t=1
    expect(sk.drawOrder.map((s) => s.data.name)).toEqual(['back', 'front', 'eyes'])
    applyAnimation(sk, soda, 1.5, true) // after t=1
    expect(sk.drawOrder.map((s) => s.data.name)).toEqual(['front', 'back', 'eyes'])
  })
})

// ---------------------------------------------------------------------------
// Color timeline interpolation (moved from color-interpolation.test.ts)
// ---------------------------------------------------------------------------

describe('Color timeline interpolation (sampleColor)', () => {
  it('interpolates slot alpha smoothly between keyframes (not step function)', () => {
    const sk = new Skeleton(data777)
    const animName = Object.keys(data777.animations).find((n) => {
      const a = data777.animations[n]
      return a.slots && Object.values(a.slots).some((tl) => tl.color && tl.color.length > 2)
    })
    expect(animName).toBeDefined()
    const anim = data777.animations[animName!]
    const dur = getAnimationDuration(anim)

    const colorSlotName = Object.keys(anim.slots!).find((name) => {
      const tl = anim.slots![name]
      return tl.color && tl.color.length > 2
    })
    expect(colorSlotName).toBeDefined()

    const sk2 = new Skeleton(data777)
    const alphas: number[] = []
    for (let i = 0; i <= 20; i++) {
      const t = (dur * i) / 20
      applyAnimation(sk2, anim, t, true)
      const slot = sk2.slotMap.get(colorSlotName!)
      if (slot) {
        const hex = slot.color || 'FFFFFFFF'
        const a = parseInt(hex.slice(6, 8), 16)
        alphas.push(a)
      }
    }

    const distinctAlphas = new Set(alphas)
    expect(distinctAlphas.size).toBeGreaterThan(2)
  })

  it('slot.color changes over time (not stuck at FFFFFFFF)', () => {
    const sk = new Skeleton(data777)
    const animName = Object.keys(data777.animations).find((n) => {
      const a = data777.animations[n]
      return a.slots && Object.values(a.slots).some((tl) => {
        if (!tl.color || tl.color.length < 2) return false
        return tl.color.some((kf) => kf.color !== 'FFFFFFFF')
      })
    })
    expect(animName).toBeDefined()
    const anim = data777.animations[animName!]
    const dur = getAnimationDuration(anim)

    const sk2 = new Skeleton(data777)
    let sawDifferentColor = false
    const firstColor = (() => {
      applyAnimation(sk2, anim, 0, true)
      const slotName = Object.keys(anim.slots!).find((name) => {
        const tl = anim.slots![name]
        return tl.color && tl.color.some((kf) => kf.color !== 'FFFFFFFF')
      })
      if (!slotName) return 'FFFFFFFF'
      const slot = sk2.slotMap.get(slotName!)
      return slot?.color ?? 'FFFFFFFF'
    })()

    for (let i = 1; i <= 20; i++) {
      const t = (dur * i) / 20
      applyAnimation(sk2, anim, t, true)
      const slotName = Object.keys(anim.slots!).find((name) => {
        const tl = anim.slots![name]
        return tl.color && tl.color.some((kf) => kf.color !== 'FFFFFFFF')
      })
      if (slotName) {
        const slot = sk2.slotMap.get(slotName)
        if (slot && slot.color !== firstColor) {
          sawDifferentColor = true
          break
        }
      }
    }
    expect(sawDifferentColor).toBe(true)
  })

  it('setToSetupPose resets slot color to FFFFFFFF', () => {
    const sk = new Skeleton(data777)
    const anim = data777.animations[Object.keys(data777.animations)[0]]
    applyAnimation(sk, anim, 1, true)
    sk.setToSetupPose()
    for (const slot of sk.slots) {
      expect(slot.color).toBe(slot.data.color ?? 'FFFFFFFF')
    }
  })
})

// ---------------------------------------------------------------------------
// FFD deform timelines (moved from deform.test.ts)
// ---------------------------------------------------------------------------

describe('Spine deform (FFD) timelines', () => {
  it('parses deform timelines for the fixture character', () => {
    let deformAnims = 0
    let deformEntries = 0
    for (const anim of Object.values(data777Full.animations)) {
      if (anim.deform && Object.keys(anim.deform).length > 0) {
        deformAnims++
        for (const skin of Object.values(anim.deform)) {
          for (const slot of Object.values(skin)) {
            for (const att of Object.values(slot)) deformEntries += att.length
          }
        }
      }
    }
    expect(deformAnims).toBeGreaterThan(0)
    expect(deformEntries).toBeGreaterThan(0)
  })

  it('applies deform offsets to slot.deform during animation', () => {
    const sk = new Skeleton(data777Full)
    const animName = Object.keys(data777Full.animations).find((n) => {
      const a = data777Full.animations[n]
      return a.deform && Object.keys(a.deform).length > 0
    })
    expect(animName).toBeDefined()
    const anim = data777Full.animations[animName!]
    const dur = getAnimationDuration(anim)
    let maxDeformSlots = 0
    for (const frac of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      applyAnimation(sk, anim, dur * frac, true)
      let deformSlots = 0
      for (const slot of sk.slots) {
        if (slot.deform && slot.deform.length > 0) deformSlots++
      }
      maxDeformSlots = Math.max(maxDeformSlots, deformSlots)
    }
    expect(maxDeformSlots).toBeGreaterThan(0)
  })

  it('changes mesh world vertices relative to the setup pose', () => {
    const sk = new Skeleton(data777Full)
    const skSetup = new Skeleton(data777Full)
    const animName = Object.keys(data777Full.animations).find((n) => {
      const a = data777Full.animations[n]
      return a.deform && Object.keys(a.deform).length > 0
    })!
    const anim = data777Full.animations[animName]
    const dur = getAnimationDuration(anim)
    let maxDelta = 0
    for (const frac of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      applyAnimation(sk, anim, dur * frac, true)
      for (const slot of sk.slots) {
        if (!slot.attachment) continue
        const att = sk.findAttachment(slot.data.name, slot.attachment)
        if (!att || (att.type !== 'mesh' && att.type !== 'linkedmesh')) continue
        const bufA = new Float32Array(8192)
        const bufB = new Float32Array(8192)
        const nA = computeAttachmentWorldVertices(att, slot, sk, atlas777, slot.attachment, bufA)
        const attRef = skSetup.findAttachment(slot.data.name, slot.attachment)
        const nB = computeAttachmentWorldVertices(attRef, slot, skSetup, atlas777, slot.attachment, bufB)
        if (nA > 0 && nB > 0) {
          let delta = 0
          for (let i = 0; i < Math.min(nA, nB) * 2; i++) delta += Math.abs(bufA[i] - bufB[i])
          maxDelta = Math.max(maxDelta, delta)
        }
      }
    }
    expect(maxDelta).toBeGreaterThan(0.01)
  })
})
