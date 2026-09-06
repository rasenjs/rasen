import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  parseSpineBinary,
  parseSpineAtlas,
  Skeleton,
  applyAnimation,
  getAnimationDuration
} from '../index'

const here = dirname(fileURLToPath(import.meta.url))
const skelBuf = new Uint8Array(readFileSync(join(here, '__fixtures__', 'c310.skel')))
const atlasText = readFileSync(join(here, '__fixtures__', 'c310.atlas'), 'utf8')

const data = parseSpineBinary(skelBuf)
const atlas = parseSpineAtlas(atlasText)

// ---------------------------------------------------------------------------
// Path constraint tests (originally in path-constraint.test.ts)
// ---------------------------------------------------------------------------

describe('Path constraints', () => {
  it('parses path constraints from c310 binary', () => {
    expect(data.path).toBeDefined()
    expect(data.path!.length).toBeGreaterThan(0)
    // c310 has 4 path constraints: skirt_line_1..4
    const names = data.path!.map((p) => p.name)
    expect(names).toContain('skirt_line_1')
    expect(names).toContain('skirt_line_2')
    expect(names).toContain('skirt_line_3')
    expect(names).toContain('skirt_line_4')
  })

  it('parses mixRotate, mixX, mixY (not discarding mixY)', () => {
    for (const pc of data.path!) {
      // mixY must be defined and non-zero for path constraints to work
      expect(pc.mixY).toBeDefined()
      expect(typeof pc.mixY).toBe('number')
      // skirt_line constraints have mixX=1, mixY=1 in setup
      if (pc.name.startsWith('skirt_line')) {
        expect(pc.mixX).toBe(1)
        expect(pc.mixY).toBe(1)
      }
    }
  })

  it('creates path constraint runtimes with correct bone references', () => {
    const sk = new Skeleton(data)
    expect(sk.pathConstraints.length).toBeGreaterThan(0)
    for (const pc of sk.pathConstraints) {
      expect(pc.bones.length).toBeGreaterThan(0)
      expect(pc.target).toBeDefined()
      expect(pc.target.attachment).toBeDefined()
    }
  })

  it('does not produce NaN in spaces (pathEnsureArray fill(0) fix)', () => {
    const sk = new Skeleton(data)
    const anim = data.animations['idle']
    expect(anim).toBeDefined()
    applyAnimation(sk, anim!, 0, true)
    for (const pc of sk.pathConstraints) {
      for (const s of pc.spaces) {
        expect(Number.isNaN(s)).toBe(false)
        expect(Number.isFinite(s)).toBe(true)
      }
    }
  })

  it('distributes bones along the path (not all at same position)', () => {
    const sk = new Skeleton(data)
    const anim = data.animations['idle']
    applyAnimation(sk, anim!, 0.5, true)

    // Check skirt_line_1: 4 bones should be at different positions
    const pc = sk.pathConstraints.find((c) => c.data.name === 'skirt_line_1')
    expect(pc).toBeDefined()
    const boneNames = pc!.bones.map((b) => b.data.name)
    const positions = boneNames.map((n) => {
      const b = sk.bones.find((bb) => bb.data.name === n)
      return { x: b!.worldX, y: b!.worldY }
    })

    // At least 2 bones should have different positions
    const uniqueX = new Set(positions.map((p) => Math.round(p.x)))
    expect(uniqueX.size).toBeGreaterThan(1)
  })

  it('path attachment has weighted vertices (bones array present)', () => {
    const sk = new Skeleton(data)
    const pc = sk.pathConstraints.find((c) => c.data.name === 'skirt_line_1')
    expect(pc).toBeDefined()
    const slot = pc!.target
    const att = sk.findAttachment(slot.data.name, slot.attachment!)
    expect(att).toBeDefined()
    expect(att!.type).toBe('path')
    // c310 path attachments are weighted
    expect((att as any).bones).toBeDefined()
    expect((att as any).bones!.length).toBeGreaterThan(0)
  })

  it('applies path constraint across multiple animation frames without crashing', () => {
    const sk = new Skeleton(data)
    const anim = data.animations['action']
    expect(anim).toBeDefined()
    const dur = getAnimationDuration(anim!)
    // Step through 20 frames
    for (let i = 0; i < 20; i++) {
      const t = (dur * i) / 20
      applyAnimation(sk, anim!, t, true)
      // All path constraint bones should have finite positions
      for (const pc of sk.pathConstraints) {
        for (const bone of pc.bones) {
          expect(Number.isFinite(bone.worldX)).toBe(true)
          expect(Number.isFinite(bone.worldY)).toBe(true)
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Path FFD deform tests (moved from path-deform.test.ts)
// ---------------------------------------------------------------------------

describe('Path attachment FFD deform', () => {
  it('c310 action animation has path deform timelines', () => {
    const anim = data.animations['action']
    expect(anim).toBeDefined()
    expect(anim!.deform).toBeDefined()
    const pathSlotNames = new Set((data.path ?? []).map((pc) => pc.target))
    let pathDeformSlots = 0
    for (const skinDeform of Object.values(anim!.deform!)) {
      for (const slotName of Object.keys(skinDeform)) {
        if (pathSlotNames.has(slotName)) {
          const deform = skinDeform[slotName]
          if (deform && Object.keys(deform).length > 0) {
            pathDeformSlots++
          }
        }
      }
    }
    expect(pathDeformSlots).toBeGreaterThan(0)
  })

  it('slot.deform is populated for path slots during action animation', () => {
    const sk = new Skeleton(data)
    const anim = data.animations['action']
    const dur = getAnimationDuration(anim!)

    applyAnimation(sk, anim!, 0, true)

    let foundDeform = false
    for (const slot of sk.slots) {
      if (slot.deform && slot.deform.length > 0) {
        if (slot.attachment) {
          const att = sk.findAttachment(slot.data.name, slot.attachment)
          if (att?.type === 'path') {
            foundDeform = true
            const hasNonZero = slot.deform.some((v) => v !== 0)
            expect(hasNonZero).toBe(true)
            break
          }
        }
      }
    }
    expect(foundDeform).toBe(true)
  })

  it('path constraint bone positions differ with vs without deform', () => {
    const skWithDeform = new Skeleton(data)
    const skWithoutDeform = new Skeleton(data)
    const anim = data.animations['action']

    applyAnimation(skWithDeform, anim!, 3.0, true)

    applyAnimation(skWithoutDeform, anim!, 3.0, true)
    for (const slot of skWithoutDeform.slots) {
      slot.deform = null
    }
    skWithoutDeform.updateWorldTransform()

    const pc = skWithDeform.pathConstraints.find((c) => c.data.name === 'skirt_line_1')
    expect(pc).toBeDefined()
    const boneName = pc!.bones[0].data.name

    const boneWith = skWithDeform.bones.find((b) => b.data.name === boneName)
    const boneWithout = skWithoutDeform.bones.find((b) => b.data.name === boneName)
    expect(boneWith).toBeDefined()
    expect(boneWithout).toBeDefined()

    const dx = Math.abs(boneWith!.worldX - boneWithout!.worldX)
    const dy = Math.abs(boneWith!.worldY - boneWithout!.worldY)
    expect(dx + dy).toBeGreaterThan(1)
  })
})
